"""Booking/ticketing domain models — `booking` schema (P1, confirmed table
list per docs/00-planning/09-database-schema-plan.md §1: bookings, tickets,
availability_slots).

**`availability_slots` is deliberately not a separate table.** `business.
availability` (built in the earlier P1 trust/business round —
app/domains/business/models.py) already models exactly this concept: a
service's bookable capacity window (`starts_at`/`ends_at`/`capacity`/
`booked_count`). The source PDFs list "availability" under both the
business and booking domain boxes without ever resolving that as a
duplicate — same category of self-contradiction this project's own
reconciliation docs call out elsewhere (docs/00-planning/09-database-schema
-plan.md §2's table-name reconciliations). Building a second, functionally
identical table here would just split the one real piece of mutable state
(remaining capacity) across two rows that could drift out of sync. `Booking.
availability_id` references `business.availability.id` directly instead.

**No real payment gateway** (Assumption-equivalent — no vendor was picked,
and executing a real financial transaction is outside this assistant's
operating constraints regardless). `Booking.total_amount` is display-only
internal bookkeeping (service price × party size, when the service has a
price) — a booking is confirmed immediately on creation, as if payment
always succeeds. `payment.*` (payments/refunds/payment_events/webhooks)
stays schema-only, unbuilt, exactly like the rest of the P1 schema-only set.
"""

import enum
import secrets
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


def _generate_qr_token() -> str:
    """URL-safe random token, long enough to be unguessable — this IS the
    string a QR code encodes (no separate QR-image generation on the
    backend; the web client renders the actual QR graphic from this
    string). Verification is a plain DB lookup, i.e. genuinely real
    "offline-verifiable" ticketing in the sense that no live payment/vendor
    API call is ever needed to check a ticket — just this database."""
    return secrets.token_urlsafe(24)


class BookingStatus(enum.StrEnum):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class Booking(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = {"schema": "booking"}

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.services.id"), nullable=False)
    availability_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.availability.id"), nullable=False)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status", schema="booking"), nullable=False, default=BookingStatus.CONFIRMED
    )
    total_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    notes: Mapped[str | None]

    ticket: Mapped["Ticket | None"] = relationship(back_populates="booking", uselist=False)


class TicketStatus(enum.StrEnum):
    ISSUED = "ISSUED"
    CHECKED_IN = "CHECKED_IN"
    VOID = "VOID"


class Ticket(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tickets"
    __table_args__ = {"schema": "booking"}

    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("booking.bookings.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    qr_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default=_generate_qr_token)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticket_status", schema="booking"), nullable=False, default=TicketStatus.ISSUED
    )
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_in_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))

    booking: Mapped["Booking"] = relationship(back_populates="ticket")
