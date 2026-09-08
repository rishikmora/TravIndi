"""Business domain models — `business` schema (P1, confirmed table list per
docs/00-planning/09-database-schema-plan.md §1): businesses, business_profiles,
guides, services, offers, availability.

Self-owned directory data — no real third-party business/hotel/guide vendor
feed exists (same "no vendor picked, build the adapter boundary not the
vendor" posture as Assumption C6/C7), so this is real data users/authorities
create through this app's own endpoints, not synced from anywhere external.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class BusinessCategory(enum.StrEnum):
    HOTEL = "HOTEL"
    RESTAURANT = "RESTAURANT"
    TAXI = "TAXI"
    ARTISAN = "ARTISAN"
    TOUR_OPERATOR = "TOUR_OPERATOR"
    OTHER = "OTHER"


class Business(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "businesses"
    __table_args__ = {"schema": "business"}

    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[BusinessCategory] = mapped_column(
        Enum(BusinessCategory, name="business_category", schema="business"), nullable=False
    )
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    location: Mapped[str | None] = mapped_column(Geography(geometry_type="POINT", srid=4326))
    is_verified: Mapped[bool] = mapped_column(nullable=False, default=False)
    """Denormalized from `trust.credentials` for fast list-filtering (avoids
    a join on every destination/search listing query) — kept in sync by the
    verification-approval code path (app/domains/trust/router.py), the only
    place allowed to flip it true."""

    profile: Mapped["BusinessProfile | None"] = relationship(back_populates="business", uselist=False)
    services: Mapped[list["Service"]] = relationship(back_populates="business")


class BusinessProfile(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "business_profiles"
    __table_args__ = {"schema": "business"}

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business.businesses.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    description: Mapped[str | None]
    contact_info: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    accessibility_features: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    safety_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    women_friendly_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    family_friendly_score: Mapped[float | None] = mapped_column(Numeric(4, 3))

    business: Mapped["Business"] = relationship(back_populates="profile")


class Guide(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "guides"
    __table_args__ = {"schema": "business"}

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), unique=True, nullable=False)
    languages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    specialties: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    is_verified: Mapped[bool] = mapped_column(nullable=False, default=False)
    bio: Mapped[str | None]


class Service(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "services"
    __table_args__ = {"schema": "business"}

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business.businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None]
    base_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    business: Mapped["Business"] = relationship(back_populates="services")
    offers: Mapped[list["Offer"]] = relationship(back_populates="service")
    availability: Mapped[list["Availability"]] = relationship(back_populates="service")


class Offer(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "offers"
    __table_args__ = {"schema": "business"}

    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.services.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    discount_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    service: Mapped["Service"] = relationship(back_populates="offers")


class Availability(UUIDPKMixin, Base):
    __tablename__ = "availability"
    __table_args__ = {"schema": "business"}

    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.services.id", ondelete="CASCADE"), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(nullable=False, default=1)
    booked_count: Mapped[int] = mapped_column(nullable=False, default=0)

    service: Mapped["Service"] = relationship(back_populates="availability")
