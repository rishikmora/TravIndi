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
from itertools import pairwise
from typing import Any

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, get_current_principal, get_pagination, get_rls_session
from app.core.errors import AppError
from app.core.geo import haversine_meters
from app.db.session import get_db_session
from app.domains.tourism.models import Attraction
from app.domains.travel import intent
from app.domains.travel.access import get_own_trip
from app.domains.travel.models import Itinerary, ItineraryItem, Route, RouteMode, Trip, TripStatus
from app.domains.travel.planner import (
    generate_itinerary,
    is_current_itinerary,
    normalize_category_term,
)
from app.domains.travel.routing import score_route
from app.domains.travel.schemas import (
    CarbonFootprintOut,
    ItineraryGenerateIn,
    ItineraryItemOut,
    ItineraryItemUpdateIn,
    ItineraryOut,
    ItineraryReplanIn,
    RouteOut,
    RouteRequestIn,
    TripCreateIn,
    TripIntentExtractIn,
    TripIntentExtractOut,
    TripOut,
    TripPlanRequestIn,
    TripUpdateIn,
)
from app.schemas.common import DataResponse, ListResponse, Pagination

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

    # unmatched_avoid_terms is computed at read time (not just at generation
    # time) so it stays correct for GET /trips/{id}/itinerary too, not only
    # the immediate generate/replan response.
    unmatched_avoid_terms: list[str] = []
    trip = await session.get(Trip, row.trip_id)
    if trip is not None and trip.avoid and row.destination_id is not None:
        categories = (
            await session.execute(
                select(Attraction.category).where(Attraction.destination_id == row.destination_id).distinct()
            )
        ).scalars().all()
        category_set = {normalize_category_term(c) for c in categories if c}
        unmatched_avoid_terms = [t for t in trip.avoid if normalize_category_term(t) not in category_set]

    return ItineraryOut(
        id=row.id,
        trip_id=row.trip_id,
        destination_id=row.destination_id,
        version=row.version,
        generated_by=row.generated_by,
        total_cost=row.total_cost,
        currency=row.currency,
        cost_estimate_available=any(item.cost is not None for item in row.items),
        replan_reason=row.replan_reason,
        previous_version=row.previous_version,
        unmatched_avoid_terms=unmatched_avoid_terms,
        items=[
            ItineraryItemOut(
                id=item.id,
                item_type=item.item_type.value,
                attraction_id=item.attraction_id,
                attraction_name=names.get(item.attraction_id) if item.attraction_id else None,
                sequence=item.sequence,
                day_offset=item.day_offset,
                time_of_day=item.time_of_day,
                scheduled_time=item.scheduled_time,
                cost=item.cost,
                currency=item.currency,
                reason_code=item.reason_code,
                explanation=item.explanation,
                nearest_accessible_facility_m=(item.score_snapshot or {}).get("nearest_accessible_facility_m"),
                note=item.note,
                completed=item.completed,
                item_version=item.item_version,
            )
            for item in sorted(row.items, key=lambda i: i.sequence)
        ],
    )


def _to_point(wkb_element: Any) -> Any:
    """Same GeoAlchemy2 typing workaround as `business/router.py`'s
    `_to_geo_point` — mypy sees a Geography column as `str`, but at
    runtime it's a real WKBElement once fetched from the DB."""
    return to_shape(wkb_element)


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
        is_public=row.is_public,
        interests=row.interests,
        avoid=row.avoid,
        pace=row.pace,
        safety_preference=row.safety_preference,
        days=row.days,
        nights=row.nights,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


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
        interests=body.interests,
        avoid=body.avoid,
        pace=body.pace,
        safety_preference=body.safety_preference,
        days=body.days,
        nights=body.nights,
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


