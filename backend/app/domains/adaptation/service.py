"""Given a real, already-persisted `AdaptationEvent`, decide whether to
spend an AI call on it (cooldown) and, if so, build+persist the resulting
`AdaptationProposal`. Called by `app/domains/adaptation/detection.py` —
this module never decides *whether something changed*, only *whether a
change that already happened is worth proposing a replan for*.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notify import notify
from app.domains.adaptation.models import (
    AdaptationEvent,
    AdaptationEventStatus,
    AdaptationEventType,
    AdaptationProposal,
    AdaptationProposalStatus,
    AdaptationReasonCode,
)
from app.domains.travel.models import Itinerary, Trip
from app.domains.travel.planner import build_adaptation_proposal_changes
from app.websocket.manager import publish

_PROPOSAL_COOLDOWN_MINUTES = 15
"""Adaptation-storm protection — a trip that keeps triggering matching
events (e.g. crowd fluctuating around the threshold) gets at most one
proposal per window, never one per event."""

_PROPOSAL_TTL_HOURS = 6
"""A proposal that sits unreviewed this long is stale enough that the
underlying condition may no longer hold — lazily expired on read/accept
(app/domains/adaptation/router.py's `_apply_lazy_proposal_expiry`, the
same no-cron-worker-exists convention `location_sharing/router.py`
already established)."""

_RISK_LEVEL_BY_SEVERITY = {"HIGH": "HIGH", "MEDIUM": "MODERATE", "LOW": "LOW"}

_REASON_CODE_BY_EVENT_TYPE = {
    AdaptationEventType.CROWD_CHANGE: AdaptationReasonCode.CROWD_THRESHOLD,
    AdaptationEventType.SAFETY_CHANGE: AdaptationReasonCode.INCIDENT_IMPACT,
}

_ADAPTATION_PROMPT_BY_REASON = {
    AdaptationReasonCode.CROWD_THRESHOLD: (
        "Replan reason: Crowd levels increased significantly near an upcoming stop on this "
        "itinerary since it was originally planned. Prefer a real alternative with lower crowd "
        "levels where one exists; keep everything else as close to the original plan as possible."
    ),
    AdaptationReasonCode.INCIDENT_IMPACT: (
        "Replan reason: A new safety incident was reported near an upcoming stop on this "
        "itinerary. Prefer a real safer alternative where one exists; keep everything else as "
        "close to the original plan as possible."
    ),
}

_HUMAN_REASON_BY_CODE = {
    AdaptationReasonCode.CROWD_THRESHOLD: "Crowd levels increased significantly near an upcoming stop on your trip.",
    AdaptationReasonCode.INCIDENT_IMPACT: "A new incident was reported near an upcoming stop on your trip.",
}


async def _recent_proposal_exists(session: AsyncSession, trip_id: uuid.UUID) -> bool:
    cutoff = datetime.now(UTC) - timedelta(minutes=_PROPOSAL_COOLDOWN_MINUTES)
    result = await session.execute(
        select(AdaptationProposal.id)
        .where(
            AdaptationProposal.trip_id == trip_id,
            AdaptationProposal.status.in_([AdaptationProposalStatus.PROPOSED, AdaptationProposalStatus.APPLIED]),
            AdaptationProposal.created_at >= cutoff,
        )
        .limit(1)
    )
    return result.first() is not None


async def process_event(
    session: AsyncSession, event: AdaptationEvent, *, trip: Trip, itinerary: Itinerary
) -> AdaptationProposal | None:
    """Cooldown check -> AI-assisted proposal build -> commit -> notify ->
    publish. Returns None (with `event.status` set to `IGNORED` or
    `FAILED`) whenever no proposal is created — never fabricates one."""
    if await _recent_proposal_exists(session, event.trip_id):
        event.status = AdaptationEventStatus.IGNORED
        event.context = {**event.context, "ignored_reason": "cooldown_active"}
        await session.commit()
        return None

    reason_code = _REASON_CODE_BY_EVENT_TYPE[event.event_type]
    prompt = _ADAPTATION_PROMPT_BY_REASON[reason_code]

    try:
        changes = await build_adaptation_proposal_changes(
            session,
            user_id=str(trip.user_id),
            trip=trip,
            prompt=prompt,
            destination_id=itinerary.destination_id,
            current_itinerary=itinerary,
        )
    except Exception:  # noqa: BLE001
        # AI failure (including the current Anthropic credit outage, or any
        # other raw Anthropic SDK/network error — `planner.py` never wraps
        # the `client.messages.create(...)` call itself) or a real "no
        # candidates" AppError — never fabricate a proposal to paper over
        # it. Caught broadly and deliberately: this runs inside a FastAPI
        # `BackgroundTask` for the incident-triggered path (`app/domains/
        # adaptation/detection.py`'s `detect_incident_impact`), which has no
        # request-level exception handler to fall back on the way a normal
        # endpoint does — an uncaught exception here would surface as a
        # server-side crash, not a clean error response. The user can still
        # replan manually via the existing /ai/itinerary/{id}/replan path.
        event.status = AdaptationEventStatus.FAILED
        await session.commit()
        return None

    proposal = AdaptationProposal(
        trip_id=event.trip_id,
        based_on_itinerary_id=itinerary.id,
        trigger_event_id=event.id,
        reason_code=reason_code,
        changes=changes,
        risk_level=_RISK_LEVEL_BY_SEVERITY.get(event.severity, "MODERATE"),
        confidence=event.confidence,
        expires_at=datetime.now(UTC) + timedelta(hours=_PROPOSAL_TTL_HOURS),
    )
    session.add(proposal)
    event.status = AdaptationEventStatus.PROCESSED
    await session.flush()

    await notify(
        session,
        user_id=trip.user_id,
        title="Your trip may need an update",
        body=_HUMAN_REASON_BY_CODE[reason_code],
        notification_type="adaptation_proposed",
        related_entity_type="adaptation_proposal",
        related_entity_id=proposal.id,
    )
    await session.commit()

    await publish(
        f"adaptation:trip:{trip.id}",
        {
            "type": "adaptation.proposed",
            "proposal_id": str(proposal.id),
            "reason_code": reason_code.value,
            "risk_level": proposal.risk_level,
        },
    )
    return proposal
