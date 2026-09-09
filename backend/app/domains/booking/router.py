"""Booking + ticketing — Smart Ticketing / time-slot booking (P1). Books a
real `business.availability` slot (see app/domains/booking/models.py's
module docstring for why there's no separate `availability_slots` table),
decrementing/restoring its real `booked_count`, and issues a real
DB-verifiable QR-token ticket — no external ticketing/payment vendor, no
real payment (a booking is confirmed immediately, as if payment always
succeeds; `payment.*` stays unbuilt).

Deliberately out of scope for this pass, to avoid half-built infrastructure:
**virtual queue** (a live position-in-line concept, which needs real-time
state this prototype doesn't track) and **multi-attraction/tourist passes**
(a genuinely different multi-entity product surface). Both are real P1
Smart Ticketing sub-features per the feature catalog, but neither is built
here — a booking is a single time-slot reservation, nothing more.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_pagination, require_idempotency_key
from app.core.errors import AppError
from app.core.opa import require_allowed
from app.db.session import get_db_session
from app.domains.booking.models import Booking, BookingStatus, Ticket, TicketStatus
from app.domains.booking.schemas import BookingCreateIn, BookingOut, TicketOut, TicketVerifyIn
from app.domains.business.models import Availability, Business, Service
from app.domains.gamification.engine import (
    BOOKING_ECO_CERTIFIED_BONUS_POINTS,
    BOOKING_VERIFIED_BUSINESS_POINTS,
    advance_challenge_progress,
    award_points,
)
from app.domains.gamification.models import GamificationCategory
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/bookings", tags=["bookings"])
tickets_router = APIRouter(prefix="/tickets", tags=["bookings"])


def _build_booking_out(
    booking: Booking, service: Service, business: Business, availability: Availability, ticket: Ticket | None
) -> BookingOut:
    """Pure construction, no I/O — shared by the single-row and batch fetch
    paths below so the two can't drift out of sync."""
    return BookingOut(
        id=booking.id,
        user_id=booking.user_id,
        service_id=booking.service_id,
        service_name=service.name,
        business_id=business.id,
        business_name=business.name,
        availability_id=booking.availability_id,
        starts_at=availability.starts_at,
        ends_at=availability.ends_at,
        party_size=booking.party_size,
        status=booking.status,
        total_amount=booking.total_amount,
        currency=booking.currency,
        notes=booking.notes,
        created_at=booking.created_at,
        ticket=(
            TicketOut(id=ticket.id, qr_token=ticket.qr_token, status=ticket.status, checked_in_at=ticket.checked_in_at)
            if ticket
            else None
        ),
    )


async def _to_booking_out(session: AsyncSession, booking: Booking, ticket: Ticket | None = None) -> BookingOut:
    """Denormalizes service/business name and the slot's real start/end time
    for display — same reasoning as `_to_itinerary_out`'s `attraction_name`
    batch lookup in app/domains/travel/router.py: an id alone isn't
    human-readable without a second round trip. Trusts referential
    integrity (service/business/availability rows are never hard-deleted in
    this app) rather than defensively coding around an impossible null.

    Single-row only — for a list of bookings, use `_to_booking_outs_batch`
    instead, which fetches all of these in a fixed number of queries rather
    than up to 4 round trips per row."""
    service = await session.get(Service, booking.service_id)
    assert service is not None, "booking.service_id is a NOT NULL FK — the referenced row always exists"
    business = await session.get(Business, service.business_id)
    assert business is not None, "service.business_id is a NOT NULL FK — the referenced row always exists"
    availability = await session.get(Availability, booking.availability_id)
    assert availability is not None, "booking.availability_id is a NOT NULL FK — the referenced row always exists"
    if ticket is None:
        ticket = (
            await session.execute(select(Ticket).where(Ticket.booking_id == booking.id))
        ).scalar_one_or_none()
    return _build_booking_out(booking, service, business, availability, ticket)


async def _to_booking_outs_batch(session: AsyncSession, bookings: list[Booking]) -> list[BookingOut]:
    """Batch version of `_to_booking_out` for list endpoints — a fixed 4
    queries total (services, businesses, availabilities, tickets) instead of
    up to 4 queries *per booking*. `list_bookings`/`list_business_bookings`
    used to call `_to_booking_out` in a loop, which was a real N+1: a
    20-item page could issue up to 80 sequential round trips."""
    if not bookings:
        return []

    service_ids = {b.service_id for b in bookings}
    availability_ids = {b.availability_id for b in bookings}
    booking_ids = [b.id for b in bookings]

    services = {
        s.id: s for s in (await session.execute(select(Service).where(Service.id.in_(service_ids)))).scalars()
    }
    business_ids = {s.business_id for s in services.values()}
    businesses = {
        biz.id: biz for biz in (await session.execute(select(Business).where(Business.id.in_(business_ids)))).scalars()
    }
    availabilities = {
        a.id: a
        for a in (await session.execute(select(Availability).where(Availability.id.in_(availability_ids)))).scalars()
    }
    tickets = {
        t.booking_id: t
        for t in (await session.execute(select(Ticket).where(Ticket.booking_id.in_(booking_ids)))).scalars()
    }

    out = []
    for b in bookings:
        service = services[b.service_id]
        business = businesses[service.business_id]
        availability = availabilities[b.availability_id]
        out.append(_build_booking_out(b, service, business, availability, tickets.get(b.id)))
    return out


