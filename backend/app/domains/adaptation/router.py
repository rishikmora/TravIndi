"""Adaptive journey engine — real REST surface. Detection is triggered two
ways: automatically (a genuine new `safety.Incident` report — see
`app/domains/safety/router.py`'s `create_incident`, which fires
`detect_incident_impact` as a FastAPI `BackgroundTask`) or manually via
`POST /trips/{id}/adaptations/check` for `CROWD_CHANGE` (there's no
discrete "something happened" row for crowd data to hook a background
task onto — `crowd.CrowdCell` is only ever written by the seed script —
so this is a real, cheap, user-initiated check, never a polling timer).

Accept never re-calls Claude: `changes` on the proposal is the exact
structured diff the user was shown, and `apply_adaptation_proposal`
(`app/domains/travel/planner.py`) materializes precisely that.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.core.notify import notify
from app.db.session import get_db_session
from app.domains.adaptation.detection import check_crowd_adaptations
from app.domains.adaptation.models import AdaptationProposal, AdaptationProposalStatus
from app.domains.adaptation.schemas import AdaptationProposalOut
from app.domains.travel.access import get_own_trip
from app.domains.travel.models import Itinerary, Trip
from app.domains.travel.planner import apply_adaptation_proposal, is_current_itinerary
from app.schemas.common import DataResponse, ListResponse
from app.websocket.manager import publish

router = APIRouter(tags=["adaptation"])


def _apply_lazy_proposal_expiry(proposal: AdaptationProposal) -> bool:
    """Same lazy-expiry convention as `location_sharing/router.py`'s
    `_apply_lazy_expiry` — no cron/worker exists in this codebase to sweep
    expired rows, so expiry is enforced at the points that matter."""
    if proposal.status == AdaptationProposalStatus.PROPOSED and datetime.now(UTC) >= proposal.expires_at:
        proposal.status = AdaptationProposalStatus.EXPIRED
        return True
    return False


def _to_proposal_out(row: AdaptationProposal) -> AdaptationProposalOut:
    return AdaptationProposalOut(
        id=row.id,
        trip_id=row.trip_id,
        based_on_itinerary_id=row.based_on_itinerary_id,
        trigger_event_id=row.trigger_event_id,
        reason_code=row.reason_code.value,
        changes=row.changes,
        risk_level=row.risk_level,
        confidence=float(row.confidence) if row.confidence is not None else None,
        status=row.status.value,
        applied_itinerary_id=row.applied_itinerary_id,
        created_at=row.created_at,
        expires_at=row.expires_at,
        decided_at=row.decided_at,
    )


async def _get_own_proposal_and_trip(
    proposal_id: uuid.UUID, principal: Principal, session: AsyncSession, action: str
) -> tuple[AdaptationProposal, Trip]:
    proposal = await session.get(AdaptationProposal, proposal_id)
    if proposal is None:
        raise AppError(code="ADAPTATION_PROPOSAL_NOT_FOUND", message="No such adaptation proposal.", status_code=404)
    trip = await get_own_trip(proposal.trip_id, principal, session, action=action)
    return proposal, trip


@router.get("/trips/{trip_id}/adaptations", response_model=ListResponse[AdaptationProposalOut])
async def list_trip_adaptations(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[AdaptationProposalOut]:
    trip = await get_own_trip(trip_id, principal, session, action="read")
    result = await session.execute(
        select(AdaptationProposal)
        .where(AdaptationProposal.trip_id == trip.id)
        .order_by(AdaptationProposal.created_at.desc())
        .limit(20)
    )
    rows = list(result.scalars().all())
    if any(_apply_lazy_proposal_expiry(row) for row in rows):
        await session.commit()
    return ListResponse(data=[_to_proposal_out(row) for row in rows])


@router.post("/trips/{trip_id}/adaptations/check", response_model=DataResponse[AdaptationProposalOut | None])
async def check_trip_adaptations(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[AdaptationProposalOut | None]:
    """Manual CROWD_CHANGE trigger — see module docstring for why there's
    no automatic background hook for crowd data. Returns null when
    nothing crossed the threshold — that's the expected, honest result on
    most calls, never an error."""
    trip = await get_own_trip(trip_id, principal, session, action="write")
    proposal = await check_crowd_adaptations(session, trip)
    return DataResponse(data=_to_proposal_out(proposal) if proposal else None)


@router.post("/adaptations/{proposal_id}/accept", response_model=DataResponse[AdaptationProposalOut])
async def accept_adaptation_proposal(
    proposal_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[AdaptationProposalOut]:
    proposal, trip = await _get_own_proposal_and_trip(proposal_id, principal, session, action="approve")
    just_expired = _apply_lazy_proposal_expiry(proposal)
    # Checked as a status, not just `just_expired`'s return value — an
    # earlier `GET /trips/{id}/adaptations` call may have already applied
    # and committed the same lazy expiry, in which case `_apply_lazy_
    # proposal_expiry` here is a correct no-op (real bug caught by
    # `test_expired_proposal_lazily_expires_on_list_and_accept`: without
    # this explicit check, an already-expired proposal fell through to the
    # generic NOT_PENDING error below instead of the specific EXPIRED one).
    if just_expired or proposal.status == AdaptationProposalStatus.EXPIRED:
        await session.commit()
        raise AppError(code="ADAPTATION_PROPOSAL_EXPIRED", message="This suggestion has expired.", status_code=409)
    if proposal.status != AdaptationProposalStatus.PROPOSED:
        raise AppError(
            code="ADAPTATION_PROPOSAL_NOT_PENDING", message="This suggestion is no longer pending.", status_code=409
        )

    based_on = await session.get(Itinerary, proposal.based_on_itinerary_id)
    if based_on is None or not await is_current_itinerary(session, based_on):
        proposal.status = AdaptationProposalStatus.STALE
        proposal.decided_at = datetime.now(UTC)
        await session.commit()
        raise AppError(
            code="ADAPTATION_PROPOSAL_STALE",
            message="Your itinerary has changed since this suggestion was made.",
            status_code=409,
        )

    new_itinerary = await apply_adaptation_proposal(
        session,
        trip=trip,
        current_itinerary=based_on,
        changes=proposal.changes,
        reason_code=proposal.reason_code.value,
        confidence=float(proposal.confidence) if proposal.confidence is not None else None,
        proposal_id=proposal.id,
    )
    proposal.status = AdaptationProposalStatus.APPLIED
    proposal.applied_itinerary_id = new_itinerary.id
    proposal.decided_at = datetime.now(UTC)
    await session.flush()
    await notify(
        session,
        user_id=trip.user_id,
        title="Your trip was updated",
        body="Your itinerary was updated based on the suggestion you accepted.",
        notification_type="adaptation_applied",
        related_entity_type="itinerary",
        related_entity_id=new_itinerary.id,
    )
    await session.commit()
    await publish(
        f"adaptation:trip:{trip.id}",
        {"type": "adaptation.accepted", "proposal_id": str(proposal.id), "itinerary_id": str(new_itinerary.id)},
    )
    return DataResponse(data=_to_proposal_out(proposal))


@router.post("/adaptations/{proposal_id}/reject", response_model=DataResponse[AdaptationProposalOut])
async def reject_adaptation_proposal(
    proposal_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[AdaptationProposalOut]:
    proposal, _trip = await _get_own_proposal_and_trip(proposal_id, principal, session, action="reject")
    if _apply_lazy_proposal_expiry(proposal):
        await session.commit()
        return DataResponse(data=_to_proposal_out(proposal))
    if proposal.status == AdaptationProposalStatus.PROPOSED:
        proposal.status = AdaptationProposalStatus.REJECTED
        proposal.decided_at = datetime.now(UTC)
    await session.commit()
    await publish(
        f"adaptation:trip:{proposal.trip_id}", {"type": "adaptation.rejected", "proposal_id": str(proposal.id)}
    )
    return DataResponse(data=_to_proposal_out(proposal))
