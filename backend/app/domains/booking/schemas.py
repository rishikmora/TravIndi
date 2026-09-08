import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.booking.models import BookingStatus, TicketStatus


class BookingCreateIn(BaseModel):
    service_id: uuid.UUID
    availability_id: uuid.UUID
    party_size: int = Field(default=1, ge=1)
    notes: str | None = Field(default=None, max_length=1000)


class TicketOut(BaseModel):
    id: uuid.UUID
    qr_token: str
    status: TicketStatus
    checked_in_at: datetime | None


class BookingOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    service_id: uuid.UUID
    service_name: str
    business_id: uuid.UUID
    business_name: str
    availability_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    party_size: int
    status: BookingStatus
    total_amount: float | None
    currency: str
    notes: str | None
    created_at: datetime
    ticket: TicketOut | None = None


class TicketVerifyIn(BaseModel):
    qr_token: str = Field(min_length=1)
