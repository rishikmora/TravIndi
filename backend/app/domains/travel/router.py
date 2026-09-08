"""Travel domain. `trips_router` (Phase 10) is real; itinerary generation is
real as of Phase 12 (app/domains/travel/planner.py); safe-route scoring is
real as of Phase 13 (app/domains/travel/routing.py) — prototype depth, see
that module's docstring for what's genuinely computed vs. simplified
(straight-line geometry, no OSRM). Canonical route paths per
docs/00-planning/02-conflict-register.md §4 (`/api/v1/routes/{mode}`, not
the source blueprint's `/geo/{mode}-route`).
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.core.opa import require_allowed
from app.db.session import get_db_session
from app.domains.tourism.models import Attraction
from app.domains.travel.models import Itinerary, Route, RouteMode, Trip, TripStatus
from app.domains.travel.planner import generate_itinerary
from app.domains.travel.routing import score_route
from app.domains.travel.schemas import (
    ItineraryGenerateIn,
    ItineraryItemOut,
    ItineraryOut,
    ItineraryReplanIn,
    RouteOut,
    RouteRequestIn,
    TripCreateIn,
    TripOut,
    TripPlanRequestIn,
    TripUpdateIn,
)
from app.schemas.common import DataResponse, ListResponse

trips_router = APIRouter(prefix="/trips", tags=["trips"])
ai_router = APIRouter(prefix="/ai", tags=["ai-planning"])
routes_router = APIRouter(prefix="/routes", tags=["routes"])


async def _to_itinerary_out(session: AsyncSession, row: Itinerary) -> ItineraryOut:
    """Resolves each item's `attraction_name` via a single batch query — the
    frontend has no other way to turn an `attraction_id` into something
    human-readable without a second round trip per item."""
    attraction_ids = [item.attraction_id for item in row.items if item.attraction_id is not None]
    names: dict[uuid.UUID, str] = {}
    if attraction_ids:
        result = await session.execute(select(Attraction.id, Attraction.name).where(Attraction.id.in_(attraction_ids)))
        names = dict(result.all())

    return ItineraryOut(
        id=row.id,
        trip_id=row.trip_id,
        version=row.version,
        generated_by=row.generated_by,
        total_cost=row.total_cost,
        currency=row.currency,
        items=[
            ItineraryItemOut(
                id=item.id,
                item_type=item.item_type.value,
                attraction_id=item.attraction_id,
                attraction_name=names.get(item.attraction_id) if item.attraction_id else None,
                sequence=item.sequence,
                scheduled_time=item.scheduled_time,
                cost=item.cost,
                currency=item.currency,
                reason_code=item.reason_code,
                explanation=item.explanation,
            )
            for item in sorted(row.items, key=lambda i: i.sequence)
        ],
    )


def _to_trip_out(row: Trip) -> TripOut:
    return TripOut(
        id=row.id,
        user_id=row.user_id,
        title=row.title,
        start_date=row.start_date,
        end_date=row.end_date,
        budget=row.budget,
        currency=row.currency,
        status=row.status.value,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _get_own_trip(trip_id: uuid.UUID, principal: Principal, session: AsyncSession, action: str) -> Trip:
    """Fetch-then-authorize: the trip_id is client-supplied and could name
    someone else's trip, so — unlike list/create, where there's nothing to
    decide — this goes through OPA's "self" resource rule rather than an
    inline equality check, consistent with how every other owner-gated
    resource in this codebase is authorized."""
    trip = await session.get(Trip, trip_id)
    if trip is None:
        raise AppError(code="TRIP_NOT_FOUND", message="No such trip.", status_code=404)
    await require_allowed(principal=principal, action=action, resource_type="self", owner_id=str(trip.user_id))
    return trip


@trips_router.post("", response_model=DataResponse[TripOut], status_code=201)
async def create_trip(
    body: TripCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripOut]:
    trip = Trip(
        user_id=uuid.UUID(principal.user_id),
        title=body.title,
        start_date=body.start_date,
        end_date=body.end_date,
        budget=body.budget,
        currency=body.currency,
    )
    session.add(trip)
    await session.commit()
    return DataResponse(data=_to_trip_out(trip))


@trips_router.get("", response_model=ListResponse[TripOut])
async def list_my_trips(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[TripOut]:
    result = await session.execute(
        select(Trip).where(Trip.user_id == uuid.UUID(principal.user_id)).order_by(Trip.created_at.desc())
    )
    return ListResponse(data=[_to_trip_out(t) for t in result.scalars().all()])


@trips_router.get("/{trip_id}", response_model=DataResponse[TripOut])
async def get_trip(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripOut]:
    trip = await _get_own_trip(trip_id, principal, session, action="read")
    return DataResponse(data=_to_trip_out(trip))


@trips_router.patch("/{trip_id}", response_model=DataResponse[TripOut])
async def update_trip(
    trip_id: uuid.UUID,
    body: TripUpdateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripOut]:
    trip = await _get_own_trip(trip_id, principal, session, action="write")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(trip, field, value)
    await session.commit()
    return DataResponse(data=_to_trip_out(trip))


@trips_router.delete("/{trip_id}", status_code=204)
async def cancel_trip(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Cancels (status -> CANCELLED), never hard-deletes — trips feed
    itineraries/bookings that should retain history."""
    trip = await _get_own_trip(trip_id, principal, session, action="write")
    trip.status = TripStatus.CANCELLED
    await session.commit()


