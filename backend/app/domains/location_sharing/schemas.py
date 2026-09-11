import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator

from app.domains.tourism.schemas import GeoPoint

DurationChoice = Literal["15m", "1h", "4h", "until_trip_end", "custom", "until_stopped"]


class LocationShareCreateIn(BaseModel):
    recipient_type: Literal["TRUSTED_CONTACT", "GROUP"]
    trusted_contact_id: uuid.UUID | None = None
    trip_id: uuid.UUID | None = None
    purpose: str | None = None
    precision: Literal["PRECISE", "APPROXIMATE"] = "APPROXIMATE"
    duration_choice: DurationChoice = "1h"
    custom_minutes: int | None = None

    @model_validator(mode="after")
    def _require_matching_recipient(self) -> "LocationShareCreateIn":
        if self.recipient_type == "TRUSTED_CONTACT" and self.trusted_contact_id is None:
            raise ValueError("trusted_contact_id is required when recipient_type is TRUSTED_CONTACT")
        if self.recipient_type == "GROUP" and self.trip_id is None:
            raise ValueError("trip_id is required when recipient_type is GROUP")
        if self.duration_choice == "custom" and not self.custom_minutes:
            raise ValueError("custom_minutes is required when duration_choice is custom")
        return self


class LocationShareUpdateIn(BaseModel):
    precision: Literal["PRECISE", "APPROXIMATE"] | None = None
    duration_choice: DurationChoice | None = None
    custom_minutes: int | None = None


class LocationShareOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    recipient_type: str
    trusted_contact_id: uuid.UUID | None
    trip_id: uuid.UUID | None
    purpose: str | None
    precision: str
    status: str
    started_at: datetime
    expires_at: datetime
    last_location_at: datetime | None
    current_location: GeoPoint | None
    is_live: bool
    created_at: datetime
    updated_at: datetime
    # Populated ONLY in the create response — never re-fetchable, mirroring
    # emergency.schemas.TrustedContactTokenOut's "raw token once" rule.
    access_token: str | None = None


class LocationSharePingIn(BaseModel):
    lon: float
    lat: float
    accuracy: float | None = None


class LocationShareRecipientViewOut(BaseModel):
    """Deliberately minimal — no name/email/phone, no session id beyond
    what the recipient already has in their own link. `status`/`is_live`
    are computed live at read time, never trusted from a possibly-stale
    stored column, so a stale location is never presented as current."""

    recipient_type: str
    precision: str
    status: str
    current_location: GeoPoint | None
    last_location_at: datetime | None
    is_live: bool
    expires_at: datetime
    purpose: str | None
    reason: str | None = None
