"""Real point/badge award logic, called only from places where a genuine
user action just happened (a verified check-in, a real booking, a real
review) — never invoked speculatively or with a fabricated reason. Kept
separate from `router.py` so the booking/trust routers can call
`award_points`/`award_badge_if_new` directly without importing gamification's
HTTP layer, the same separation `trust/moderation.py` uses for AI calls.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.gamification.models import (
    Badge,
    Challenge,
    DestinationCheckIn,
    GamificationCategory,
    PointsLedger,
    UserBadge,
    UserChallengeProgress,
)

CHECK_IN_POINTS = 20
BOOKING_VERIFIED_BUSINESS_POINTS = 10
BOOKING_ECO_CERTIFIED_BONUS_POINTS = 15
REVIEW_POINTS = 5
VIRTUAL_EXPLORE_POINTS = 5

_VIRTUAL_EXPLORE_ENTITY_TYPE = "destination_virtual_explore"

_BADGE_FIRST_STEPS = "first_steps"
_BADGE_EXPLORER = "explorer"
_BADGE_TRAILBLAZER = "trailblazer"
_EXPLORER_THRESHOLD = 5
_TRAILBLAZER_THRESHOLD = 10


async def award_points(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    points: int,
    category: GamificationCategory,
    reason: str,
    related_entity_type: str | None = None,
    related_entity_id: uuid.UUID | None = None,
) -> None:
    session.add(
        PointsLedger(
            user_id=user_id,
            points=points,
            category=category,
            reason=reason,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            created_at=datetime.now(UTC),
        )
    )


async def _award_badge_if_new(session: AsyncSession, *, user_id: uuid.UUID, badge_code: str, reason: str) -> Badge | None:
    badge = (await session.execute(select(Badge).where(Badge.code == badge_code))).scalar_one_or_none()
    if badge is None:
        return None
    existing = await session.execute(
        select(UserBadge).where(UserBadge.user_id == user_id, UserBadge.badge_id == badge.id)
    )
    if existing.scalar_one_or_none() is not None:
        return None
    session.add(UserBadge(user_id=user_id, badge_id=badge.id, awarded_at=datetime.now(UTC), awarded_reason=reason))
    await award_points(
        session,
        user_id=user_id,
        points=badge.points_value,
        category=badge.category,
        reason=f"Earned badge: {badge.name}",
        related_entity_type="badge",
        related_entity_id=badge.id,
    )
    return badge


async def advance_challenge_progress(
    session: AsyncSession, *, user_id: uuid.UUID, category: GamificationCategory, distinct_count: int
) -> None:
    """Advances progress on any active challenge in `category` whose target
    is a count of distinct actions (visits, bookings, reviews) — progress is
    set to the real running count, not incremented blindly, so a challenge
    completed via one path (e.g. seeding) can't be double-counted via another."""
    challenges = (
        await session.execute(select(Challenge).where(Challenge.category == category, Challenge.is_active.is_(True)))
    ).scalars().all()
    for challenge in challenges:
        progress = (
            await session.execute(
                select(UserChallengeProgress).where(
                    UserChallengeProgress.user_id == user_id, UserChallengeProgress.challenge_id == challenge.id
                )
            )
        ).scalar_one_or_none()
        if progress is None:
            progress = UserChallengeProgress(user_id=user_id, challenge_id=challenge.id, progress_count=0)
            session.add(progress)
        if progress.completed_at is not None:
            continue
        progress.progress_count = max(progress.progress_count, distinct_count)
        if progress.progress_count >= challenge.target_count:
            progress.completed_at = datetime.now(UTC)
            await award_points(
                session,
                user_id=user_id,
                points=challenge.points_reward,
                category=challenge.category,
                reason=f"Completed challenge: {challenge.name}",
                related_entity_type="challenge",
                related_entity_id=challenge.id,
            )
            if challenge.badge_id is not None:
                badge = await session.get(Badge, challenge.badge_id)
                if badge is not None:
                    await _award_badge_if_new(session, user_id=user_id, badge_code=badge.code, reason=f"Completed challenge: {challenge.name}")


