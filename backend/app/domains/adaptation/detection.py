"""Real, deterministic detection — "did something change that matters,"
never AI-decided. Two independent triggers:

- `detect_incident_impact` — a FastAPI `BackgroundTask` fired by
  `app/domains/safety/router.py`'s `create_incident`, right after a real
  incident report commits. A one-shot reaction to a real event, never a
  polling timer.
- `check_crowd_adaptations` — a manual, user-initiated check
  (`POST /trips/{id}/adaptations/check`) since `crowd.crowd_cells` has no
  discrete "something happened" row to hook a background task onto (it's
  only ever written by the one-time seed script).

Both hand off to `app/domains/adaptation/service.py`'s `process_event` for
the cooldown-check-then-AI-assisted-proposal step.
"""

import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

from geoalchemy2.shape import to_shape
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session_factory
from app.domains.adaptation.models import AdaptationEvent, AdaptationEventType, AdaptationProposal
from app.domains.adaptation.service import process_event
from app.domains.crowd.engine import latest_risk_score
from app.domains.safety.models import Incident
from app.domains.tourism.models import Attraction
from app.domains.travel.models import Itinerary, ItineraryItem, Trip, TripStatus
from app.domains.travel.routing import BUFFER_METERS


def _to_point(wkb_element: Any) -> Any:
    """Same GeoAlchemy2 str-vs-WKBElement mypy workaround as `travel/
    planner.py`'s `_to_point` — a Geography column is typed `str` for
    mypy but is a real `WKBElement` at runtime once fetched."""
    return to_shape(wkb_element)

_SEVERITY_KEYWORDS = {
    "critical": "HIGH",
    "severe": "HIGH",
    "high": "HIGH",
    "low": "LOW",
    "minor": "LOW",
}
"""`safety.Incident.severity` is genuinely unconstrained free text (no
enum/constraint anywhere in this codebase) — this is a documented
best-effort keyword mapping, never treated as authoritative. An unmatched
value defaults to MEDIUM with a correspondingly lower confidence, rather
than guessing HIGH or LOW."""

_CROWD_DELTA_THRESHOLD = 0.15
"""Only a real *increase* in crowd risk is actionable — a decrease is good
news, not something to replan around."""
_CROWD_DELTA_HIGH_THRESHOLD = 0.30

_INACTIVE_TRIP_STATUSES = (TripStatus.CANCELLED, TripStatus.COMPLETED)


def classify_incident_severity(incident: Incident) -> tuple[str, float]:
    raw = (incident.severity or "").strip().lower()
    for keyword, severity in _SEVERITY_KEYWORDS.items():
        if keyword in raw:
            return severity, 0.8
    return "MEDIUM", 0.5


def _incident_dedup_key(incident_id: uuid.UUID, item_id: uuid.UUID) -> str:
    """Id-based — an incident has a durable identity, so no time bucket is
    needed the way `_crowd_dedup_key` needs one."""
    return hashlib.sha256(f"SAFETY_CHANGE:{incident_id}:{item_id}".encode()).hexdigest()


def _crowd_dedup_key(trip_id: uuid.UUID, itinerary_id: uuid.UUID, now: datetime) -> str:
    """Hour-bucketed — there's no discrete source row (like an incident)
    to key off, so this is the honest substitute: at most one CROWD_CHANGE
    event per trip per hour."""
    hour_bucket = now.replace(minute=0, second=0, microsecond=0).isoformat()
    return hashlib.sha256(f"CROWD_CHANGE:{trip_id}:{itinerary_id}:{hour_bucket}".encode()).hexdigest()


