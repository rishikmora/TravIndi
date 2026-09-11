"""Business/Guide directory — FR-13 Business Verification & Trust's directory
half (self-owned data, no vendor feed — see app/domains/business/models.py's
module docstring). `is_verified` is read-only/denormalized here: it only
ever flips via app/domains/trust/router.py's verification-approval path
(trust.credentials), never a field a business/guide can set on itself.

Registration is gated by account role (only a `business`-role principal may
register a business; only a `guide`-role principal may register a guide
profile) — a plain eligibility check, not an ownership decision, so it's a
direct role comparison rather than an OPA call (OPA's `self` resource type
only ever encodes "does this user_id own that row," which is moot before
the row exists). Ownership *updates* (profile edits, adding services) do go
through `require_allowed(..., resource_type="self")`, consistent with the
confirmed matrix's "Business profile / services | RWU (own)" row.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.api.deps import Principal, get_current_principal, get_pagination
from app.core.errors import AppError
from app.core.opa import require_allowed
from app.db.session import get_db_session
from app.domains.business.models import (
    TRANSPORT_CATEGORIES,
    Availability,
    Business,
    BusinessCategory,
    BusinessProfile,
    DietaryOption,
    Guide,
    Service,
)
from app.domains.business.schemas import (
    AvailabilityCreateIn,
    AvailabilityOut,
    BusinessCreateIn,
    BusinessOut,
    BusinessProfileIn,
    BusinessProfileOut,
    GuideCreateIn,
    GuideOut,
    ServiceCreateIn,
    ServiceOut,
    TransportSearchResultOut,
)
from app.domains.tourism.models import Destination
from app.domains.tourism.schemas import GeoPoint
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/businesses", tags=["business-directory"])
guides_router = APIRouter(prefix="/guides", tags=["business-directory"])
services_router = APIRouter(prefix="/services", tags=["business-directory"])


def _to_geo_point(wkb_element: Any) -> GeoPoint | None:
    if wkb_element is None:
        return None
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _to_profile_out(profile: BusinessProfile | None) -> BusinessProfileOut | None:
    if profile is None:
        return None
    return BusinessProfileOut(
        description=profile.description,
        image_url=profile.image_url,
        contact_info=profile.contact_info,
        accessibility_features=profile.accessibility_features,
        safety_score=profile.safety_score,
        women_friendly_score=profile.women_friendly_score,
        family_friendly_score=profile.family_friendly_score,
        cuisines=profile.cuisines,
        dietary_options=profile.dietary_options,
        price_range=profile.price_range,
    )


def _to_business_out(row: Business) -> BusinessOut:
    return BusinessOut(
        id=row.id,
        owner_user_id=row.owner_user_id,
        name=row.name,
        category=row.category,
        destination_id=row.destination_id,
        location=_to_geo_point(row.location),
        is_verified=row.is_verified,
        is_eco_certified=row.is_eco_certified,
        profile=_to_profile_out(row.profile),
        created_at=row.created_at,
    )


def _to_guide_out(row: Guide) -> GuideOut:
    return GuideOut(
        id=row.id,
        user_id=row.user_id,
        languages=row.languages,
        specialties=row.specialties,
        destination_id=row.destination_id,
        is_verified=row.is_verified,
        bio=row.bio,
        created_at=row.created_at,
    )


def _to_service_out(row: Service) -> ServiceOut:
    return ServiceOut(
        id=row.id,
        business_id=row.business_id,
        name=row.name,
        description=row.description,
        base_price=row.base_price,
        currency=row.currency,
        origin_destination_id=row.origin_destination_id,
        destination_destination_id=row.destination_destination_id,
    )


def _to_availability_out(row: Availability) -> AvailabilityOut:
    return AvailabilityOut(
        id=row.id,
        service_id=row.service_id,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        capacity=row.capacity,
        booked_count=row.booked_count,
    )


async def _get_service_and_owner(session: AsyncSession, service_id: uuid.UUID) -> tuple[Service, uuid.UUID]:
    """Resolves a service's owning business in one round trip — every
    service-scoped write (adding availability, and booking itself in
    app/domains/booking/router.py) needs the real owner to authorize
    against, never a client-supplied claim."""
    service = await session.get(Service, service_id)
    if service is None:
        raise AppError(code="SERVICE_NOT_FOUND", message="No such service.", status_code=404)
    business = await session.get(Business, service.business_id)
    if business is None:
        raise AppError(code="BUSINESS_NOT_FOUND", message="No such business.", status_code=404)
    return service, business.owner_user_id


async def _get_business_or_404(session: AsyncSession, business_id: uuid.UUID) -> Business:
    business = await session.get(Business, business_id, options=[selectinload(Business.profile)])
    if business is None:
        raise AppError(code="BUSINESS_NOT_FOUND", message="No such business.", status_code=404)
    return business


async def _get_guide_or_404(session: AsyncSession, guide_id: uuid.UUID) -> Guide:
    guide = await session.get(Guide, guide_id)
    if guide is None:
        raise AppError(code="GUIDE_NOT_FOUND", message="No such guide.", status_code=404)
    return guide


@router.post("", response_model=DataResponse[BusinessOut], status_code=201)
async def create_business(
    body: BusinessCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BusinessOut]:
    if principal.role != "business":
        raise AppError(
            code="FORBIDDEN", message="Only a business-role account may register a business.", status_code=403
        )
    location = f"SRID=4326;POINT({body.lon} {body.lat})" if body.lon is not None and body.lat is not None else None
    business = Business(
        owner_user_id=uuid.UUID(principal.user_id),
        name=body.name,
        category=body.category,
        destination_id=body.destination_id,
        location=location,
    )
    session.add(business)
    await session.commit()
    await session.refresh(business, attribute_names=["profile"])
    return DataResponse(data=_to_business_out(business))


@router.post("/{business_id}/eco-certify", response_model=DataResponse[BusinessOut])
async def certify_business_eco_friendly(
    business_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BusinessOut]:
    """Feature Blueprint P2 Sustainability "Sustainable business
    verification" — same curator-role gate as `tourism.Facility`/
    `TourismEvent` (authority-only, never self-declared). Real gamification
    hook lives in `app/domains/booking/router.py`'s `create_booking`: a
    booking on an eco-certified *and* KYC-verified business earns bonus
    RESPONSIBLE_TOURISM points."""
    if principal.role not in {"authority_tourism_dept", "authority_platform_admin"}:
        raise AppError(
            code="FORBIDDEN", message="Only a tourism-department authority may certify a business as eco-friendly.",
            status_code=403,
        )
    business = await _get_business_or_404(session, business_id)
    business.is_eco_certified = True
    await session.commit()
    await session.refresh(business, attribute_names=["profile"])
    return DataResponse(data=_to_business_out(business))


@router.get("", response_model=ListResponse[BusinessOut])
async def list_businesses(
    destination_id: uuid.UUID | None = None,
    category: BusinessCategory | None = None,
    verified_only: bool = False,
    dietary_option: DietaryOption | None = None,
    cuisine: str | None = None,
    accessible_only: bool = False,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[BusinessOut]:
    query = (
        select(Business)
        .options(selectinload(Business.profile))
        .order_by(Business.created_at.desc())
        .limit(pagination.limit)
    )
    if destination_id is not None:
        query = query.where(Business.destination_id == destination_id)
    if category is not None:
        query = query.where(Business.category == category)
    if verified_only:
        query = query.where(Business.is_verified.is_(True))
    if dietary_option is not None or cuisine is not None or accessible_only:
        query = query.join(BusinessProfile, Business.profile)
        if dietary_option is not None:
            query = query.where(BusinessProfile.dietary_options.contains([dietary_option]))
        if cuisine is not None:
            query = query.where(BusinessProfile.cuisines.contains([cuisine]))
        if accessible_only:
            # Self-declared like every other business-directory attribute in
            # this domain (no vendor/inspection data source exists) — real
            # key convention, not a fabricated flag: businesses set this
            # themselves via PUT /businesses/{id}/profile.
            query = query.where(BusinessProfile.accessibility_features["wheelchair_accessible"].astext == "true")
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_business_out(r) for r in rows])


@router.get("/mine", response_model=ListResponse[BusinessOut])
async def list_my_businesses(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[BusinessOut]:
    """`GET /businesses` above has no owner filter — a business-account
    holder had no dedicated way to find the listing(s) they registered
    (they'd have to remember the id or scroll the whole public directory).
    Needed for a profile page's "My business" management card."""
    query = (
        select(Business)
        .options(selectinload(Business.profile))
        .where(Business.owner_user_id == uuid.UUID(principal.user_id))
        .order_by(Business.created_at.desc())
    )
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_business_out(r) for r in rows])


