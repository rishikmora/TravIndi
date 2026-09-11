"""Shared trip fetch-then-authorize check — extracted from
`travel/router.py` so `app/domains/adaptation/router.py` can reuse the
exact same ownership rule for a new, trip-scoped resource without
importing a private underscore-prefixed helper across domains.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal
from app.core.errors import AppError
from app.core.opa import is_allowed
from app.domains.group_travel.access import is_trip_owner_or_active_member
from app.domains.travel.models import Trip


async def get_own_trip(trip_id: uuid.UUID, principal: Principal, session: AsyncSession, action: str) -> Trip:
    """Fetch-then-authorize: the trip_id is client-supplied and could name
    someone else's trip, so — unlike list/create, where there's nothing to
    decide — this goes through OPA's "self" resource rule rather than an
    inline equality check, consistent with how every other owner-gated
    resource in this codebase is authorized.

    A `read` additionally succeeds for an ACTIVE `group_travel.trip_members`
    row (Feature Blueprint P2 "shared itinerary") — real group membership,
    not a relaxed policy — or for *any* principal when the trip itself is
    `is_public` (Feature Blueprint P2 "Public trip journals": the owner
    explicitly opted in to sharing it, so a read is exactly what they asked
    for). `write`/`approve`/`reject` actions stay owner-only, unchanged —
    `is_public` never grants edit rights."""
    trip = await session.get(Trip, trip_id)
    if trip is None:
        raise AppError(code="TRIP_NOT_FOUND", message="No such trip.", status_code=404)
    allowed = await is_allowed(principal=principal, action=action, resource_type="self", owner_id=str(trip.user_id))
    if not allowed and action == "read":
        allowed = trip.is_public or await is_trip_owner_or_active_member(session, trip, principal.user_id)
    if not allowed:
        raise AppError(code="FORBIDDEN", message="You are not authorized to perform this action.", status_code=403)
    return trip