async def _get_booking_or_404(session: AsyncSession, booking_id: uuid.UUID) -> Booking:
    booking = await session.get(Booking, booking_id)
    if booking is None:
        raise AppError(code="BOOKING_NOT_FOUND", message="No such booking.", status_code=404)
    return booking


@router.post("", response_model=DataResponse[BookingOut], status_code=201)
async def create_booking(
    body: BookingCreateIn,
    principal: Principal = Depends(get_current_principal),
    idempotency_key: str = Depends(require_idempotency_key),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BookingOut]:
    service = await session.get(Service, body.service_id)
    if service is None:
        raise AppError(code="SERVICE_NOT_FOUND", message="No such service.", status_code=404)
    availability = await session.get(Availability, body.availability_id)
    if availability is None or availability.service_id != service.id:
        raise AppError(
            code="AVAILABILITY_NOT_FOUND", message="No such availability slot for this service.", status_code=404
        )
    remaining = availability.capacity - availability.booked_count
    if body.party_size > remaining:
        raise AppError(
            code="SLOT_FULL",
            message="Not enough capacity left in this slot.",
            status_code=409,
            details={"remaining": remaining},
        )

    total_amount = float(service.base_price) * body.party_size if service.base_price is not None else None

    booking = Booking(
        user_id=uuid.UUID(principal.user_id),
        service_id=service.id,
        availability_id=availability.id,
        party_size=body.party_size,
        total_amount=total_amount,
        currency=service.currency,
        notes=body.notes,
    )
    session.add(booking)
    availability.booked_count += body.party_size
    await session.flush()

    ticket = Ticket(booking_id=booking.id)
    session.add(ticket)
    await session.flush()

    business = await session.get(Business, service.business_id)
    if business is not None and business.is_verified:
        # Real gamification hook (Feature Blueprint P2 #9 Local Economy) —
        # only fires for an already-verified business, so it's a genuine
        # reward for supporting real KYC-checked local commerce, not a
        # blanket "every booking earns points" freebie.
        await award_points(
            session,
            user_id=booking.user_id,
            points=BOOKING_VERIFIED_BUSINESS_POINTS,
            category=GamificationCategory.LOCAL_ECONOMY,
            reason=f"Booked a verified local business: {business.name}",
            related_entity_type="booking",
            related_entity_id=booking.id,
        )
        verified_booking_count = (
            await session.execute(
                select(func.count(Booking.id.distinct()))
                .join(Service, Service.id == Booking.service_id)
                .join(Business, Business.id == Service.business_id)
                .where(Booking.user_id == booking.user_id, Business.is_verified.is_(True))
            )
        ).scalar_one()  # includes this booking — it was already flushed above
        await advance_challenge_progress(
            session, user_id=booking.user_id, category=GamificationCategory.LOCAL_ECONOMY, distinct_count=verified_booking_count
        )

        if business.is_eco_certified:
            # Real gamification hook (Feature Blueprint P2 Sustainability
            # "Eco rewards") — bonus points on top of the local-economy
            # ones, only for a business an authority has actually
            # certified eco-friendly (app/domains/business/router.py's
            # certify_business_eco_friendly), never self-declared.
            await award_points(
                session,
                user_id=booking.user_id,
                points=BOOKING_ECO_CERTIFIED_BONUS_POINTS,
                category=GamificationCategory.RESPONSIBLE_TOURISM,
                reason=f"Booked an eco-certified business: {business.name}",
                related_entity_type="booking",
                related_entity_id=booking.id,
            )
            eco_booking_count = (
                await session.execute(
                    select(func.count(Booking.id.distinct()))
                    .join(Service, Service.id == Booking.service_id)
                    .join(Business, Business.id == Service.business_id)
                    .where(Booking.user_id == booking.user_id, Business.is_eco_certified.is_(True))
                )
            ).scalar_one()
            await advance_challenge_progress(
                session, user_id=booking.user_id, category=GamificationCategory.RESPONSIBLE_TOURISM,
                distinct_count=eco_booking_count,
            )

    await session.commit()
    await session.refresh(booking)
    await session.refresh(ticket)
    return DataResponse(data=await _to_booking_out(session, booking, ticket=ticket))