@router.get("/{business_id}", response_model=DataResponse[BusinessOut])
async def get_business(
    business_id: uuid.UUID, session: AsyncSession = Depends(get_db_session)
) -> DataResponse[BusinessOut]:
    business = await _get_business_or_404(session, business_id)
    return DataResponse(data=_to_business_out(business))


@router.put("/{business_id}/profile", response_model=DataResponse[BusinessOut])
async def upsert_business_profile(
    business_id: uuid.UUID,
    body: BusinessProfileIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BusinessOut]:
    business = await _get_business_or_404(session, business_id)
    await require_allowed(
        principal=principal, action="write", resource_type="self", owner_id=str(business.owner_user_id)
    )
    if business.profile is None:
        business.profile = BusinessProfile(
            business_id=business.id,
            description=body.description,
            image_url=body.image_url,
            contact_info=body.contact_info,
            accessibility_features=body.accessibility_features,
            cuisines=body.cuisines,
            dietary_options=list(body.dietary_options),
            price_range=body.price_range,
        )
        session.add(business.profile)
    else:
        business.profile.description = body.description
        business.profile.image_url = body.image_url
        business.profile.contact_info = body.contact_info
        business.profile.accessibility_features = body.accessibility_features
        business.profile.cuisines = body.cuisines
        business.profile.dietary_options = list(body.dietary_options)
        business.profile.price_range = body.price_range
    await session.commit()
    await session.refresh(business, attribute_names=["profile"])
    return DataResponse(data=_to_business_out(business))


