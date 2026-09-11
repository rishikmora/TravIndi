"""Adaptive journey engine — real event detection (CROWD_CHANGE,
SAFETY_CHANGE/INCIDENT_IMPACT) -> impact assessment -> AI-assisted replan
proposal -> deterministic validation -> user accept/reject.

Reuses `_register_and_login`/`_auth`/`_decode_sub` from
`test_sos_and_incidents.py` (established cross-file convention). Most
tests here are deliberately AI-independent (dedup, cooldown, staleness,
expiry, accept/reject, below-threshold crowd checks) so they run correctly
regardless of Anthropic API availability — `apply_adaptation_proposal`
never re-calls Claude, it materializes an already-built `changes` payload,
so a hand-inserted proposal exercises the exact same code path a real
AI-assisted one would.

Two tests (`test_incident_near_itinerary_item_creates_a_real_adaptation_event`
and `test_crowd_threshold_crossing_creates_a_real_adaptation_event`) do
reach the real `client.messages.create(...)` call inside `process_event`,
exactly like the existing `test_ai_planner.py` suite, so their *proposal*
outcome is correctly `FAILED` while credits are out (a 400 invalid-request
error is not retried by the Anthropic SDK, so this fails fast, not
slowly) — documented here rather than mocked, since no AI-mocking
precedent exists anywhere in this codebase. Both still assert the real,
AI-independent parts: that a validated `AdaptationEvent` row was created
with the correct severity/confidence/deduplication_key. (The first run of
either test in a fresh process can take a few minutes regardless of
Claude — `embed_text`'s local `sentence-transformers` model is downloaded
and loaded once, then cached for the rest of the process.)
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select, text

from app.db.session import get_session_factory
from app.domains.adaptation.detection import (
    _CROWD_DELTA_HIGH_THRESHOLD,
    _CROWD_DELTA_THRESHOLD,
    _crowd_dedup_key,
    _incident_dedup_key,
    check_crowd_adaptations,
    classify_incident_severity,
    detect_incident_impact,
)
from app.domains.adaptation.models import (
    AdaptationEvent,
    AdaptationEventStatus,
    AdaptationEventType,
    AdaptationProposal,
    AdaptationProposalStatus,
    AdaptationReasonCode,
)
from app.domains.adaptation.service import process_event
from app.domains.crowd.models import CrowdCell
from app.domains.safety.models import Incident
from app.domains.tourism.models import Attraction, Destination
from app.domains.travel.models import ItemType, Itinerary, ItineraryItem, Trip, TripStatus
from tests.integration.test_sos_and_incidents import _auth, _decode_sub, _register_and_login


class _FakeIncident:
    """A duck-typed stand-in for `classify_incident_severity`, which only
    ever reads `.severity` — avoids a real DB row for a pure keyword-
    mapping test."""

    def __init__(self, severity: str) -> None:
        self.severity = severity


async def _real_attraction() -> Attraction:
    async with get_session_factory()() as session:
        destination = (await session.execute(select(Destination).where(Destination.name == "India Gate"))).scalar_one()
        attraction = (
            await session.execute(select(Attraction).where(Attraction.destination_id == destination.id).limit(1))
        ).scalars().first()
        assert attraction is not None, "seed data must include at least one India Gate attraction"
        return attraction


async def _create_trip_with_itinerary(
    *, user_id: uuid.UUID, attraction: Attraction, baseline_crowd_risk_score: float | None
) -> tuple[Trip, Itinerary, ItineraryItem]:
    async with get_session_factory()() as session:
        trip = Trip(user_id=user_id, currency="INR", status=TripStatus.DRAFT)
        session.add(trip)
        await session.flush()
        itinerary = Itinerary(
            trip_id=trip.id,
            version=1,
            generated_by="AI",
            currency="INR",
            destination_id=attraction.destination_id,
            baseline_crowd_risk_score=baseline_crowd_risk_score,
            baseline_crowd_observed_at=datetime.now(UTC) if baseline_crowd_risk_score is not None else None,
        )
        session.add(itinerary)
        await session.flush()
        item = ItineraryItem(
            itinerary_id=itinerary.id,
            item_type=ItemType.ATTRACTION,
            attraction_id=attraction.id,
            sequence=0,
            day_offset=0,
            time_of_day="morning",
            completed=False,
        )
        session.add(item)
        await session.commit()
        await session.refresh(trip)
        await session.refresh(itinerary)
        await session.refresh(item)
        return trip, itinerary, item


def _valid_changes_for(attraction: Attraction) -> dict:
    return {
        "summary": "Test-authored replacement plan.",
        "model": "test-model",
        "proposed_items": [
            {
                "attraction_id": str(attraction.id),
                "attraction_name": attraction.name,
                "day_offset": 0,
                "time_of_day": "morning",
                "reason": "Kept because it's still a good fit.",
            }
        ],
        "added_attraction_ids": [],
        "removed_attraction_ids": [],
        "kept_attraction_ids": [str(attraction.id)],
        "usage": {"input_tokens": 10, "output_tokens": 10, "cost_usd": 0.001, "latency_ms": 100},
    }


async def _insert_proposal(
    *,
    trip_id: uuid.UUID,
    based_on_itinerary_id: uuid.UUID,
    trigger_event_id: uuid.UUID,
    changes: dict,
    expires_at: datetime,
    status: AdaptationProposalStatus = AdaptationProposalStatus.PROPOSED,
) -> AdaptationProposal:
    async with get_session_factory()() as session:
        proposal = AdaptationProposal(
            trip_id=trip_id,
            based_on_itinerary_id=based_on_itinerary_id,
            trigger_event_id=trigger_event_id,
            reason_code=AdaptationReasonCode.INCIDENT_IMPACT,
            changes=changes,
            risk_level="MODERATE",
            confidence=0.8,
            status=status,
            expires_at=expires_at,
        )
        session.add(proposal)
        await session.commit()
        await session.refresh(proposal)
        return proposal


async def _insert_dummy_event(*, trip_id: uuid.UUID) -> AdaptationEvent:
    async with get_session_factory()() as session:
        now = datetime.now(UTC)
        event = AdaptationEvent(
            event_type=AdaptationEventType.SAFETY_CHANGE,
            trip_id=trip_id,
            severity="LOW",
            confidence=0.5,
            observed_at=now,
            received_at=now,
            deduplication_key=f"test-dummy-{uuid.uuid4()}",
            context={},
        )
        session.add(event)
        await session.commit()
        await session.refresh(event)
        return event


# --- Pure logic: dedup keys and severity classification ---


def test_incident_dedup_key_is_stable_and_id_based() -> None:
    incident_id = uuid.uuid4()
    item_id = uuid.uuid4()
    other_item_id = uuid.uuid4()
    assert _incident_dedup_key(incident_id, item_id) == _incident_dedup_key(incident_id, item_id)
    assert _incident_dedup_key(incident_id, item_id) != _incident_dedup_key(incident_id, other_item_id)


def test_crowd_dedup_key_is_hour_bucketed() -> None:
    trip_id, itinerary_id = uuid.uuid4(), uuid.uuid4()
    base = datetime(2026, 9, 11, 14, 5, tzinfo=UTC)
    same_hour_later = datetime(2026, 9, 11, 14, 55, tzinfo=UTC)
    next_hour = datetime(2026, 9, 11, 15, 5, tzinfo=UTC)
    assert _crowd_dedup_key(trip_id, itinerary_id, base) == _crowd_dedup_key(trip_id, itinerary_id, same_hour_later)
    assert _crowd_dedup_key(trip_id, itinerary_id, base) != _crowd_dedup_key(trip_id, itinerary_id, next_hour)


def test_classify_incident_severity_keyword_mapping() -> None:
    assert classify_incident_severity(_FakeIncident("High risk area")) == ("HIGH", 0.8)  # type: ignore[arg-type]
    assert classify_incident_severity(_FakeIncident("critical")) == ("HIGH", 0.8)  # type: ignore[arg-type]
    assert classify_incident_severity(_FakeIncident("minor scuffle")) == ("LOW", 0.8)  # type: ignore[arg-type]
    # Unconstrained free text with no recognized keyword — never guessed as
    # confidently HIGH or LOW.
    assert classify_incident_severity(_FakeIncident("crowd_surge")) == ("MEDIUM", 0.5)  # type: ignore[arg-type]


# --- Detection + dedup against real rows ---


async def test_incident_near_itinerary_item_creates_a_real_adaptation_event(client: AsyncClient) -> None:
    """Slow (real AI call attempted inside `process_event`, currently
    blocked by the Anthropic credit outage) — see module docstring. Only
    the AI-independent detection outcome is asserted as a hard requirement."""
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, _itinerary, item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )

    async with get_session_factory()() as session:
        # safety.incidents has RLS — a direct test insert (not through the
        # real POST /emergency/incidents endpoint, which uses
        # get_rls_session) needs the same service-role escape hatch
        # `detect_incident_impact` itself uses.
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        point_lon, point_lat = _attraction_lon_lat(attraction)
        incident = Incident(
            reporter_user_id=user_id,
            incident_type="crowd_surge",
            severity="high",
            location=f"SRID=4326;POINT({point_lon} {point_lat})",
            description="Test: reported directly at the attraction's own coordinates.",
        )
        session.add(incident)
        await session.flush()
        # Refresh BEFORE commit — the service-role GUC set above is
        # transaction-local and resets at commit, the same "refresh before
        # commit" rule this codebase already established elsewhere for
        # RLS-protected tables.
        await session.refresh(incident)
        await session.commit()

    await detect_incident_impact(incident.id)
    # A second run for the exact same incident must not create a second
    # event for the same item — the unique deduplication_key constraint,
    # exercised for real.
    await detect_incident_impact(incident.id)

    async with get_session_factory()() as session:
        events = (
            await session.execute(select(AdaptationEvent).where(AdaptationEvent.trip_id == trip.id))
        ).scalars().all()

    assert len(events) == 1, "the second detect_incident_impact run must not create a duplicate event"
    event = events[0]
    assert event.event_type == AdaptationEventType.SAFETY_CHANGE
    assert event.itinerary_item_id == item.id
    assert event.severity == "HIGH"
    assert float(event.confidence) == 0.8
    assert event.deduplication_key == _incident_dedup_key(incident.id, item.id)
    assert event.status in (AdaptationEventStatus.PROCESSED, AdaptationEventStatus.FAILED)


def _attraction_lon_lat(attraction: Attraction) -> tuple[float, float]:
    from geoalchemy2.shape import to_shape

    point = to_shape(attraction.location)  # type: ignore[arg-type]
    return point.x, point.y


async def test_crowd_threshold_crossing_creates_a_real_adaptation_event(client: AsyncClient) -> None:
    """Slow for the same reason as the incident test above — see module
    docstring."""
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    baseline = 0.30
    trip, _itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=baseline
    )

    fresh_risk = baseline + _CROWD_DELTA_HIGH_THRESHOLD + 0.05
    async with get_session_factory()() as session:
        session.add(
            CrowdCell(
                h3_cell=f"test-{uuid.uuid4().hex[:8]}",
                destination_id=attraction.destination_id,
                observed_at=datetime.now(UTC),
                density=fresh_risk,
                risk_score=fresh_risk,
                source="test",
                confidence=1.0,
            )
        )
        await session.commit()

        trip_row = await session.get(Trip, trip.id)
        assert trip_row is not None
        await check_crowd_adaptations(session, trip_row)

    async with get_session_factory()() as session:
        events = (
            await session.execute(select(AdaptationEvent).where(AdaptationEvent.trip_id == trip.id))
        ).scalars().all()

    assert len(events) == 1
    event = events[0]
    assert event.event_type == AdaptationEventType.CROWD_CHANGE
    assert event.severity == "HIGH"
    assert float(event.confidence) == 0.8


async def test_check_crowd_adaptations_returns_none_without_a_baseline(client: AsyncClient) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, _itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )

    async with get_session_factory()() as session:
        trip_row = await session.get(Trip, trip.id)
        assert trip_row is not None
        result = await check_crowd_adaptations(session, trip_row)

    assert result is None


async def test_check_crowd_adaptations_below_threshold_returns_none(client: AsyncClient) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    baseline = 0.30
    trip, _itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=baseline
    )

    async with get_session_factory()() as session:
        session.add(
            CrowdCell(
                h3_cell=f"test-{uuid.uuid4().hex[:8]}",
                destination_id=attraction.destination_id,
                observed_at=datetime.now(UTC),
                density=baseline + (_CROWD_DELTA_THRESHOLD / 2),
                risk_score=baseline + (_CROWD_DELTA_THRESHOLD / 2),
                source="test",
                confidence=1.0,
            )
        )
        await session.commit()

        trip_row = await session.get(Trip, trip.id)
        assert trip_row is not None
        result = await check_crowd_adaptations(session, trip_row)

    assert result is None


# --- Cooldown, staleness, expiry, accept/reject — all AI-independent ---


async def test_cooldown_suppresses_a_second_proposal_without_calling_ai(client: AsyncClient) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )
    dummy_trigger_event = await _insert_dummy_event(trip_id=trip.id)
    await _insert_proposal(
        trip_id=trip.id,
        based_on_itinerary_id=itinerary.id,
        trigger_event_id=dummy_trigger_event.id,
        changes=_valid_changes_for(attraction),
        expires_at=datetime.now(UTC) + timedelta(hours=6),
    )

    new_event = await _insert_dummy_event(trip_id=trip.id)
    async with get_session_factory()() as session:
        event_row = await session.get(AdaptationEvent, new_event.id)
        trip_row = await session.get(Trip, trip.id)
        itinerary_row = await session.get(Itinerary, itinerary.id)
        assert event_row is not None
        assert trip_row is not None
        assert itinerary_row is not None
        result = await process_event(session, event_row, trip=trip_row, itinerary=itinerary_row)

    assert result is None
    async with get_session_factory()() as session:
        refreshed = await session.get(AdaptationEvent, new_event.id)
        assert refreshed is not None
        assert refreshed.status == AdaptationEventStatus.IGNORED
        proposals = (
            await session.execute(select(AdaptationProposal).where(AdaptationProposal.trip_id == trip.id))
        ).scalars().all()
        assert len(proposals) == 1, "cooldown must prevent a second proposal from being created"


async def test_stale_proposal_is_rejected_on_accept(client: AsyncClient) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, itinerary_v1, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )
    dummy_trigger_event = await _insert_dummy_event(trip_id=trip.id)
    proposal = await _insert_proposal(
        trip_id=trip.id,
        based_on_itinerary_id=itinerary_v1.id,
        trigger_event_id=dummy_trigger_event.id,
        changes=_valid_changes_for(attraction),
        expires_at=datetime.now(UTC) + timedelta(hours=6),
    )

    # A second, newer itinerary version supersedes v1 before the proposal
    # is ever acted on — inserted directly (not via the AI replan
    # endpoint) so this test doesn't depend on Anthropic availability.
    async with get_session_factory()() as session:
        session.add(
            Itinerary(
                trip_id=trip.id, version=2, generated_by="USER", currency="INR", destination_id=attraction.destination_id
            )
        )
        await session.commit()

    response = await client.post(f"/api/v1/adaptations/{proposal.id}/accept", headers=_auth(session_data["access_token"]))
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "ADAPTATION_PROPOSAL_STALE"

    async with get_session_factory()() as session:
        refreshed = await session.get(AdaptationProposal, proposal.id)
        assert refreshed is not None
        assert refreshed.status == AdaptationProposalStatus.STALE


async def test_expired_proposal_lazily_expires_on_list_and_accept(client: AsyncClient) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )
    dummy_trigger_event = await _insert_dummy_event(trip_id=trip.id)
    proposal = await _insert_proposal(
        trip_id=trip.id,
        based_on_itinerary_id=itinerary.id,
        trigger_event_id=dummy_trigger_event.id,
        changes=_valid_changes_for(attraction),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )

    listing = await client.get(f"/api/v1/trips/{trip.id}/adaptations", headers=_auth(session_data["access_token"]))
    assert listing.status_code == 200, listing.text
    (row,) = [p for p in listing.json()["data"] if p["id"] == str(proposal.id)]
    assert row["status"] == "EXPIRED"

    response = await client.post(f"/api/v1/adaptations/{proposal.id}/accept", headers=_auth(session_data["access_token"]))
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "ADAPTATION_PROPOSAL_EXPIRED"


async def test_accept_materializes_the_stored_changes_as_a_new_version_without_calling_ai(
    client: AsyncClient,
) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )
    dummy_trigger_event = await _insert_dummy_event(trip_id=trip.id)
    proposal = await _insert_proposal(
        trip_id=trip.id,
        based_on_itinerary_id=itinerary.id,
        trigger_event_id=dummy_trigger_event.id,
        changes=_valid_changes_for(attraction),
        expires_at=datetime.now(UTC) + timedelta(hours=6),
    )

    response = await client.post(f"/api/v1/adaptations/{proposal.id}/accept", headers=_auth(session_data["access_token"]))
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["status"] == "APPLIED"
    assert body["applied_itinerary_id"] is not None

    itinerary_response = await client.get(
        f"/api/v1/trips/{trip.id}/itinerary", headers=_auth(session_data["access_token"])
    )
    assert itinerary_response.status_code == 200, itinerary_response.text
    new_itinerary = itinerary_response.json()["data"]
    assert new_itinerary["id"] == body["applied_itinerary_id"]
    assert new_itinerary["version"] == 2
    assert new_itinerary["previous_version"] == 1
    assert new_itinerary["generated_by"] == "SYSTEM"
    assert [i["attraction_id"] for i in new_itinerary["items"]] == [str(attraction.id)]

    # Accepting again must fail — it's no longer PROPOSED.
    second_attempt = await client.post(
        f"/api/v1/adaptations/{proposal.id}/accept", headers=_auth(session_data["access_token"])
    )
    assert second_attempt.status_code == 409
    assert second_attempt.json()["error"]["code"] == "ADAPTATION_PROPOSAL_NOT_PENDING"


async def test_reject_marks_the_proposal_rejected(client: AsyncClient) -> None:
    session_data = await _register_and_login(client)
    user_id = uuid.UUID(_decode_sub(session_data["access_token"]))
    attraction = await _real_attraction()
    trip, itinerary, _item = await _create_trip_with_itinerary(
        user_id=user_id, attraction=attraction, baseline_crowd_risk_score=None
    )
    dummy_trigger_event = await _insert_dummy_event(trip_id=trip.id)
    proposal = await _insert_proposal(
        trip_id=trip.id,
        based_on_itinerary_id=itinerary.id,
        trigger_event_id=dummy_trigger_event.id,
        changes=_valid_changes_for(attraction),
        expires_at=datetime.now(UTC) + timedelta(hours=6),
    )

    response = await client.post(f"/api/v1/adaptations/{proposal.id}/reject", headers=_auth(session_data["access_token"]))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "REJECTED"

    # A rejected trip's itinerary must be untouched — no new version.
    itinerary_response = await client.get(
        f"/api/v1/trips/{trip.id}/itinerary", headers=_auth(session_data["access_token"])
    )
    assert itinerary_response.json()["data"]["version"] == 1