@trips_router.get("/public", response_model=ListResponse[TripOut])
async def list_public_trips(
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[TripOut]:
    """Feature Blueprint P2 "Public trip journals" — real, owner-opted-in
    trips, browsable by anyone (no auth needed, same as destination
    content). Registered before `/{trip_id}` so "public" is never
    swallowed as a trip_id path param."""
    result = await session.execute(
        select(Trip).where(Trip.is_public.is_(True)).order_by(Trip.updated_at.desc()).limit(pagination.limit)
    )
    return ListResponse(data=[_to_trip_out(t) for t in result.scalars().all()])


@trips_router.get("/{trip_id}", response_model=DataResponse[TripOut])
async def get_trip(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripOut]:
    trip = await get_own_trip(trip_id, principal, session, action="read")
    return DataResponse(data=_to_trip_out(trip))


@trips_router.patch("/{trip_id}", response_model=DataResponse[TripOut])
async def update_trip(
    trip_id: uuid.UUID,
    body: TripUpdateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripOut]:
    trip = await get_own_trip(trip_id, principal, session, action="write")
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
    trip = await get_own_trip(trip_id, principal, session, action="write")
    trip.status = TripStatus.CANCELLED
    await session.commit()


@ai_router.post("/trip-intent/extract", response_model=DataResponse[TripIntentExtractOut])
async def extract_trip_intent_endpoint(
    body: TripIntentExtractIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripIntentExtractOut]:
    """Free-text -> structured, partial trip intent, with any mentioned
    destination resolved against real rows server-side (see
    app/domains/travel/intent.py — the model is never trusted with an id).
    No RLS session needed: this reads/writes nothing RLS-protected."""
    result = await intent.extract_trip_intent(session, user_id=principal.user_id, prompt=body.prompt)
    await session.commit()
    return DataResponse(data=result)


@ai_router.post("/trip-plan", response_model=DataResponse[ItineraryOut], status_code=201)
async def create_trip_plan(
    body: TripPlanRequestIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ItineraryOut]:
    """Creates a brand-new Trip from a prompt, then generates its first
    itinerary in the same call — the "plan me a trip" conversational entry
    point. No pre-check needed (same as plain `create_trip`): a principal
    may always create their own trip; ownership only matters once one
    exists, which `get_own_trip` enforces everywhere else.

    Uses `get_rls_session`, not plain `get_db_session`: `generate_itinerary`
    falls back to the caller's own saved `identity.user_profiles.
    travel_preferences` when the request doesn't override traveler context,
    and that table has RLS enabled — a plain session has no
    `app.current_user_id` set, so the lookup would silently see zero rows
    (real bug hit and fixed while building the disability-aware planner)."""
    trip = Trip(
        user_id=uuid.UUID(principal.user_id),
        start_date=body.start_date,
        end_date=body.end_date,
        budget=body.budget,
        currency=body.currency,
        interests=body.interests,
        avoid=body.avoid,
        pace=body.pace,
        safety_preference=body.safety_preference,
        days=body.days,
        nights=body.nights,
    )
    session.add(trip)
    await session.flush()
    generated = await generate_itinerary(
        session,
        user_id=principal.user_id,
        trip=trip,
        prompt=body.prompt,
        destination_id=body.destination_id,
        traveler_type=body.traveler_type,
        accessibility_needs=body.accessibility_needs,
        family_children_count=body.family_children_count,
        family_seniors_count=body.family_seniors_count,
    )
    await session.commit()
    return DataResponse(data=await _to_itinerary_out(session, generated.itinerary))


@ai_router.post("/itinerary/generate", response_model=DataResponse[ItineraryOut], status_code=201)
async def generate_itinerary_for_trip(
    body: ItineraryGenerateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ItineraryOut]:
    """Generates an itinerary for a Trip that already exists — e.g. one
    created via plain `POST /trips` (Phase 10). Fills a real gap between
    docs/00-planning/05-traceability-matrix-mvp.md §2 (which lists this
    path as part of FR-02's API surface) and what Phase 8 actually stubbed
    (only trip-plan and replan)."""
    trip = await get_own_trip(body.trip_id, principal, session, action="write")
    generated = await generate_itinerary(
        session,
        user_id=principal.user_id,
        trip=trip,
        prompt=body.prompt,
        destination_id=body.destination_id,
        traveler_type=body.traveler_type,
        accessibility_needs=body.accessibility_needs,
        family_children_count=body.family_children_count,
        family_seniors_count=body.family_seniors_count,
    )
    await session.commit()
    return DataResponse(data=await _to_itinerary_out(session, generated.itinerary))


_QUICK_ACTION_PREFIX = {
    "cheaper": "Make this more budget-conscious.",
    "more_relaxed": "Make the pace more relaxed, with more buffer time.",
    "more_heritage": "Include more heritage/cultural attractions.",
    "more_food": "Prioritize food-related experiences where possible.",
    "less_walking": "Reduce the amount of walking between stops.",
    "avoid_crowds": "Prefer lower-crowd options where a real alternative exists.",
    "improve_safety": "Weigh safety more heavily in the selections.",
}


@ai_router.post("/itinerary/{itinerary_id}/replan", response_model=DataResponse[ItineraryOut])
async def replan_itinerary(
    itinerary_id: uuid.UUID,
    body: ItineraryReplanIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ItineraryOut]:
    """Re-plans an existing itinerary into a new version on the same trip —
    the old version's rows are left untouched (same "never hard-delete,
    keep history" convention `cancel_trip` follows)."""
    old = await session.get(Itinerary, itinerary_id, options=[selectinload(Itinerary.items)])
    if old is None:
        raise AppError(code="ITINERARY_NOT_FOUND", message="No such itinerary.", status_code=404)
    trip = await get_own_trip(old.trip_id, principal, session, action="write")

    destination_id = old.destination_id
    if destination_id is None and old.items:
        # Pre-migration rows only — fresh itineraries always set
        # destination_id directly now (see planner.py::generate_itinerary).
        first_item = min(old.items, key=lambda i: i.sequence)
        if first_item.attraction_id is not None:
            attraction = await session.get(Attraction, first_item.attraction_id)
            destination_id = attraction.destination_id if attraction else None

    reason_text = body.reason
    if body.quick_action is not None:
        reason_text = f"{_QUICK_ACTION_PREFIX[body.quick_action]} {reason_text}".strip()

    prompt = f"Replan reason: {reason_text}. Additional context: {body.context}"
    generated = await generate_itinerary(
        session,
        user_id=principal.user_id,
        trip=trip,
        prompt=prompt,
        destination_id=destination_id,
    )
    generated.itinerary.replan_reason = reason_text
    generated.itinerary.previous_version = old.version
    await session.commit()
    return DataResponse(data=await _to_itinerary_out(session, generated.itinerary))


async def apply_itinerary_item_update(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    note: str | None,
    completed: bool | None,
    base_item_version: int,
) -> ItineraryItem:
    """Shared by the direct `PATCH .../items/{item_id}` endpoint and
    `POST /api/v1/sync`'s `itinerary_item`/`UPDATE` handling — one real
    conflict-checked write path, not two. Raises `AppError` with
    `ITEM_NOT_FOUND` / `FORBIDDEN` / `ITEM_VERSION_CONFLICT` /
    `ITINERARY_SUPERSEDED` on any non-happy path; callers decide how to
    surface each (an HTTP status for the direct endpoint, a `conflicted`/
    `rejected` sync bucket entry for the queue)."""
    item = await session.get(ItineraryItem, item_id)
    if item is None:
        raise AppError(code="ITEM_NOT_FOUND", message="No such itinerary item.", status_code=404)
    itinerary = await session.get(Itinerary, item.itinerary_id)
    trip = await session.get(Trip, itinerary.trip_id) if itinerary else None
    if itinerary is None or trip is None:
        raise AppError(code="ITEM_NOT_FOUND", message="No such itinerary item.", status_code=404)
    if trip.user_id != user_id:
        raise AppError(code="FORBIDDEN", message="You are not authorized to edit this item.", status_code=403)
    if not await is_current_itinerary(session, itinerary):
        raise AppError(
            code="ITINERARY_SUPERSEDED",
            message="This itinerary has been replaced by a newer version — your edit didn't apply.",
            status_code=409,
        )
    if item.item_version != base_item_version:
        raise AppError(
            code="ITEM_VERSION_CONFLICT",
            message="This item was changed elsewhere — your edit didn't apply.",
            status_code=409,
        )
    if note is not None:
        item.note = note
    if completed is not None:
        item.completed = completed
    item.item_version += 1
    await session.flush()
    return item


@trips_router.patch(
    "/{trip_id}/itinerary/{itinerary_id}/items/{item_id}", response_model=DataResponse[ItineraryItemOut]
)
async def update_itinerary_item(
    trip_id: uuid.UUID,
    itinerary_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ItineraryItemUpdateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ItineraryItemOut]:
    """Real item-level itinerary mutation (offline-first upgrade) — a
    traveler checking off a stop or leaving a note, independent of the
    AI's whole-itinerary regeneration path. `trip_id`/`itinerary_id` in
    the path are used only to keep the URL RESTful and consistent with
    `GET /trips/{trip_id}/itinerary`; `apply_itinerary_item_update` itself
    re-derives and checks ownership from `item_id` alone."""
    item = await apply_itinerary_item_update(
        session,
        user_id=uuid.UUID(principal.user_id),
        item_id=item_id,
        note=body.note,
        completed=body.completed,
        base_item_version=body.base_item_version,
    )
    await session.commit()
    attraction_name = None
    if item.attraction_id is not None:
        attraction = await session.get(Attraction, item.attraction_id)
        attraction_name = attraction.name if attraction else None
    return DataResponse(
        data=ItineraryItemOut(
            id=item.id,
            item_type=item.item_type.value,
            attraction_id=item.attraction_id,
            attraction_name=attraction_name,
            sequence=item.sequence,
            day_offset=item.day_offset,
            time_of_day=item.time_of_day,
            scheduled_time=item.scheduled_time,
            cost=item.cost,
            currency=item.currency,
            reason_code=item.reason_code,
            explanation=item.explanation,
            nearest_accessible_facility_m=(item.score_snapshot or {}).get("nearest_accessible_facility_m"),
            note=item.note,
            completed=item.completed,
            item_version=item.item_version,
        )
    )


@trips_router.get("/{trip_id}/itinerary", response_model=DataResponse[ItineraryOut])
async def get_trip_itinerary(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ItineraryOut]:
    """The only way to see an itinerary again after navigating away — the
    AI endpoints only ever return one as a direct response, there was no
    read path until now."""
    trip = await get_own_trip(trip_id, principal, session, action="read")
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


_KG_CO2_PER_KM = 0.12
"""Feature Blueprint P2 Sustainability "Tourist carbon footprint" — a
commonly-cited illustrative average-local-transport emission factor
(car/taxi-scale, kg CO2 per km), not looked up per vehicle type since this
app never records which mode a tourist actually used between stops. Applied
to the real straight-line distance between the trip's real itinerary stops
— an honest rough estimate, never presented as a certified calculation
(`method` always says so)."""


@trips_router.get("/{trip_id}/carbon-footprint", response_model=DataResponse[CarbonFootprintOut])
async def get_trip_carbon_footprint(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[CarbonFootprintOut]:
    trip = await get_own_trip(trip_id, principal, session, action="read")
    itinerary = (
        await session.execute(
            select(Itinerary).where(Itinerary.trip_id == trip.id).order_by(Itinerary.version.desc()).limit(1)
        )
    ).scalars().first()
    if itinerary is None:
        return DataResponse(
            data=CarbonFootprintOut(trip_id=trip.id, total_distance_km=0.0, estimated_kg_co2=0.0, stops_counted=0)
        )

    items = (
        await session.execute(
            select(ItineraryItem)
            .where(ItineraryItem.itinerary_id == itinerary.id, ItineraryItem.attraction_id.is_not(None))
            .order_by(ItineraryItem.sequence)
        )
    ).scalars().all()
    attraction_ids = [i.attraction_id for i in items if i.attraction_id is not None]
    attractions = {
        a.id: a for a in (await session.execute(select(Attraction).where(Attraction.id.in_(attraction_ids)))).scalars()
    }

    points = [_to_point(attractions[i.attraction_id].location) for i in items if i.attraction_id in attractions]
    total_km = 0.0
    for a, b in pairwise(points):
        total_km += haversine_meters(a.x, a.y, b.x, b.y) / 1000.0

    return DataResponse(
        data=CarbonFootprintOut(
            trip_id=trip.id, total_distance_km=round(total_km, 2), estimated_kg_co2=round(total_km * _KG_CO2_PER_KM, 2),
            stops_counted=len(points),
        )
    )


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
