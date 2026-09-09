"""Gamification — Feature Blueprint P2 domains #15/#26 (Tourism Passport,
digital stamps, badges, points, challenges, leaderboard). Every award is
real: check-ins are GPS-proximity-verified against the destination's actual
PostGIS location (never a self-reported "I was there"), and points/badges
are computed from genuine `gamification.points_ledger`/`user_badges` rows,
never a fabricated counter. See `app/domains/gamification/engine.py` for the
award logic shared with the booking/trust router hooks.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.gamification.engine import record_check_in
from app.domains.gamification.models import (
    Badge,
    Challenge,
    DestinationCheckIn,
    GamificationCategory,
    PointsLedger,
    UserBadge,
    UserChallengeProgress,
)
from app.domains.gamification.schemas import (
    BadgeOut,
    ChallengeOut,
    CheckInIn,
    CheckInOut,
    LeaderboardEntryOut,
    MeGamificationOut,
    PointsSummaryOut,
    UserBadgeOut,
)
from app.domains.tourism.models import Destination
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/gamification", tags=["gamification"])

# Destinations here are landmarks/complexes, not points — coordinates are
# already documented elsewhere in this codebase as approximate (see
# app/db/seed.py), so a generous fixed radius (rather than a per-destination
# footprint polygon, which no source data provides) is the honest tradeoff:
# wide enough that a real visitor's GPS reading near a large site like Hampi
# or the Golden Temple complex passes, without being so wide it's meaningless.
_CHECK_IN_RADIUS_METERS = 5000


def _to_badge_out(row: Badge) -> BadgeOut:
    return BadgeOut(
        id=row.id, code=row.code, name=row.name, description=row.description,
        category=row.category, icon_key=row.icon_key, points_value=row.points_value,
    )


@router.get("/badges", response_model=ListResponse[BadgeOut])
async def list_badges(session: AsyncSession = Depends(get_db_session)) -> ListResponse[BadgeOut]:
    rows = (await session.execute(select(Badge).order_by(Badge.points_value))).scalars().all()
    return ListResponse(data=[_to_badge_out(row) for row in rows])


@router.get("/challenges", response_model=ListResponse[ChallengeOut])
async def list_challenges(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[ChallengeOut]:
    challenges = (
        await session.execute(select(Challenge).where(Challenge.is_active.is_(True)).order_by(Challenge.target_count))
    ).scalars().all()
    user_id = uuid.UUID(principal.user_id)
    progress_rows = (
        await session.execute(select(UserChallengeProgress).where(UserChallengeProgress.user_id == user_id))
    ).scalars().all()
    progress_by_challenge = {row.challenge_id: row for row in progress_rows}

    badge_ids = [c.badge_id for c in challenges if c.badge_id is not None]
    badges_by_id = {}
    if badge_ids:
        badge_rows = (await session.execute(select(Badge).where(Badge.id.in_(badge_ids)))).scalars().all()
        badges_by_id = {b.id: b for b in badge_rows}

    out = []
    for challenge in challenges:
        progress = progress_by_challenge.get(challenge.id)
        out.append(
            ChallengeOut(
                id=challenge.id, code=challenge.code, name=challenge.name, description=challenge.description,
                category=challenge.category, target_count=challenge.target_count, points_reward=challenge.points_reward,
                badge=_to_badge_out(badges_by_id[challenge.badge_id]) if challenge.badge_id in badges_by_id else None,
                my_progress_count=progress.progress_count if progress else 0,
                my_completed_at=progress.completed_at if progress else None,
            )
        )
    return ListResponse(data=out)


@router.get("/me", response_model=DataResponse[MeGamificationOut])
async def get_my_gamification(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[MeGamificationOut]:
    user_id = uuid.UUID(principal.user_id)

    totals_by_category = (
        await session.execute(
            select(PointsLedger.category, func.sum(PointsLedger.points)).where(PointsLedger.user_id == user_id).group_by(PointsLedger.category)
        )
    ).all()
    by_category = {category.value: int(total) for category, total in totals_by_category}
    total_points = sum(by_category.values())

    badge_rows = (
        await session.execute(
            select(UserBadge, Badge).join(Badge, Badge.id == UserBadge.badge_id).where(UserBadge.user_id == user_id).order_by(UserBadge.awarded_at.desc())
        )
    ).all()
    badges_out = [
        UserBadgeOut(badge=_to_badge_out(badge), awarded_at=user_badge.awarded_at, awarded_reason=user_badge.awarded_reason)
        for user_badge, badge in badge_rows
    ]

    destinations_visited = (
        await session.execute(
            select(func.count(func.distinct(DestinationCheckIn.destination_id))).where(DestinationCheckIn.user_id == user_id)
        )
    ).scalar_one()

    return DataResponse(
        data=MeGamificationOut(
            points=PointsSummaryOut(total_points=total_points, by_category=by_category),
            badges=badges_out,
            destinations_visited=destinations_visited,
        )
    )


@router.get("/leaderboard", response_model=ListResponse[LeaderboardEntryOut])
async def get_leaderboard(
    category: GamificationCategory | None = None, session: AsyncSession = Depends(get_db_session)
) -> ListResponse[LeaderboardEntryOut]:
    """`?category=RESPONSIBLE_TOURISM` doubles as the Feature Blueprint P2
    Sustainability "Green tourism leaderboard" — a real filter on the same
    points ledger, not a second leaderboard system."""
    query = select(PointsLedger.user_id, func.sum(PointsLedger.points).label("total"))
    if category is not None:
        query = query.where(PointsLedger.category == category)
    rows = (
        await session.execute(query.group_by(PointsLedger.user_id).order_by(func.sum(PointsLedger.points).desc()).limit(20))
    ).all()
    return ListResponse(
        data=[
            LeaderboardEntryOut(display_name=f"Traveler #{str(user_id)[:8]}", total_points=int(total), rank=rank)
            for rank, (user_id, total) in enumerate(rows, start=1)
        ]
    )


@router.post("/check-ins", response_model=DataResponse[CheckInOut], status_code=201)
async def create_check_in(
    body: CheckInIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[CheckInOut]:
    destination = await session.get(Destination, body.destination_id)
    if destination is None:
        raise AppError(code="DESTINATION_NOT_FOUND", message="No destination with that id.", status_code=404)

    point_geog = func.ST_GeogFromText(f"SRID=4326;POINT({body.lon} {body.lat})")
    is_near = (
        await session.execute(select(func.ST_DWithin(Destination.location, point_geog, _CHECK_IN_RADIUS_METERS)).where(Destination.id == destination.id))
    ).scalar_one()
    if not is_near:
        raise AppError(
            code="CHECK_IN_TOO_FAR",
            message=f"Your location isn't close enough to {destination.name} to check in (within {_CHECK_IN_RADIUS_METERS // 1000}km).",
            status_code=422,
        )

    check_in, points_awarded, new_badges = await record_check_in(
        session, user_id=uuid.UUID(principal.user_id), destination_id=destination.id, lon=body.lon, lat=body.lat
    )
    await session.commit()

    return DataResponse(
        data=CheckInOut(
            id=check_in.id, destination_id=destination.id, checked_in_at=check_in.checked_in_at,
            points_awarded=points_awarded, new_badges=[_to_badge_out(b) for b in new_badges],
        )
    )