@router.post("/{business_id}/services", response_model=DataResponse[ServiceOut], status_code=201)
async def create_service(
    business_id: uuid.UUID,
    body: ServiceCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ServiceOut]:
    business = await _get_business_or_404(session, business_id)
    await require_allowed(
        principal=principal, action="write", resource_type="self", owner_id=str(business.owner_user_id)
    )
    service = Service(
        business_id=business.id,
        name=body.name,
        description=body.description,
        base_price=body.base_price,
        currency=body.currency,
        origin_destination_id=body.origin_destination_id,
        destination_destination_id=body.destination_destination_id,
    )
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return DataResponse(data=_to_service_out(service))


@router.get("/{business_id}/services", response_model=ListResponse[ServiceOut])
async def list_services(
    business_id: uuid.UUID,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[ServiceOut]:
    result = await session.execute(
        select(Service).where(Service.business_id == business_id).order_by(Service.name).limit(pagination.limit)
    )
    return ListResponse(data=[_to_service_out(r) for r in result.scalars().all()])


@services_router.get("/search", response_model=ListResponse[TransportSearchResultOut])
async def search_transport(
    category: BusinessCategory,
    origin_destination_id: uuid.UUID | None = None,
    destination_destination_id: uuid.UUID | None = None,
    after: datetime | None = None,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[TransportSearchResultOut]:
    """Real flight/train/bus search — public, same as any other directory
    listing in this file. Registered before `/{service_id}/availability`
    only for readability; the two paths never collide (different segment
    shapes). Reuses `business.services`/`business.availability` exactly as
    seeded/created — never fabricates a departure that isn't a real row."""
    if category not in TRANSPORT_CATEGORIES:
        raise AppError(
            code="INVALID_CATEGORY",
            message="Transport search only supports AIRLINE, RAILWAY, or BUS_OPERATOR.",
            status_code=422,
        )

    origin = aliased(Destination)
    destination = aliased(Destination)
    query = (
        select(Service, Availability, Business, origin, destination)
        .join(Business, Service.business_id == Business.id)
        .join(Availability, Availability.service_id == Service.id)
        .outerjoin(origin, Service.origin_destination_id == origin.id)
        .outerjoin(destination, Service.destination_destination_id == destination.id)
        .where(Business.category == category, Availability.starts_at >= (after or datetime.now(UTC)))
        .order_by(Availability.starts_at)
        .limit(pagination.limit)
    )
    if origin_destination_id is not None:
        query = query.where(Service.origin_destination_id == origin_destination_id)
    if destination_destination_id is not None:
        query = query.where(Service.destination_destination_id == destination_destination_id)

    rows = (await session.execute(query)).all()
    return ListResponse(
        data=[
            TransportSearchResultOut(
                service_id=service.id,
                business_id=business.id,
                business_name=business.name,
                category=business.category,
                origin_destination_id=service.origin_destination_id,
                origin_name=origin_row.name if origin_row else None,
                destination_destination_id=service.destination_destination_id,
                destination_name=destination_row.name if destination_row else None,
                availability_id=slot.id,
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
                capacity=slot.capacity,
                booked_count=slot.booked_count,
                remaining=max(0, slot.capacity - slot.booked_count),
                base_price=service.base_price,
                currency=service.currency,
            )
            for service, slot, business, origin_row, destination_row in rows
        ]
    )


@services_router.post("/{service_id}/availability", response_model=DataResponse[AvailabilityOut], status_code=201)
async def create_availability(
    service_id: uuid.UUID,
    body: AvailabilityCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[AvailabilityOut]:
    _, owner_id = await _get_service_and_owner(session, service_id)
    await require_allowed(principal=principal, action="write", resource_type="self", owner_id=str(owner_id))
    slot = Availability(
        service_id=service_id, starts_at=body.starts_at, ends_at=body.ends_at, capacity=body.capacity
    )
    session.add(slot)
    await session.commit()
    await session.refresh(slot)
    return DataResponse(data=_to_availability_out(slot))


@services_router.get("/{service_id}/availability", response_model=ListResponse[AvailabilityOut])
async def list_availability(
    service_id: uuid.UUID,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[AvailabilityOut]:
    """Public — a tourist needs to see open slots before booking one
    (app/domains/booking/router.py's `create_booking`), same as any other
    directory-browsing endpoint in this file."""
    result = await session.execute(
        select(Availability)
        .where(Availability.service_id == service_id)
        .order_by(Availability.starts_at)
        .limit(pagination.limit)
    )
    return ListResponse(data=[_to_availability_out(r) for r in result.scalars().all()])


@guides_router.post("", response_model=DataResponse[GuideOut], status_code=201)
async def create_guide(
    body: GuideCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[GuideOut]:
    if principal.role != "guide":
        raise AppError(
            code="FORBIDDEN", message="Only a guide-role account may register a guide profile.", status_code=403
        )
    guide = Guide(
        user_id=uuid.UUID(principal.user_id),
        languages=body.languages,
        specialties=body.specialties,
        destination_id=body.destination_id,
        bio=body.bio,
    )
    session.add(guide)
    await session.commit()
    await session.refresh(guide)
    return DataResponse(data=_to_guide_out(guide))


@guides_router.get("", response_model=ListResponse[GuideOut])
async def list_guides(
    destination_id: uuid.UUID | None = None,
    verified_only: bool = False,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[GuideOut]:
    query = select(Guide).order_by(Guide.created_at.desc()).limit(pagination.limit)
    if destination_id is not None:
        query = query.where(Guide.destination_id == destination_id)
    if verified_only:
        query = query.where(Guide.is_verified.is_(True))
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_guide_out(r) for r in rows])


@guides_router.get("/mine", response_model=ListResponse[GuideOut])
async def list_my_guides(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[GuideOut]:
    """Same gap as `GET /businesses/mine` above, for a guide-role account."""
    query = (
        select(Guide)
        .where(Guide.user_id == uuid.UUID(principal.user_id))
        .order_by(Guide.created_at.desc())
    )
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_guide_out(r) for r in rows])


@guides_router.get("/{guide_id}", response_model=DataResponse[GuideOut])
async def get_guide(guide_id: uuid.UUID, session: AsyncSession = Depends(get_db_session)) -> DataResponse[GuideOut]:
    guide = await _get_guide_or_404(session, guide_id)
    return DataResponse(data=_to_guide_out(guide))


@guides_router.put("/{guide_id}", response_model=DataResponse[GuideOut])
async def update_guide(
    guide_id: uuid.UUID,
    body: GuideCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[GuideOut]:
    guide = await _get_guide_or_404(session, guide_id)
    await require_allowed(principal=principal, action="write", resource_type="self", owner_id=str(guide.user_id))
    guide.languages = body.languages
    guide.specialties = body.specialties
    guide.destination_id = body.destination_id
    guide.bio = body.bio
    await session.commit()
    await session.refresh(guide)
    return DataResponse(data=_to_guide_out(guide))
