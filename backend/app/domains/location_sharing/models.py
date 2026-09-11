"""Live Location Sharing domain models — `location_sharing` schema.

"Your location. Your choice. Your control." A tourist explicitly starts a
time-bounded, precision-scoped share with exactly ONE chosen recipient — a
`TrustedContact` (never a platform account, see identity/models.py) or their
travel group (`group_travel.TripMember`, already real accounts). This is
deliberately NOT a broadcast like SOS's trusted-contact flow (every contact
gets a token there) — one recipient, one token, one row.

`LocationShare.current_location`/`last_location_at` are a single upserted
"current state" pair, never a history log — same posture as
`group_travel.TripMemberLocation` and `crowd.location_events`' short-
retention rule. `LocationShareEvent` is written ONLY on real lifecycle
transitions (CREATED/REVOKED/EXPIRED/ACCESS_GRANTED/ACCESS_DENIED), never on
a location ping — that is what keeps this feature from silently becoming an
unbounded GPS-history table under a different name.

Authority access to a tourist's location stays entirely on the existing,
unmodified SOS path (`emergency.sos_requests`) — this domain has no
authority-role branch anywhere, by design.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class RecipientType(enum.StrEnum):
    TRUSTED_CONTACT = "TRUSTED_CONTACT"
    GROUP = "GROUP"


class SharePrecision(enum.StrEnum):
    PRECISE = "PRECISE"
    APPROXIMATE = "APPROXIMATE"


class ShareStatus(enum.StrEnum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class LocationShare(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "location_shares"
    __table_args__ = {"schema": "location_sharing"}

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    recipient_type: Mapped[RecipientType] = mapped_column(
        Enum(RecipientType, name="recipient_type", schema="location_sharing"), nullable=False
    )
    # Separate typed FKs, not a generic recipient_id — a real cross-schema
    # polymorphic FK isn't expressible in Postgres (same reasoning as
    # emergency.ResourceAssignment.sos_id/incident_id). Exactly one is set,
    # matching recipient_type; enforced in the service layer, not a DB CHECK.
    trusted_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("identity.trusted_contacts.id", ondelete="CASCADE")
    )
    trip_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("travel.trips.id", ondelete="CASCADE"))
    purpose: Mapped[str | None] = mapped_column(String(120))
    precision: Mapped[SharePrecision] = mapped_column(
        Enum(SharePrecision, name="share_precision", schema="location_sharing"), nullable=False
    )
    status: Mapped[ShareStatus] = mapped_column(
        Enum(ShareStatus, name="share_status", schema="location_sharing"), nullable=False, default=ShareStatus.ACTIVE
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_location_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_location: Mapped[str | None] = mapped_column(Geography(geometry_type="POINT", srid=4326))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LocationShareEvent(UUIDPKMixin, Base):
    """Append-only lifecycle log — mirrors emergency.SosEvent exactly.
    Never written on a ping (see module docstring)."""

    __tablename__ = "location_share_events"
    __table_args__ = {"schema": "location_sharing"}

    location_share_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("location_sharing.location_shares.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LocationShareAccessToken(UUIDPKMixin, Base):
    """Mirrors identity.TrustedContactAccessToken exactly (sha256 hash,
    revocable, service-role-only RLS) but scoped 1:1 to a LocationShare
    with a variable expiry (matching the share's own), not SOS's fixed 6h —
    and issued exactly once per share, never one-per-contact."""

    __tablename__ = "location_share_access_tokens"
    __table_args__ = {"schema": "location_sharing"}

    location_share_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("location_sharing.location_shares.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