async def _find_impacted_items(session: AsyncSession, incident: Incident) -> list[tuple[ItineraryItem, Itinerary, Trip]]:
    """Real, current (max-version), not-yet-completed itinerary items on an
    active trip, whose real attraction point is within `BUFFER_METERS` of
    the incident — the exact same corridor-buffer convention
    `travel/routing.py`'s safe-route scoring already uses for "incident
    near this route", applied to "incident near this itinerary item"."""
    point = _to_point(incident.location)
    incident_geog = func.ST_GeogFromText(f"SRID=4326;POINT({point.x} {point.y})")

    current_itin = (
        select(Itinerary.trip_id, func.max(Itinerary.version).label("v")).group_by(Itinerary.trip_id).subquery()
    )
    result = await session.execute(
        select(ItineraryItem, Itinerary, Trip)
        .join(Attraction, ItineraryItem.attraction_id == Attraction.id)
        .join(Itinerary, ItineraryItem.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .join(current_itin, (current_itin.c.trip_id == Itinerary.trip_id) & (current_itin.c.v == Itinerary.version))
        .where(
            ItineraryItem.completed.is_(False),
            Trip.status.not_in(_INACTIVE_TRIP_STATUSES),
            func.ST_DWithin(Attraction.location, incident_geog, BUFFER_METERS),
        )
    )
    return list(result.all())


async def detect_incident_impact(incident_id: uuid.UUID) -> None:
    """Opens its own session — the request's session is already closed by
    the time a `BackgroundTask` runs. Escalates to the service role since
    `safety.incidents` has RLS and no end-user principal exists in this
    context (same escape hatch `core/notify.py`'s `notify()` already
    uses)."""
    async with get_session_factory()() as session:
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        incident = await session.get(Incident, incident_id)
        if incident is None:
            return

        severity, confidence = classify_incident_severity(incident)
        matches = await _find_impacted_items(session, incident)
        now = datetime.now(UTC)

        for item, itinerary, trip in matches:
            event = AdaptationEvent(
                event_type=AdaptationEventType.SAFETY_CHANGE,
                trip_id=trip.id,
                itinerary_item_id=item.id,
                destination_id=itinerary.destination_id,
                source_entity_type="incident",
                source_entity_id=incident.id,
                severity=severity,
                confidence=confidence,
                observed_at=incident.created_at,
                received_at=now,
                deduplication_key=_incident_dedup_key(incident.id, item.id),
                context={"incident_type": incident.incident_type, "incident_severity_raw": incident.severity},
            )
            try:
                async with session.begin_nested():
                    session.add(event)
                    await session.flush()
            except IntegrityError:
                # Already have an event for this exact incident+item pair
                # (a real race, or a re-run) — the unique deduplication_key
                # constraint caught it; skip, don't create a second one.
                continue
            await session.commit()

            # session.get() would short-circuit to the identity map without
            # applying the loader option if this Itinerary is already
            # loaded — a plain select() guarantees the eager load actually
            # runs, which build_adaptation_proposal_changes needs (it reads
            # current_itinerary.items).
            itinerary_with_items = (
                await session.execute(
                    select(Itinerary).options(selectinload(Itinerary.items)).where(Itinerary.id == itinerary.id)
                )
            ).scalars().first()
            if itinerary_with_items is not None:
                await process_event(session, event, trip=trip, itinerary=itinerary_with_items)


async def check_crowd_adaptations(session: AsyncSession, trip: Trip) -> AdaptationProposal | None:
    """Manual, user-initiated CROWD_CHANGE check — cheap to call
    repeatedly, since it only reaches an AI call when a real threshold is
    actually crossed and cooldown allows it. Runs in the caller's own
    request session/transaction (unlike `detect_incident_impact`, which
    opens its own for the background-task context)."""
    itinerary = (
        await session.execute(
            select(Itinerary)
            .options(selectinload(Itinerary.items))
            .where(Itinerary.trip_id == trip.id)
            .order_by(Itinerary.version.desc())
            .limit(1)
        )
    ).scalars().first()
    if itinerary is None or itinerary.destination_id is None or itinerary.baseline_crowd_risk_score is None:
        # No baseline captured (a pre-adaptation-engine itinerary, or no
        # itinerary at all) — nothing real to compare against.
        return None

    fresh = await latest_risk_score(session, destination_id=itinerary.destination_id)
    if fresh is None:
        return None
    fresh_risk_score, fresh_observed_at = fresh
    baseline = float(itinerary.baseline_crowd_risk_score)
    delta = fresh_risk_score - baseline
    if delta < _CROWD_DELTA_THRESHOLD:
        return None

    severity = "HIGH" if delta >= _CROWD_DELTA_HIGH_THRESHOLD else "MEDIUM"
    now = datetime.now(UTC)
    event = AdaptationEvent(
        event_type=AdaptationEventType.CROWD_CHANGE,
        trip_id=trip.id,
        itinerary_item_id=None,
        destination_id=itinerary.destination_id,
        source_entity_type=None,
        source_entity_id=None,
        severity=severity,
        confidence=0.8,
        observed_at=fresh_observed_at,
        received_at=now,
        deduplication_key=_crowd_dedup_key(trip.id, itinerary.id, now),
        context={
            "baseline_crowd_risk_score": baseline,
            "fresh_crowd_risk_score": fresh_risk_score,
            "delta": round(delta, 3),
        },
    )
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        # Already checked (and created an event for) this trip this hour.
        await session.rollback()
        return None
    await session.commit()

    return await process_event(session, event, trip=trip, itinerary=itinerary)
