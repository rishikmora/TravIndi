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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_pagination, require_idempotency_key
from app.core.errors import AppError
from app.core.opa import require_allowed
from app.db.session import get_db_session
from app.domains.booking.models import Booking, BookingStatus, Ticket, TicketStatus
from app.domains.booking.schemas import BookingCreateIn, BookingOut, TicketOut, TicketVerifyIn
from app.domains.business.models import Availability, Business, Service
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/bookings", tags=["bookings"])
tickets_router = APIRouter(prefix="/tickets", tags=["bookings"])


async def _to_booking_out(session: AsyncSession, booking: Booking, ticket: Ticket | None = None) -> BookingOut:
    """Denormalizes service/business name and the slot's real start/end time
    for display — same reasoning as `_to_itinerary_out`'s `attraction_name`
    batch lookup in app/domains/travel/router.py: an id alone isn't
    human-readable without a second round trip. Trusts referential
    integrity (service/business/availability rows are never hard-deleted in
    this app) rather than defensively coding around an impossible null."""
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
    return ListResponse(data=[await _to_booking_out(session, b) for b in rows])


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
    return ListResponse(data=[await _to_booking_out(session, b) for b in rows])


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
