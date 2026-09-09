"""Group & Family Travel — Feature Blueprint P2 domain #21. Real group
membership + real location-based features (centroid, separation alerts,
aggregate safety score against real `safety.safety_scores` rows) — no
fabricated distances or scores. Shared itinerary/expense access for members
is handled by `app/domains/group_travel/access.py`'s check inside
`travel/router.py`/`financial/router.py`, not duplicated here.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.core.geo import haversine_meters
from app.db.session import get_db_session
from app.domains.group_travel.access import is_trip_owner_or_active_member
from app.domains.group_travel.models import (
    TripMember,
    TripMemberLocation,
    TripMemberRole,
    TripMemberStatus,
)
from app.domains.group_travel.schemas import (
    GroupLocationsOut,
    GroupSafetyOut,
    LocationUpdateIn,
    MemberInviteIn,
    MemberLocationOut,
    TripMemberOut,
)
from app.domains.identity.models import User
from app.domains.safety.models import SafetyScore
from app.domains.tourism.models import Destination
from app.domains.tourism.schemas import GeoPoint
from app.domains.travel.models import Trip
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/group-travel", tags=["group-travel"])

_SEPARATION_THRESHOLD_METERS = 2000.0
_SAFETY_SEARCH_RADIUS_METERS = 50_000.0


def _to_member_out(row: TripMember) -> TripMemberOut:
    return TripMemberOut(
        id=row.id, trip_id=row.trip_id, user_id=row.user_id, role=row.role, status=row.status,
        invited_at=row.invited_at, joined_at=row.joined_at,
    )


async def _get_trip_or_404(session: AsyncSession, trip_id: uuid.UUID) -> Trip:
    trip = await session.get(Trip, trip_id)
    if trip is None:
        raise AppError(code="TRIP_NOT_FOUND", message="No such trip.", status_code=404)
    return trip


async def _require_trip_access(session: AsyncSession, trip: Trip, principal: Principal) -> None:
    if not await is_trip_owner_or_active_member(session, trip, principal.user_id):
        raise AppError(code="FORBIDDEN", message="You aren't part of this trip.", status_code=403)


@router.post("/trips/{trip_id}/members", response_model=DataResponse[TripMemberOut], status_code=201)
async def invite_member(
    trip_id: uuid.UUID,
    body: MemberInviteIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripMemberOut]:
    trip = await _get_trip_or_404(session, trip_id)
    if str(trip.user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="Only the trip owner can invite members.", status_code=403)

    # identity.users has RLS enabled (own-row-only for an ordinary
    # principal) — looking someone else up by email to invite them is an
    # inherently cross-user read, so it needs the same narrowly-scoped
    # service-role escape hatch app/domains/identity/router.py's /auth/register
    # uses for its own no-principal-yet write, not a relaxed policy.
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
    invitee = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if invitee is None:
        raise AppError(code="USER_NOT_FOUND", message="No TravIndi account with that email.", status_code=404)
    if invitee.id == trip.user_id:
        raise AppError(code="ALREADY_OWNER", message="The trip owner doesn't need an invite.", status_code=409)

    existing = await session.execute(
        select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == invitee.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise AppError(code="ALREADY_INVITED", message="This person is already part of the trip.", status_code=409)

    member = TripMember(
        trip_id=trip_id, user_id=invitee.id, role=TripMemberRole.MEMBER, status=TripMemberStatus.INVITED,
        invited_at=datetime.now(UTC),
    )
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return DataResponse(data=_to_member_out(member))


@router.post("/members/{member_id}/accept", response_model=DataResponse[TripMemberOut])
async def accept_invite(
    member_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripMemberOut]:
    member = await session.get(TripMember, member_id)
    if member is None:
        raise AppError(code="MEMBER_NOT_FOUND", message="No such invite.", status_code=404)
    if str(member.user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="This invite isn't addressed to you.", status_code=403)
    if member.status != TripMemberStatus.INVITED:
        raise AppError(code="INVITE_ALREADY_DECIDED", message="This invite was already accepted or you've left.", status_code=409)
    member.status = TripMemberStatus.ACTIVE
    member.joined_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(member)
    return DataResponse(data=_to_member_out(member))


@router.post("/members/{member_id}/leave", response_model=DataResponse[TripMemberOut])
async def leave_trip(
    member_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripMemberOut]:
    member = await session.get(TripMember, member_id)
    if member is None:
        raise AppError(code="MEMBER_NOT_FOUND", message="No such membership.", status_code=404)
    if str(member.user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="You can only remove yourself.", status_code=403)
    member.status = TripMemberStatus.LEFT
    await session.commit()
    await session.refresh(member)
    return DataResponse(data=_to_member_out(member))


@router.get("/trips/{trip_id}/members", response_model=ListResponse[TripMemberOut])
async def list_members(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[TripMemberOut]:
    trip = await _get_trip_or_404(session, trip_id)
    await _require_trip_access(session, trip, principal)
    rows = (await session.execute(select(TripMember).where(TripMember.trip_id == trip_id))).scalars().all()
    return ListResponse(data=[_to_member_out(r) for r in rows])


async def _get_own_active_member(session: AsyncSession, trip_id: uuid.UUID, principal: Principal) -> TripMember:
    """The trip owner never goes through `invite_member`/`accept_invite`, so
    they have no `TripMember` row until they actually need one (e.g. to
    share their own location) — lazily create their OWNER/ACTIVE row here
    rather than requiring every trip to pre-provision one up front."""
    member = (
        await session.execute(
            select(TripMember).where(
                TripMember.trip_id == trip_id, TripMember.user_id == uuid.UUID(principal.user_id),
                TripMember.status == TripMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    if member is None:
        trip = await _get_trip_or_404(session, trip_id)
        if str(trip.user_id) == principal.user_id:
            now = datetime.now(UTC)
            member = TripMember(
                trip_id=trip_id, user_id=uuid.UUID(principal.user_id), role=TripMemberRole.OWNER,
                status=TripMemberStatus.ACTIVE, invited_at=now, joined_at=now,
            )
            session.add(member)
            await session.flush()
    if member is None:
        raise AppError(code="NOT_AN_ACTIVE_MEMBER", message="You aren't an active member of this trip.", status_code=403)
    return member


@router.post("/trips/{trip_id}/location", response_model=DataResponse[MemberLocationOut])
async def update_my_location(
    trip_id: uuid.UUID,
    body: LocationUpdateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[MemberLocationOut]:
    member = await _get_own_active_member(session, trip_id, principal)
    existing = (
        await session.execute(select(TripMemberLocation).where(TripMemberLocation.trip_member_id == member.id))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if existing is None:
        existing = TripMemberLocation(
            trip_member_id=member.id, location=f"SRID=4326;POINT({body.lon} {body.lat})", recorded_at=now
        )
        session.add(existing)
    else:
        existing.location = f"SRID=4326;POINT({body.lon} {body.lat})"
        existing.recorded_at = now
    await session.commit()
    return DataResponse(
        data=MemberLocationOut(
            member_id=member.id, user_id=member.user_id, location=GeoPoint(lon=body.lon, lat=body.lat),
            recorded_at=now, distance_from_centroid_meters=None, is_separated=False,
        )
    )


@router.get("/trips/{trip_id}/locations", response_model=DataResponse[GroupLocationsOut])
async def get_group_locations(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[GroupLocationsOut]:
    trip = await _get_trip_or_404(session, trip_id)
    await _require_trip_access(session, trip, principal)

    rows = (
        await session.execute(
            select(TripMember, TripMemberLocation)
            .join(TripMemberLocation, TripMemberLocation.trip_member_id == TripMember.id)
            .where(TripMember.trip_id == trip_id, TripMember.status == TripMemberStatus.ACTIVE)
        )
    ).all()

    points: list[tuple[TripMember, float, float, datetime]] = []
    for member, loc in rows:
        p = to_shape(loc.location)
        points.append((member, p.x, p.y, loc.recorded_at))

    if not points:
        return DataResponse(data=GroupLocationsOut(centroid=None, members=[]))

    centroid_lon = sum(p[1] for p in points) / len(points)
    centroid_lat = sum(p[2] for p in points) / len(points)

    members_out = []
    for member, lon, lat, recorded_at in points:
        distance = haversine_meters(centroid_lon, centroid_lat, lon, lat)
        members_out.append(
            MemberLocationOut(
                member_id=member.id, user_id=member.user_id, location=GeoPoint(lon=lon, lat=lat),
                recorded_at=recorded_at,
                distance_from_centroid_meters=round(distance, 1),
                is_separated=distance > _SEPARATION_THRESHOLD_METERS,
            )
        )

    return DataResponse(
        data=GroupLocationsOut(centroid=GeoPoint(lon=centroid_lon, lat=centroid_lat), members=members_out)
    )


@router.get("/trips/{trip_id}/safety", response_model=DataResponse[GroupSafetyOut])
async def get_group_safety(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[GroupSafetyOut]:
    """Real aggregate: for each active member with a known location, finds
    the nearest destination (within a search radius) and reads its real
    `safety.safety_scores` row — never a fabricated group score. A member
    with no nearby seeded destination is honestly excluded from the
    average, not defaulted to some made-up value."""
    trip = await _get_trip_or_404(session, trip_id)
    await _require_trip_access(session, trip, principal)

    rows = (
        await session.execute(
            select(TripMember, TripMemberLocation)
            .join(TripMemberLocation, TripMemberLocation.trip_member_id == TripMember.id)
            .where(TripMember.trip_id == trip_id, TripMember.status == TripMemberStatus.ACTIVE)
        )
    ).all()

    by_member: dict[str, float | None] = {}
    scores: list[float] = []
    for member, loc in rows:
        nearest = (
            await session.execute(
                select(Destination, SafetyScore)
                .join(SafetyScore, SafetyScore.destination_id == Destination.id)
                .where(func.ST_DWithin(Destination.location, loc.location, _SAFETY_SEARCH_RADIUS_METERS))
                .order_by(func.ST_Distance(Destination.location, loc.location))
                .limit(1)
            )
        ).first()
        if nearest is None:
            by_member[str(member.user_id)] = None
            continue
        _, safety_score = nearest
        score = float(safety_score.score)
        by_member[str(member.user_id)] = score
        scores.append(score)

    return DataResponse(
        data=GroupSafetyOut(
            average_safety_score=(sum(scores) / len(scores)) if scores else None,
            members_covered=len(scores),
            members_total=len(rows),
            by_member=by_member,
        )
    )
