"""Crowd domain models — `crowd` schema (FR-08 minimal P0 slice: enough live
crowd/risk data to feed safe-route scoring and the destination safety view;
forecasting/IoT are P1). IoT device/measurement tables are folded in here
rather than a separate schema (docs/00-planning/09-database-schema-plan.md §5).

H3 cell IDs are computed application-side (h3-py), stored as plain indexed
text columns — no h3-pg Postgres extension (infra/postgres/Dockerfile).
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class CrowdCell(UUIDPKMixin, Base):
    """Current aggregated state per H3 cell — the read path for route
    scoring and destination safety views."""

    __tablename__ = "crowd_cells"
    __table_args__ = (
        Index("ix_crowd_cells_h3_observed", "h3_cell", "observed_at"),
        {"schema": "crowd"},
    )

    h3_cell: Mapped[str] = mapped_column(String(16), nullable=False)
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    visitor_count: Mapped[int | None]
    density: Mapped[float | None] = mapped_column(Numeric(6, 4))
    velocity: Mapped[float | None] = mapped_column(Numeric(6, 4))
    risk_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    source: Mapped[str | None] = mapped_column(String(32))
    model_version: Mapped[str | None] = mapped_column(String(32))
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))


class CrowdObservation(UUIDPKMixin, Base):
    """Raw per-observation reads (vision counters, IoT sensors, app
    telemetry) that get aggregated into `CrowdCell` — short retention per
    NFR §8.1's "seconds to minutes" freshness band for crowd state."""

    __tablename__ = "observations"
    __table_args__ = (
        Index("ix_crowd_observations_h3_recorded", "h3_cell", "recorded_at"),
        {"schema": "crowd"},
    )

    h3_cell: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    retention_class: Mapped[str] = mapped_column(String(32), nullable=False, default="short")


class CrowdPrediction(UUIDPKMixin, Base):
    """Forecast output — distinct from `knowledge.ai_predictions`
    (docs/00-planning/09-database-schema-plan.md §2, resolving the ambiguous
    dual use of "predictions" in the source documents)."""

    __tablename__ = "crowd_predictions"
    __table_args__ = (Index("ix_crowd_predictions_h3_for", "h3_cell", "predicted_for"), {"schema": "crowd"})

    h3_cell: Mapped[str] = mapped_column(String(16), nullable=False)
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    predicted_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    density: Mapped[float | None] = mapped_column(Numeric(6, 4))
    risk_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CrowdEventType(enum.StrEnum):
    THRESHOLD_CROSSED = "THRESHOLD_CROSSED"
    ANOMALY_DETECTED = "ANOMALY_DETECTED"


class CrowdEvent(UUIDPKMixin, Base):
    """Domain events such as `crowd.threshold.crossed`
    (docs/00-planning/01-project-master-model.md §L)."""

    __tablename__ = "crowd_events"
    __table_args__ = {"schema": "crowd"}

    event_type: Mapped[CrowdEventType] = mapped_column(
        Enum(CrowdEventType, name="crowd_event_type", schema="crowd"), nullable=False
    )
    h3_cell: Mapped[str | None] = mapped_column(String(16))
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LocationEvent(UUIDPKMixin, Base):
    """Raw, short-retention GPS ingestion — consent-scoped, never a
    permanent analytics warehouse (docs/00-planning/01-project-master-model.md §P,
    NFR §8.1). Deliberately not a foreign key to a long-lived aggregate; this
    table is purged/anonymized per retention policy once frozen (Phase 20)."""

    __tablename__ = "location_events"
    __table_args__ = {"schema": "crowd"}

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    h3_cell: Mapped[str] = mapped_column(String(16), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    retention_class: Mapped[str] = mapped_column(String(32), nullable=False, default="short")
    consent_basis: Mapped[str | None] = mapped_column(String(64))


class IotDevice(UUIDPKMixin, TimestampMixin, Base):
    """Folded into `crowd` schema for MVP per confirmed decision
    (docs/00-planning/09-database-schema-plan.md §5) — split into a dedicated
    `iot` schema later if the domain grows."""

    __tablename__ = "iot_devices"
    __table_args__ = {"schema": "crowd"}

    device_type: Mapped[str] = mapped_column(String(64), nullable=False)
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    h3_cell: Mapped[str | None] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")


class IotMeasurement(UUIDPKMixin, Base):
    __tablename__ = "iot_measurements"
    __table_args__ = (Index("ix_iot_measurements_device_recorded", "device_id", "recorded_at"), {"schema": "crowd"})

    device_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crowd.iot_devices.id", ondelete="CASCADE"), nullable=False
    )
    measurement_type: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
