"""Tourism domain models — `tourism` schema (destination discovery, FR-03)."""

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin

# Note: GeoAlchemy2's Geography type auto-creates a GIST spatial index
# (`idx_<table>_<column>`) on every geography column by default — no manual
# Index() needed here, unlike the non-spatial indexes declared below.


class Destination(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "destinations"
    __table_args__ = {"schema": "tourism"}

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Kolkata")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    image_url: Mapped[str | None] = mapped_column(String(500))

    attractions: Mapped[list["Attraction"]] = relationship(back_populates="destination")


class Attraction(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "attractions"
    __table_args__ = {"schema": "tourism"}

    destination_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tourism.destinations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64))
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    capacity: Mapped[int | None]
    opening_hours: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    destination: Mapped["Destination"] = relationship(back_populates="attractions")


class TourismEvent(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tourism_events"
    __table_args__ = {"schema": "tourism"}

    destination_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tourism.destinations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expected_attendance: Mapped[int | None]


class Facility(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "facilities"
    __table_args__ = {"schema": "tourism"}

    destination_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tourism.destinations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    facility_type: Mapped[str] = mapped_column(String(64), nullable=False)
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
