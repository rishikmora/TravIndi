import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, model_validator


class SelfRegisterableAccountType(enum.StrEnum):
    """Only the base FR-01 account types can self-register. Authority
    accounts (and their sub-roles —
    docs/00-planning/08-role-permission-matrix.md) are provisioned
    out-of-band by a platform admin, never through this public endpoint."""

    TOURIST = "tourist"
    GUIDE = "guide"
    BUSINESS = "business"


class RegisterIn(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    password: str
    account_type: SelfRegisterableAccountType

    @model_validator(mode="after")
    def _require_identifier(self) -> "RegisterIn":
        if not self.email and not self.phone:
            raise ValueError("email or phone is required")
        return self


class LoginIn(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    password: str


class OtpVerifyIn(BaseModel):
    challenge_id: str
    code: str


class TokenRefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


class MeOut(BaseModel):
    id: uuid.UUID
    email: str | None
    phone: str | None
    account_type: str
    status: str
    preferred_language: str | None = None
    travel_preferences: dict = {}
    accessibility_preferences: dict = {}
    notification_preferences: dict = {}


class ConsentIn(BaseModel):
    purpose: str
    version: str


class ConsentOut(BaseModel):
    id: uuid.UUID
    purpose: str
    status: str
    version: str
    granted_at: datetime | None
    revoked_at: datetime | None


class TrustedContactIn(BaseModel):
    name: str
    relationship_label: str | None = None
    phone: str | None = None
    email: str | None = None

    @model_validator(mode="after")
    def _require_contact_method(self) -> "TrustedContactIn":
        if not self.phone and not self.email:
            raise ValueError("phone or email is required")
        return self


class TrustedContactOut(BaseModel):
    id: uuid.UUID
    name: str
    relationship_label: str | None
    phone: str | None
    email: str | None


class NotificationOut(BaseModel):
    id: uuid.UUID
    priority: str
    notification_type: str
    title: str
    body: str
    related_entity_type: str | None
    related_entity_id: uuid.UUID | None
    read_at: datetime | None
    created_at: datetime


class NotificationPreferencesIn(BaseModel):
    """Merged into the existing `user_profiles.notification_preferences`
    JSONB column (Phase 7) rather than a new table — that column already
    exists for exactly this and was unused until now."""

    preferences: dict[str, bool]


class AccessibilityPreferencesIn(BaseModel):
    """Written into the existing `user_profiles.accessibility_preferences`
    JSONB column (Phase 7) — already read by `/users/me` (`MeOut`) but had
    no write endpoint until FR-22's full accessibility pass. A small, fixed
    set of real fields (unlike notification preferences' open-ended
    channel/type dict) since the whole point is a known set of UI toggles:
    `web/src/app/accessibility/page.tsx` applies these as real CSS changes
    (larger base font size, higher-contrast palette, disabled animations),
    not just a stored-but-unused preference."""

    high_contrast: bool = False
    large_text: bool = False
    reduce_motion: bool = False
