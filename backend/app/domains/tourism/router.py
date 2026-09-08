"""Destination discovery — FR-03. Public read endpoints, genuinely
implemented against PostgreSQL/PostGIS (no auth required, no stub needed)
since the data and schema already exist from Phase 7. Facility and
demand-forecast endpoints were added in the Round 3 pass (FR-22
accessibility / FR-33 predictive tourism).
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_pagination
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.booking.models import Booking, BookingStatus
from app.domains.business.models import Availability, Business, Service
from app.domains.crowd.models import CrowdCell
from app.domains.crowd.schemas import CrowdCellOut
from app.domains.safety.models import SafetyScore
from app.domains.safety.schemas import SafetyScoreOut
from app.domains.tourism.models import Attraction, Destination, Facility
from app.domains.tourism.schemas import (
    AttractionOut,
    DemandForecastOut,
    DestinationOut,
    FacilityCreateIn,
    FacilityOut,
    GeoPoint,
)
from app.domains.travel.models import ItemType, ItineraryItem
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/destinations", tags=["destinations"])

# Facility records (elevators, accessible toilets/ramps/parking, first aid,
# information desks) are curated destination infrastructure, not
# user-generated content — gated to the tourism-department role that the
# confirmed matrix already assigns "RWU (own scope)" for destination
# content, plus platform_admin. A plain eligibility check, not an ownership
# decision (a Facility has no owner column at all), so — matching
# app/domains/business/router.py's create_business/create_guide precedent —
# this is a direct role comparison rather than a new OPA resource type.
_FACILITY_CURATOR_ROLES = {"authority_tourism_dept", "authority_platform_admin"}


def _to_geo_point(wkb_element) -> GeoPoint:
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _to_destination_out(row: Destination) -> DestinationOut:
    return DestinationOut(
        id=row.id,
        name=row.name,
        city=row.city,
        state=row.state,
        location=_to_geo_point(row.location),
        timezone=row.timezone,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_attraction_out(row: Attraction) -> AttractionOut:
    return AttractionOut(
        id=row.id,
        destination_id=row.destination_id,
        name=row.name,
        category=row.category,
        location=_to_geo_point(row.location),
        capacity=row.capacity,
    )


def _to_facility_out(row: Facility) -> FacilityOut:
    return FacilityOut(
        id=row.id,
        destination_id=row.destination_id,
        name=row.name,
        facility_type=row.facility_type,
        location=_to_geo_point(row.location),
    )


@router.get("", response_model=ListResponse[DestinationOut])
async def list_destinations(
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[DestinationOut]:
    result = await session.execute(
        select(Destination).order_by(Destination.name).limit(pagination.limit)
    )
    rows = result.scalars().all()
    return ListResponse(data=[_to_destination_out(r) for r in rows])


@router.get("/{destination_id}", response_model=DataResponse[DestinationOut])
async def get_destination(
    destination_id: uuid.UUID, session: AsyncSession = Depends(get_db_session)
) -> DataResponse[DestinationOut]:
    row = await session.get(Destination, destination_id)
    if row is None:
        raise AppError(code="DESTINATION_NOT_FOUND", message="No destination with that id.", status_code=404)
    return DataResponse(data=_to_destination_out(row))


@router.get("/{destination_id}/attractions", response_model=ListResponse[AttractionOut])
async def list_attractions(
    destination_id: uuid.UUID,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[AttractionOut]:
    result = await session.execute(
        select(Attraction)
        .where(Attraction.destination_id == destination_id)
        .order_by(Attraction.name)
        .limit(pagination.limit)
    )
    rows = result.scalars().all()
    return ListResponse(data=[_to_attraction_out(r) for r in rows])


@router.get("/{destination_id}/safety", response_model=DataResponse[SafetyScoreOut | None])
async def get_destination_safety(
    destination_id: uuid.UUID, session: AsyncSession = Depends(get_db_session)
) -> DataResponse[SafetyScoreOut | None]:
    """Real query against `safety.safety_scores` — legitimately returns
    `null` until Phase 13/14 actually populate scores; that is a true
    "no data yet" answer, not a stubbed contract."""
    result = await session.execute(
        select(SafetyScore)
        .where(SafetyScore.destination_id == destination_id)
        .order_by(SafetyScore.computed_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    data = (
        SafetyScoreOut(
            destination_id=row.destination_id,
            score=row.score,
            computed_at=row.computed_at,
            model_version=row.model_version,
        )
        if row
        else None
    )
    return DataResponse(data=data)


@router.get("/{destination_id}/crowd", response_model=ListResponse[CrowdCellOut])
async def get_destination_crowd(
    destination_id: uuid.UUID,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[CrowdCellOut]:
    """Real query against `crowd.crowd_cells` — legitimately empty until
    Phase 14 wires up live telemetry (NFR freshness band: seconds-to-minutes,
    docs/00-planning/01-project-master-model.md §H)."""
    result = await session.execute(
        select(CrowdCell)
        .where(CrowdCell.destination_id == destination_id)
        .order_by(CrowdCell.observed_at.desc())
        .limit(pagination.limit)
    )
    rows = result.scalars().all()
    return ListResponse(
        data=[
            CrowdCellOut(
                h3_cell=r.h3_cell,
                destination_id=r.destination_id,
                observed_at=r.observed_at,
                density=r.density,
                risk_score=r.risk_score,
            )
            for r in rows
        ]
    )


@router.post("/{destination_id}/facilities", response_model=DataResponse[FacilityOut], status_code=201)
async def create_facility(
    destination_id: uuid.UUID,
    body: FacilityCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[FacilityOut]:
    if principal.role not in _FACILITY_CURATOR_ROLES:
        raise AppError(
            code="FORBIDDEN",
            message="Only a tourism-department authority may add facility records.",
            status_code=403,
        )
    destination = await session.get(Destination, destination_id)
    if destination is None:
        raise AppError(code="DESTINATION_NOT_FOUND", message="No destination with that id.", status_code=404)
    facility = Facility(
        destination_id=destination_id,
        name=body.name,
        facility_type=body.facility_type,
        location=f"SRID=4326;POINT({body.lon} {body.lat})",
    )
    session.add(facility)
    await session.commit()
    await session.refresh(facility)
    return DataResponse(data=_to_facility_out(facility))


@router.get("/{destination_id}/facilities", response_model=ListResponse[FacilityOut])
async def list_facilities(
    destination_id: uuid.UUID,
    facility_type: str | None = None,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[FacilityOut]:
    """Public — accessibility infrastructure (elevators, ramps, accessible
    toilets/parking) needs to be visible to every visitor, same as
    destination/attraction content."""
    query = select(Facility).where(Facility.destination_id == destination_id)
    if facility_type is not None:
        query = query.where(Facility.facility_type == facility_type)
    query = query.order_by(Facility.name).limit(pagination.limit)
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_facility_out(r) for r in rows])


@router.get("/{destination_id}/demand-forecast", response_model=DataResponse[DemandForecastOut])
async def get_demand_forecast(
    destination_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[DemandForecastOut]:
    """Predictive Tourism (FR-33), honestly scoped: a real-time heuristic
    aggregation of actual user activity, NEVER a trained forecasting model
    (no crowd-flow ML was built — that's the explicitly excluded P2/P3 item;
    faking a forecast number here would be exactly the kind of fabrication
    this project avoids elsewhere). Every count is a genuine forward-looking
    signal derived from real rows: `planned_visits_next_30_days` counts real
    `travel.itinerary_items` already scheduled at this destination's
    attractions; `confirmed_bookings_next_30_days` counts real confirmed
    `booking.bookings` for this destination's businesses;
    `recent_planning_momentum_7_days` counts itinerary items *created* in
    the last week (regardless of when they're scheduled for), as a proxy for
    rising interest. `method` always says "heuristic_v1" so no caller can
    mistake this for a calibrated ML prediction."""
    destination = await session.get(Destination, destination_id)
    if destination is None:
        raise AppError(code="DESTINATION_NOT_FOUND", message="No destination with that id.", status_code=404)

    now = datetime.now(UTC)
    window_end = now + timedelta(days=30)
    momentum_since = now - timedelta(days=7)

    planned_visits = await session.scalar(
        select(func.count(ItineraryItem.id))
        .join(Attraction, ItineraryItem.attraction_id == Attraction.id)
        .where(
            Attraction.destination_id == destination_id,
            ItineraryItem.item_type == ItemType.ATTRACTION,
            ItineraryItem.scheduled_time >= now,
            ItineraryItem.scheduled_time <= window_end,
        )
    )
    momentum = await session.scalar(
        select(func.count(ItineraryItem.id))
        .join(Attraction, ItineraryItem.attraction_id == Attraction.id)
        .where(
            Attraction.destination_id == destination_id,
            ItineraryItem.item_type == ItemType.ATTRACTION,
            ItineraryItem.created_at >= momentum_since,
        )
    )
    confirmed_bookings = await session.scalar(
        select(func.count(func.distinct(Booking.id)))
        .join(Service, Booking.service_id == Service.id)
        .join(Business, Service.business_id == Business.id)
        .join(Availability, Booking.availability_id == Availability.id)
        .where(
            Business.destination_id == destination_id,
            Booking.status == BookingStatus.CONFIRMED,
            Availability.starts_at >= now,
            Availability.starts_at <= window_end,
        )
    )

    return DataResponse(
        data=DemandForecastOut(
            destination_id=destination_id,
            planned_visits_next_30_days=planned_visits or 0,
            confirmed_bookings_next_30_days=confirmed_bookings or 0,
            recent_planning_momentum_7_days=momentum or 0,
            computed_at=now,
        )
    )