async def record_virtual_explore(
    session: AsyncSession, *, user_id: uuid.UUID, destination_id: uuid.UUID
) -> int:
    """A small, honest reward for engaging with a destination's real content
    on the site (the "Feel it" experience view) — deliberately smaller than,
    and never conflated with, `record_check_in`'s real GPS-verified visit.
    Idempotent per user+destination: the first call awards points, every
    later call for the same pair is a no-op (returns 0), enforced by
    checking for an existing `PointsLedger` row rather than a separate table."""
    existing = await session.execute(
        select(PointsLedger.id).where(
            PointsLedger.user_id == user_id,
            PointsLedger.related_entity_type == _VIRTUAL_EXPLORE_ENTITY_TYPE,
            PointsLedger.related_entity_id == destination_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return 0

    await award_points(
        session,
        user_id=user_id,
        points=VIRTUAL_EXPLORE_POINTS,
        category=GamificationCategory.EXPLORATION,
        reason="Virtually explored a destination",
        related_entity_type=_VIRTUAL_EXPLORE_ENTITY_TYPE,
        related_entity_id=destination_id,
    )
    return VIRTUAL_EXPLORE_POINTS


async def record_check_in(
    session: AsyncSession, *, user_id: uuid.UUID, destination_id: uuid.UUID, lon: float, lat: float
) -> tuple[DestinationCheckIn, int, list[Badge]]:
    """Records the check-in row (caller has already verified GPS proximity)
    and awards real exploration points/badges. Multiple check-ins at the same
    destination are all recorded (a real visit history), but points/the
    distinct-destination badges only count the first visit to each place."""
    check_in = DestinationCheckIn(
        user_id=user_id,
        destination_id=destination_id,
        checked_in_at=datetime.now(UTC),
        location=f"SRID=4326;POINT({lon} {lat})",
    )
    session.add(check_in)
    await session.flush()

    prior_distinct = (
        await session.execute(
            select(func.count(func.distinct(DestinationCheckIn.destination_id))).where(
                DestinationCheckIn.user_id == user_id, DestinationCheckIn.id != check_in.id
            )
        )
    ).scalar_one()
    is_first_visit_here = (
        await session.execute(
            select(func.count()).where(
                DestinationCheckIn.user_id == user_id,
                DestinationCheckIn.destination_id == destination_id,
                DestinationCheckIn.id != check_in.id,
            )
        )
    ).scalar_one() == 0

    new_badges: list[Badge] = []
    points_awarded = 0
    if is_first_visit_here:
        points_awarded = CHECK_IN_POINTS
        await award_points(
            session,
            user_id=user_id,
            points=points_awarded,
            category=GamificationCategory.EXPLORATION,
            reason="Checked in at a new destination",
            related_entity_type="destination",
            related_entity_id=destination_id,
        )
        distinct_count = prior_distinct + 1
        if distinct_count == 1:
            badge = await _award_badge_if_new(session, user_id=user_id, badge_code=_BADGE_FIRST_STEPS, reason="First destination check-in")
        elif distinct_count == _EXPLORER_THRESHOLD:
            badge = await _award_badge_if_new(session, user_id=user_id, badge_code=_BADGE_EXPLORER, reason=f"Visited {_EXPLORER_THRESHOLD} distinct destinations")
        elif distinct_count == _TRAILBLAZER_THRESHOLD:
            badge = await _award_badge_if_new(session, user_id=user_id, badge_code=_BADGE_TRAILBLAZER, reason=f"Visited {_TRAILBLAZER_THRESHOLD} distinct destinations")
        else:
            badge = None
        if badge is not None:
            new_badges.append(badge)
        await advance_challenge_progress(session, user_id=user_id, category=GamificationCategory.EXPLORATION, distinct_count=distinct_count)

    return check_in, points_awarded, new_badges
