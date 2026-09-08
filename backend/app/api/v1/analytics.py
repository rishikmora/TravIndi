"""Tourism operations analytics (FR-39), Round 3 pass. Real aggregate
queries over data this build already has — businesses, guides, trips,
bookings, reviews, fraud cases — no new tables (the `analytics` schema is
confirmed schema-only, "built out as needed post-MVP",
docs/00-planning/09-database-schema-plan.md §1). Distinct from
`app/api/v1/authority.py`'s dashboard, which is safety/SOS-focused
(active_sos_count, open_incident_count) — this one is the tourism/business
side neither that endpoint nor any other covers.

Access is gated by a direct role check, same documented reasoning as
`authority.py`: a read-only aggregate view has no per-row ownership
semantics for OPA's resource types to express.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.booking.models import Booking, BookingStatus
from app.domains.business.models import Business, Guide
from app.domains.tourism.models import Attraction, Destination
from app.domains.travel.models import ItineraryItem, Trip
from app.domains.trust.models import FraudCase, FraudCaseStatus, Review, ReviewAnalysis
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])

_ANALYTICS_ROLES = {"authority_tourism_dept", "authority_platform_admin", "service"}


def _require_tourism_authority(principal: Principal) -> None:
    if principal.role not in _ANALYTICS_ROLES:
        raise AppError(
            code="FORBIDDEN", message="Only tourism-department authority accounts can view analytics.", status_code=403
        )


class AnalyticsOverviewOut(BaseModel):
    total_destinations: int
    total_businesses: int
    verified_businesses: int
    total_guides: int
    verified_guides: int
    total_trips: int
    confirmed_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    total_reviews: int
    average_review_authenticity: float | None
    open_fraud_cases: int
    computed_at: datetime


class TrendingDestinationOut(BaseModel):
    destination_id: uuid.UUID
    destination_name: str
    itinerary_items_last_7_days: int


@router.get("/overview", response_model=DataResponse[AnalyticsOverviewOut])
async def get_analytics_overview(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[AnalyticsOverviewOut]:
    _require_tourism_authority(principal)

    total_destinations = await session.scalar(select(func.count(Destination.id)))
    total_businesses = await session.scalar(select(func.count(Business.id)))
    verified_businesses = await session.scalar(select(func.count(Business.id)).where(Business.is_verified.is_(True)))
    total_guides = await session.scalar(select(func.count(Guide.id)))
    verified_guides = await session.scalar(select(func.count(Guide.id)).where(Guide.is_verified.is_(True)))
    total_trips = await session.scalar(select(func.count(Trip.id)))
    confirmed_bookings = await session.scalar(
        select(func.count(Booking.id)).where(Booking.status == BookingStatus.CONFIRMED)
    )
    completed_bookings = await session.scalar(
        select(func.count(Booking.id)).where(Booking.status == BookingStatus.COMPLETED)
    )
    cancelled_bookings = await session.scalar(
        select(func.count(Booking.id)).where(Booking.status == BookingStatus.CANCELLED)
    )
    total_reviews = await session.scalar(select(func.count(Review.id)))
    average_authenticity = await session.scalar(select(func.avg(ReviewAnalysis.authenticity_score)))
    open_fraud_cases = await session.scalar(
        select(func.count(FraudCase.id)).where(FraudCase.status == FraudCaseStatus.OPEN)
    )

    return DataResponse(
        data=AnalyticsOverviewOut(
            total_destinations=total_destinations or 0,
            total_businesses=total_businesses or 0,
            verified_businesses=verified_businesses or 0,
            total_guides=total_guides or 0,
            verified_guides=verified_guides or 0,
            total_trips=total_trips or 0,
            confirmed_bookings=confirmed_bookings or 0,
            completed_bookings=completed_bookings or 0,
            cancelled_bookings=cancelled_bookings or 0,
            total_reviews=total_reviews or 0,
            average_review_authenticity=float(average_authenticity) if average_authenticity is not None else None,
            open_fraud_cases=open_fraud_cases or 0,
            computed_at=datetime.now(UTC),
        )
    )


@router.get("/trending-destinations", response_model=ListResponse[TrendingDestinationOut])
async def get_trending_destinations(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[TrendingDestinationOut]:
    """Predictive-tourism-adjacent "momentum" signal (FR-33/FR-39): real
    count of itinerary items *created* in the last 7 days per destination,
    ordered descending — surfaces genuinely rising interest from real
    trip-planning activity, never a trained/forecast number."""
    _require_tourism_authority(principal)
    since = datetime.now(UTC) - timedelta(days=7)
    query = (
        select(Destination.id, Destination.name, func.count(ItineraryItem.id))
        .select_from(Destination)
        .join(Attraction, Attraction.destination_id == Destination.id)
        .join(ItineraryItem, ItineraryItem.attraction_id == Attraction.id)
        .where(ItineraryItem.created_at >= since)
        .group_by(Destination.id, Destination.name)
        .order_by(func.count(ItineraryItem.id).desc())
        .limit(10)
    )
    rows = (await session.execute(query)).all()
    return ListResponse(
        data=[
            TrendingDestinationOut(destination_id=row[0], destination_name=row[1], itinerary_items_last_7_days=row[2])
            for row in rows
        ]
    )
