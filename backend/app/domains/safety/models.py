"""Safety domain models — `safety` schema (FR-05 core, FR-20). Row-Level
Security is enabled on `incidents` (docs/00-planning/09-database-schema-plan.md §5)
— the RLS policy itself is added as raw SQL in the Alembic migration, not here.

Incident state machine adds CANCELLED / FALSE_ALARM per
docs/00-planning/09-database-schema-plan.md §3, applied consistently with the
SOS state machine in `emergency.models`.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin

# Note: GeoAlchemy2 auto-creates a GIST spatial index on every geography
# column — no manual Index() needed for those (see app/domains/tourism/models.py).


class IncidentStatus(enum.StrEnum):
    REPORTED = "REPORTED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"
    FALSE_ALARM = "FALSE_ALARM"


class RiskZone(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "risk_zones"
    __table_args__ = {"schema": "safety"}

    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    geom: Mapped[str] = mapped_column(Geography(geometry_type="POLYGON", srid=4326), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
class SafeZone(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "safe_zones"
    __table_args__ = {"schema": "safety"}

    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    geom: Mapped[str] = mapped_column(Geography(geometry_type="POLYGON", srid=4326), nullable=False)


class SafetyScore(UUIDPKMixin, Base):
    __tablename__ = "safety_scores"
    __table_args__ = {"schema": "safety"}

    destination_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tourism.destinations.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(32))


class Incident(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (
        Index("ix_incidents_status_created", "status", "created_at"),
        {"schema": "safety"},
    )

    reporter_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id"), nullable=False
    )
    incident_type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status", schema="safety"),
        nullable=False,
        default=IncidentStatus.REPORTED,
    )
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    description: Mapped[str | None]
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    events: Mapped[list["IncidentEvent"]] = relationship(back_populates="incident")
    evidence: Mapped[list["IncidentEvidence"]] = relationship(back_populates="incident")


class IncidentEvent(UUIDPKMixin, Base):
    """Append-only history — pairs with `Incident` per the current-state +
    event-history pattern (docs/00-planning/01-project-master-model.md §K)."""

    __tablename__ = "incident_events"
    __table_args__ = {"schema": "safety"}

    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("safety.incidents.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    incident: Mapped["Incident"] = relationship(back_populates="events")


class IncidentEvidence(UUIDPKMixin, Base):
    """Metadata only — the media itself lives in S3/MinIO, never in a
    transactional row (docs/00-planning/01-project-master-model.md §K)."""

    __tablename__ = "incident_evidence"
    __table_args__ = {"schema": "safety"}

    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("safety.incidents.id", ondelete="CASCADE"), nullable=False
    )
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    incident: Mapped["Incident"] = relationship(back_populates="evidence")
