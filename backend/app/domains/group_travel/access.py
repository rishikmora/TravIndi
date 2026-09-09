"""Shared trip-access check — used by `travel/router.py` (shared itinerary
read) and `financial/router.py` (group expenses) so a trip with active
members works like a real shared trip without duplicating the itinerary or
expense data anywhere. Read access extends to any ACTIVE member; only the
owner can edit the trip itself (update/cancel/generate-itinerary stay
owner-only, unchanged) — a member's own expense-logging is authorized
separately by `financial/router.py` scoping the write to their own
`user_id`, not by this check.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.group_travel.models import TripMember, TripMemberStatus
from app.domains.travel.models import Trip


async def is_trip_owner_or_active_member(session: AsyncSession, trip: Trip, user_id: str) -> bool:
    if str(trip.user_id) == user_id:
        return True
    result = await session.execute(
        select(TripMember).where(
            TripMember.trip_id == trip.id,
            TripMember.user_id == uuid.UUID(user_id),
            TripMember.status == TripMemberStatus.ACTIVE,
        )
    )
    return result.scalar_one_or_none() is not None
