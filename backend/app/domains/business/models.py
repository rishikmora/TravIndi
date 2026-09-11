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
    AIRLINE = "AIRLINE"
    RAILWAY = "RAILWAY"
    BUS_OPERATOR = "BUS_OPERATOR"
    OTHER = "OTHER"


TRANSPORT_CATEGORIES = frozenset({BusinessCategory.AIRLINE, BusinessCategory.RAILWAY, BusinessCategory.BUS_OPERATOR})
"""A `Service` under one of these categories is a real bookable route
(flight/train/bus), not a hotel room or restaurant table — the only real
difference is that its `origin_destination_id`/`destination_destination_id`
are meaningful. Reuses the exact same `Service`+`Availability`+`Booking`+
`Ticket` machinery every other business category already has (a scheduled
departure IS a time-boxed, capacity-limited slot, the same shape as a
restaurant table booking) — no new schema, no duplicated booking logic."""


class DietaryOption(enum.StrEnum):
    """Feature Blueprint P2 Food Intelligence — self-declared by the
    business (same posture as everything else in this domain: no vendor
    feed, no inspection/hygiene data source exists, so only what the
    business itself states is ever recorded). A closed set so `dietary_option`
    search filtering on `GET /businesses` stays exact-match rather than
    fuzzy-matching free text."""

    VEGETARIAN = "VEGETARIAN"
    VEGAN = "VEGAN"
    JAIN = "JAIN"
    HALAL = "HALAL"
    GLUTEN_FREE = "GLUTEN_FREE"
    NON_VEGETARIAN = "NON_VEGETARIAN"


class PriceRange(enum.StrEnum):
    BUDGET = "BUDGET"
    MODERATE = "MODERATE"
    PREMIUM = "PREMIUM"


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
    is_eco_certified: Mapped[bool] = mapped_column(nullable=False, default=False)
    """Feature Blueprint P2 Sustainability "Sustainable business
    verification" — authority-only flag (same curator-role gate pattern as
    `tourism.Facility`/`TourismEvent`), never self-declared by the business
    itself. Set via `app/domains/business/router.py`'s
    `certify_business_eco_friendly`."""

    profile: Mapped["BusinessProfile | None"] = relationship(back_populates="business", uselist=False)
    services: Mapped[list["Service"]] = relationship(back_populates="business")


class BusinessProfile(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "business_profiles"
    __table_args__ = {"schema": "business"}

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business.businesses.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    description: Mapped[str | None]
    image_url: Mapped[str | None] = mapped_column(String(500))
    """Self-declared by the owner (same posture as `cuisines`/`price_range`
    below — no vendor feed exists to source a real photo from). Set via the
    same `PUT /businesses/{id}/profile` upsert every other profile field
    already goes through."""
    contact_info: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    accessibility_features: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    safety_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    women_friendly_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    family_friendly_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    cuisines: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    """Feature Blueprint P2 Food Intelligence — free-text cuisine tags
    (e.g. "North Indian", "Street food"), self-declared, only meaningful for
    RESTAURANT-category businesses but not enforced at the schema level
    (a hotel with an in-house restaurant is a real, plausible case)."""
    dietary_options: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    price_range: Mapped[PriceRange | None] = mapped_column(
        Enum(PriceRange, name="price_range", schema="business")
    )

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
    # Only meaningful for a TRANSPORT_CATEGORIES business (a real flight/
    # train/bus route) — null for every other category. Points at a real
    # seeded `tourism.destinations` row rather than a free-text city name:
    # this app's destinations are landmark-level, not city-level (see
    # travel/planner.py's own docstring), so "book a train to the Taj
    # Mahal" is the honest, real granularity this catalog actually has —
    # never a fabricated city/airport code.
    origin_destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    destination_destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))

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