@ai_router.post("/trip-plan", response_model=DataResponse[ItineraryOut], status_code=201)
async def create_trip_plan(
    body: TripPlanRequestIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ItineraryOut]:
    """Creates a brand-new Trip from a prompt, then generates its first
    itinerary in the same call — the "plan me a trip" conversational entry
    point. No pre-check needed (same as plain `create_trip`): a principal
    may always create their own trip; ownership only matters once one
    exists, which `_get_own_trip` enforces everywhere else."""
    trip = Trip(
        user_id=uuid.UUID(principal.user_id),
        start_date=body.start_date,
        end_date=body.end_date,
        budget=body.budget,
        currency=body.currency,
    )
    session.add(trip)
    await session.flush()
    generated = await generate_itinerary(
        session,
        user_id=principal.user_id,
        trip=trip,
        prompt=body.prompt,
        destination_id=body.destination_id,
    )
    await session.commit()
    return DataResponse(data=await _to_itinerary_out(session, generated.itinerary))


@ai_router.post("/itinerary/generate", response_model=DataResponse[ItineraryOut], status_code=201)
async def generate_itinerary_for_trip(
    body: ItineraryGenerateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ItineraryOut]:
    """Generates an itinerary for a Trip that already exists — e.g. one
    created via plain `POST /trips` (Phase 10). Fills a real gap between
    docs/00-planning/05-traceability-matrix-mvp.md §2 (which lists this
    path as part of FR-02's API surface) and what Phase 8 actually stubbed
    (only trip-plan and replan)."""
    trip = await _get_own_trip(body.trip_id, principal, session, action="write")
    generated = await generate_itinerary(
        session,
        user_id=principal.user_id,
        trip=trip,
        prompt=body.prompt,
        destination_id=body.destination_id,
    )
    await session.commit()
    return DataResponse(data=await _to_itinerary_out(session, generated.itinerary))