@router.get("", response_model=ListResponse[BookingOut])
async def list_bookings(
    principal: Principal = Depends(get_current_principal),
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[BookingOut]:
    result = await session.execute(
        select(Booking)
        .where(Booking.user_id == uuid.UUID(principal.user_id))
        .order_by(Booking.created_at.desc())
        .limit(pagination.limit)
    )
    rows = result.scalars().all()
    return ListResponse(data=await _to_booking_outs_batch(session, list(rows)))


@router.get("/business/{business_id}", response_model=ListResponse[BookingOut])
async def list_business_bookings(
    business_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[BookingOut]:
    """For the business owner's own check-in/management view — every
    booking made against any of their services, across the whole business,
    newest first."""
    business = await session.get(Business, business_id)
    if business is None:
        raise AppError(code="BUSINESS_NOT_FOUND", message="No such business.", status_code=404)
    await require_allowed(principal=principal, action="read", resource_type="self", owner_id=str(business.owner_user_id))
    query = (
        select(Booking)
        .join(Service, Booking.service_id == Service.id)
        .where(Service.business_id == business_id)
        .order_by(Booking.created_at.desc())
        .limit(pagination.limit)
    )
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=await _to_booking_outs_batch(session, list(rows)))


@router.get("/{booking_id}", response_model=DataResponse[BookingOut])
async def get_booking(
    booking_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BookingOut]:
    booking = await _get_booking_or_404(session, booking_id)
    await require_allowed(principal=principal, action="read", resource_type="self", owner_id=str(booking.user_id))
    return DataResponse(data=await _to_booking_out(session, booking))


@router.post("/{booking_id}/cancel", response_model=DataResponse[BookingOut])
async def cancel_booking(
    booking_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BookingOut]:
    booking = await _get_booking_or_404(session, booking_id)
    await require_allowed(principal=principal, action="write", resource_type="self", owner_id=str(booking.user_id))
    if booking.status != BookingStatus.CONFIRMED:
        raise AppError(
            code="BOOKING_NOT_CANCELLABLE", message="Only a confirmed booking can be cancelled.", status_code=409
        )
    availability = await session.get(Availability, booking.availability_id)
    assert availability is not None, "booking.availability_id is a NOT NULL FK — the referenced row always exists"
    availability.booked_count = max(0, availability.booked_count - booking.party_size)
    booking.status = BookingStatus.CANCELLED
    ticket = (await session.execute(select(Ticket).where(Ticket.booking_id == booking.id))).scalar_one_or_none()
    if ticket is not None and ticket.status == TicketStatus.ISSUED:
        ticket.status = TicketStatus.VOID
    await session.commit()
    await session.refresh(booking)
    return DataResponse(data=await _to_booking_out(session, booking))


@tickets_router.post("/verify", response_model=DataResponse[BookingOut])
async def verify_ticket(
    body: TicketVerifyIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[BookingOut]:
    """Real offline-verifiable check-in: a plain DB lookup by the token
    encoded in the ticket's QR code, no live payment/vendor API call
    needed. Restricted to the owner of the business the underlying service
    belongs to — the same `self` ownership check used everywhere else in
    this domain."""
    ticket = (await session.execute(select(Ticket).where(Ticket.qr_token == body.qr_token))).scalar_one_or_none()
    if ticket is None:
        raise AppError(code="TICKET_NOT_FOUND", message="No ticket with that code.", status_code=404)
    booking = await session.get(Booking, ticket.booking_id)
    assert booking is not None, "ticket.booking_id is a NOT NULL FK — the referenced row always exists"
    service = await session.get(Service, booking.service_id)
    assert service is not None, "booking.service_id is a NOT NULL FK — the referenced row always exists"
    business = await session.get(Business, service.business_id)
    assert business is not None, "service.business_id is a NOT NULL FK — the referenced row always exists"
    await require_allowed(principal=principal, action="write", resource_type="self", owner_id=str(business.owner_user_id))
    if ticket.status != TicketStatus.ISSUED:
        raise AppError(
            code="TICKET_NOT_VALID",
            message=f"This ticket is {ticket.status.value.lower()}, not valid for check-in.",
            status_code=409,
        )
    ticket.status = TicketStatus.CHECKED_IN
    ticket.checked_in_at = datetime.now(UTC)
    ticket.checked_in_by_user_id = uuid.UUID(principal.user_id)
    booking.status = BookingStatus.COMPLETED
    await session.commit()
    await session.refresh(booking)
    return DataResponse(data=await _to_booking_out(session, booking))
