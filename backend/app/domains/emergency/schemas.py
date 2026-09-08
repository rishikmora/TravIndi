import uuid
from datetime import datetime

from pydantic import BaseModel

from app.domains.tourism.schemas import GeoPoint


class SosCreateIn(BaseModel):
    lon: float
    lat: float
    emergency_type: str | None = None
    severity: str | None = None


class TrustedContactTokenOut(BaseModel):
    """Real one-time SOS-scoped tokens are issued, but there is no real SMS
    delivery channel (Assumption C6 defers the vendor) — the raw token is
    returned here so a prototype demo can hand it to the "trusted contact"
    out of band instead of pretending an SMS was sent."""

    trusted_contact_id: uuid.UUID
    trusted_contact_name: str
    token: str
    expires_at: datetime


class SosOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    emergency_type: str | None
    severity: str | None
    location: GeoPoint
    local_ack_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    trusted_contact_tokens: list[TrustedContactTokenOut] = []


class SosActionIn(BaseModel):
    """Body for /acknowledge, /resolve, /cancel — a free-text note is
    optional context appended to the SosEvent audit trail, never required."""

    note: str | None = None
    outcome: str | None = None  # resolve only: "RESOLVED" (default) or "FALSE_ALARM"


class TrustedContactVerifyIn(BaseModel):
    token: str
    otp_code: str | None = None
    """No real OTP channel exists (same Assumption C6 gap) — any non-empty
    code is accepted as the step-up verification for precise location, a
    documented prototype simplification, never silently pretended to be a
    real OTP check."""


class TrustedContactSosViewOut(BaseModel):
    """Deliberately minimal-necessary-info by default
    (docs/00-planning/08-role-permission-matrix.md §1) — `precise_location`
    is only populated once `otp_code` step-up has been provided."""

    sos_id: uuid.UUID
    status: str
    emergency_type: str | None
    created_at: datetime
    precise_location: GeoPoint | None
