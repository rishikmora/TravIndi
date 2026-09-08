"""Identity domain models — `identity` schema.

Keycloak is the identity provider (docs/00-planning/01-project-master-model.md §M);
`User.id` mirrors the Keycloak subject (`sub`) claim rather than storing credentials
locally. `UserRole` holds only the ABAC-relevant metadata (e.g. an authority
operator's assigned geography) that Keycloak's realm roles don't carry —
Keycloak remains the source of truth for the roles themselves
(docs/00-planning/08-role-permission-matrix.md).
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class UserStatus(enum.StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DELETED = "DELETED"


class AuthorityRole(enum.StrEnum):
    """Roles under the single `authority` account type — confirmed in
    docs/00-planning/08-role-permission-matrix.md. Not used for the base
    tourist/guide/business account types, which need no sub-role."""

    POLICE = "authority_police"
    EMERGENCY_RESPONDER = "authority_emergency_responder"
    TOURISM_DEPT = "authority_tourism_dept"
    MUNICIPALITY = "authority_municipality"
    VERIFIER = "authority_verifier"
    PLATFORM_ADMIN = "authority_platform_admin"


class User(UUIDPKMixin, TimestampMixin, Base):
    """Mirrors the Keycloak subject; `id` == Keycloak `sub`, not app-generated."""

    __tablename__ = "users"
    __table_args__ = {"schema": "identity"}

    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True)
    account_type: Mapped[str] = mapped_column(String(16), nullable=False)  # tourist|guide|business|authority
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", schema="identity"),
        nullable=False,
        default=UserStatus.ACTIVE,
    )

    profile: Mapped["UserProfile"] = relationship(back_populates="user", uselist=False)
    roles: Mapped[list["UserRole"]] = relationship(back_populates="user")
    consents: Mapped[list["UserConsent"]] = relationship(back_populates="user")
    devices: Mapped[list["UserDevice"]] = relationship(back_populates="user")
    trusted_contacts: Mapped[list["TrustedContact"]] = relationship(back_populates="user")


class UserProfile(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user_profiles"
    __table_args__ = {"schema": "identity"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    preferred_language: Mapped[str | None] = mapped_column(String(8))
    travel_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    accessibility_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notification_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    user: Mapped["User"] = relationship(back_populates="profile")


class UserRole(UUIDPKMixin, TimestampMixin, Base):
    """ABAC metadata for authority sub-roles — e.g. assigned_geography for a
    police/tourism-dept operator (docs/00-planning/08-role-permission-matrix.md §2)."""

    __tablename__ = "user_roles"
    __table_args__ = {"schema": "identity"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    role_code: Mapped[AuthorityRole] = mapped_column(
        Enum(AuthorityRole, name="authority_role", schema="identity"), nullable=False
    )
    assigned_geography: Mapped[dict | None] = mapped_column(JSONB)  # e.g. H3 cell set / zone ids

    user: Mapped["User"] = relationship(back_populates="roles")


class UserConsent(UUIDPKMixin, Base):
    __tablename__ = "user_consents"
    __table_args__ = {"schema": "identity"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # GRANTED|REVOKED
    version: Mapped[str] = mapped_column(String(16), nullable=False)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user: Mapped["User"] = relationship(back_populates="consents")


class UserDevice(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user_devices"
    __table_args__ = {"schema": "identity"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    device_type: Mapped[str] = mapped_column(String(32), nullable=False)
    push_token: Mapped[str | None] = mapped_column(String(512))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user: Mapped["User"] = relationship(back_populates="devices")


class TrustedContact(UUIDPKMixin, TimestampMixin, Base):
    """A tourist's registered emergency contact. Never a platform account —
    access is granted only via TrustedContactAccessToken
    (docs/00-planning/08-role-permission-matrix.md §1)."""

    __tablename__ = "trusted_contacts"
    __table_args__ = {"schema": "identity"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    relationship_label: Mapped[str | None] = mapped_column(String(64))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(320))

    user: Mapped["User"] = relationship(back_populates="trusted_contacts")


class Notification(UUIDPKMixin, Base):
    """Phase 14/16 gap-fill: no source document ever resolves a
    notification schema (docs/00-planning/07-implementation-roadmap.md
    Phase 8 note), and none of the 14 confirmed schemas has a home for it.
    Added here — user-scoped, same package as `UserDevice` — rather than a
    new top-level schema, since the actual need is "one row per
    notification a user has received," not a queueing/delivery subsystem.
    Real delivery (FCM/APNs/SMS, Assumption C6) is not built; this is the
    in-app notification list only."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        {"schema": "identity"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    notification_type: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(nullable=False)
    related_entity_type: Mapped[str | None] = mapped_column(String(32))
    related_entity_id: Mapped[uuid.UUID | None]
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TrustedContactAccessToken(UUIDPKMixin, Base):
    """One-time, SOS-scoped, OTP-gated access token — confirmed design in
    docs/00-planning/08-role-permission-matrix.md §1. `sos_id` is a genuine
    cross-schema FK to `emergency.sos_requests`; SQLAlchemy resolves the
    string reference against the shared MetaData once all domain models are
    imported (see alembic/env.py), regardless of module import order."""

    __tablename__ = "trusted_contact_access_tokens"
    __table_args__ = (
        Index("ix_trusted_contact_tokens_sos_id", "sos_id"),
        {"schema": "identity"},
    )

    trusted_contact_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.trusted_contacts.id", ondelete="CASCADE"), nullable=False
    )
    sos_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("emergency.sos_requests.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    otp_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))