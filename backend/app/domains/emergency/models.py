"""Emergency domain models — `emergency` schema (FR-06, the platform's highest-
criticality path). Row-Level Security is enabled on `sos_requests`
(docs/00-planning/09-database-schema-plan.md §5) — added as raw SQL in the
Alembic migration.

State machine (docs/00-planning/01-project-master-model.md §L, extended per
docs/00-planning/09-database-schema-plan.md §3):
CREATED -> ACKNOWLEDGED -> AUTHORITY_NOTIFIED -> RESOURCE_ASSIGNED ->
RESPONDER_ARRIVED -> RESOLVED, plus CANCELLED (from any non-terminal state) and
FALSE_ALARM (terminal, set after authority review). Valid transitions are
enforced in the service layer (Phase 14), not by a DB constraint, since the
allowed-predecessor set differs per target state.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class SosStatus(enum.StrEnum):
    CREATED = "CREATED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    AUTHORITY_NOTIFIED = "AUTHORITY_NOTIFIED"
    RESOURCE_ASSIGNED = "RESOURCE_ASSIGNED"
    RESPONDER_ARRIVED = "RESPONDER_ARRIVED"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"
    FALSE_ALARM = "FALSE_ALARM"


class ResourceType(enum.StrEnum):
    POLICE = "POLICE"
    AMBULANCE = "AMBULANCE"
    HOSPITAL = "HOSPITAL"
    FIRE = "FIRE"


class SosRequest(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "sos_requests"
    __table_args__ = (
        Index("ix_sos_requests_status_created", "status", "created_at"),
        {"schema": "emergency"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    status: Mapped[SosStatus] = mapped_column(
        Enum(SosStatus, name="sos_status", schema="emergency"), nullable=False, default=SosStatus.CREATED
    )
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    emergency_type: Mapped[str | None] = mapped_column(String(64))
    severity: Mapped[str | None] = mapped_column(String(16))
    # Local acknowledgement must precede/accompany cloud delivery per the
    # governing offline rule — recorded even if this row is created via a
    # delayed sync from an offline device.
    local_ack_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    events: Mapped[list["SosEvent"]] = relationship(back_populates="sos_request")
    assignments: Mapped[list["ResourceAssignment"]] = relationship(back_populates="sos_request")


class SosEvent(UUIDPKMixin, Base):
    """Append-only history — pairs with `SosRequest`."""

    __tablename__ = "sos_events"
    __table_args__ = {"schema": "emergency"}

    sos_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("emergency.sos_requests.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    sos_request: Mapped["SosRequest"] = relationship(back_populates="events")


class EmergencyResource(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "emergency_resources"
    __table_args__ = {"schema": "emergency"}

    resource_type: Mapped[ResourceType] = mapped_column(
        Enum(ResourceType, name="emergency_resource_type", schema="emergency"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="AVAILABLE")
    contact_info: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class ResourceAssignment(UUIDPKMixin, Base):
    """Dispatch lifecycle — links an `EmergencyResource` to an SOS and/or a
    Safety incident. At least one of `sos_id` / `incident_id` must be set;
    enforced in the service layer, not a DB CHECK, since cross-schema CHECK
    constraints referencing another table aren't expressible in Postgres."""

    __tablename__ = "resource_assignments"
    __table_args__ = {"schema": "emergency"}

    sos_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("emergency.sos_requests.id"))
    incident_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("safety.incidents.id"))
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("emergency.emergency_resources.id"), nullable=False
    )
    assigned_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ASSIGNED")
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sos_request: Mapped["SosRequest | None"] = relationship(back_populates="assignments")