@ai_router.post("/itinerary/{itinerary_id}/replan", response_model=DataResponse[ItineraryOut])
async def replan_itinerary(
    itinerary_id: uuid.UUID,
    body: ItineraryReplanIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ItineraryOut]:
    """Re-plans an existing itinerary into a new version on the same trip —
    the old version's rows are left untouched (same "never hard-delete,
    keep history" convention `cancel_trip` follows)."""
    old = await session.get(Itinerary, itinerary_id, options=[selectinload(Itinerary.items)])
    if old is None:
        raise AppError(code="ITINERARY_NOT_FOUND", message="No such itinerary.", status_code=404)
    trip = await _get_own_trip(old.trip_id, principal, session, action="write")

    destination_id = None
    if old.items:
        first_item = min(old.items, key=lambda i: i.sequence)
        if first_item.attraction_id is not None:
            attraction = await session.get(Attraction, first_item.attraction_id)
            destination_id = attraction.destination_id if attraction else None

    prompt = f"Replan reason: {body.reason}. Additional context: {body.context}"
    generated = await generate_itinerary(
        session,
        user_id=principal.user_id,
        trip=trip,
        prompt=prompt,
        destination_id=destination_id,
    )
    await session.commit()
    return DataResponse(data=await _to_itinerary_out(session, generated.itinerary))


@trips_router.get("/{trip_id}/itinerary", response_model=DataResponse[ItineraryOut])
async def get_trip_itinerary(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ItineraryOut]:
    """The only way to see an itinerary again after navigating away — the
    AI endpoints only ever return one as a direct response, there was no
    read path until now."""
    trip = await _get_own_trip(trip_id, principal, session, action="read")
    result = await session.execute(
        select(Itinerary)
        .options(selectinload(Itinerary.items))
        .where(Itinerary.trip_id == trip.id)
        .order_by(Itinerary.version.desc())
        .limit(1)
    )
    itinerary = result.scalars().first()
    if itinerary is None:
        raise AppError(
            code="ITINERARY_NOT_FOUND", message="No itinerary has been generated for this trip yet.", status_code=404
        )
    return DataResponse(data=await _to_itinerary_out(session, itinerary))


async def _compute_route(body: RouteRequestIn, mode: RouteMode, session: AsyncSession) -> DataResponse[RouteOut]:
    result = await score_route(
        session,
        mode=mode,
        origin_lon=body.origin_lon,
        origin_lat=body.origin_lat,
        destination_lon=body.destination_lon,
        destination_lat=body.destination_lat,
    )
    now = datetime.now(UTC)
    route = Route(
        mode=mode,
        origin=f"SRID=4326;POINT({body.origin_lon} {body.origin_lat})",
        destination=f"SRID=4326;POINT({body.destination_lon} {body.destination_lat})",
        geometry=f"SRID=4326;LINESTRING({body.origin_lon} {body.origin_lat}, {body.destination_lon} {body.destination_lat})",
        score=result.score,
        reasons=result.reasons,
        confidence=result.confidence,
        computed_at=now,
        valid_until=now + timedelta(minutes=15),
    )
    session.add(route)
    await session.commit()
    return DataResponse(
        data=RouteOut(id=route.id, mode=route.mode.value, score=route.score, reasons=route.reasons, confidence=route.confidence)
    )


@routes_router.post("/safe", response_model=DataResponse[RouteOut])
async def route_safe(body: RouteRequestIn, session: AsyncSession = Depends(get_db_session)) -> DataResponse[RouteOut]:
    return await _compute_route(body, RouteMode.SAFE, session)


@routes_router.post("/crowd-free", response_model=DataResponse[RouteOut])
async def route_crowd_free(
    body: RouteRequestIn, session: AsyncSession = Depends(get_db_session)
) -> DataResponse[RouteOut]:
    return await _compute_route(body, RouteMode.CROWD_FREE, session)


@routes_router.post("/accessible", response_model=DataResponse[RouteOut])
async def route_accessible(
    body: RouteRequestIn, session: AsyncSession = Depends(get_db_session)
) -> DataResponse[RouteOut]:
    return await _compute_route(body, RouteMode.ACCESSIBLE, session)


@routes_router.post("/emergency", response_model=DataResponse[RouteOut])
async def route_emergency(
    body: RouteRequestIn, session: AsyncSession = Depends(get_db_session)
) -> DataResponse[RouteOut]:
    return await _compute_route(body, RouteMode.EMERGENCY, session)
