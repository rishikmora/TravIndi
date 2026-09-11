"""Travel domain models — `travel` schema (AI trip planning + safe-route
navigation, FR-02/FR-04). `ItineraryItem` uses the polymorphic reference
pattern confirmed in docs/00-planning/09-database-schema-plan.md §2 to
resolve the Revised-vs-Baseline field-list conflict: a nullable FK per
possible target type, only one populated per row, gated by `item_type`.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class TripStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ItemType(enum.StrEnum):
    ATTRACTION = "ATTRACTION"
    EVENT = "EVENT"
    ROUTE_SEGMENT = "ROUTE_SEGMENT"
    # HOTEL / RESTAURANT / TRANSPORT reference the `business`/`booking` schemas
    # (P1) — not modeled yet; item_type is reserved so no migration is needed
    # to add them later.
    HOTEL = "HOTEL"
    RESTAURANT = "RESTAURANT"
    TRANSPORT = "TRANSPORT"


class RouteMode(enum.StrEnum):
    SAFE = "SAFE"
    CROWD_FREE = "CROWD_FREE"
    ACCESSIBLE = "ACCESSIBLE"
    EMERGENCY = "EMERGENCY"
    FASTEST = "FASTEST"


class Trip(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "trips"
    __table_args__ = {"schema": "travel"}

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(200))
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    budget: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    status: Mapped[TripStatus] = mapped_column(
        Enum(TripStatus, name="trip_status", schema="travel"), nullable=False, default=TripStatus.DRAFT
    )
    is_public: Mapped[bool] = mapped_column(nullable=False, default=False)
    """Feature Blueprint P2 "Public trip journals"/"Verified travel stories"
    — a trip owner opts in to sharing their real itinerary as inspiration
    for others (app/domains/social/router.py's public-journals feed). False
    by default; never flips on its own."""

    # Trip-intent fields — stored on Trip (not threaded as generate_itinerary
    # kwargs) specifically so replan_itinerary's fresh generate_itinerary
    # call on the same Trip row keeps them for free, the same way it already
    # keeps budget/currency today.
    interests: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    avoid: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    pace: Mapped[str | None] = mapped_column(String(16))  # relaxed|balanced|packed
    safety_preference: Mapped[str | None] = mapped_column(String(16))  # standard|high|very_high
    days: Mapped[int | None]
    nights: Mapped[int | None]

    itineraries: Mapped[list["Itinerary"]] = relationship(back_populates="trip")


class Itinerary(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "itineraries"
    __table_args__ = {"schema": "travel"}

    trip_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("travel.trips.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False, default=1)
    generated_by: Mapped[str] = mapped_column(String(16), nullable=False, default="AI")  # AI|USER
    total_cost: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    # Denormalized at generation time — replan_itinerary previously had to
    # brittly re-derive this from the first item's attraction (breaks if
    # that attraction was later deleted); also gives a stable id for
    # destination-scoped lookups (e.g. the restaurant panel) without a
    # second round trip through the items.
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    # Real, structured replan history — previously only existed inside a
    # transient prompt string sent to Claude, never persisted anywhere.
    replan_reason: Mapped[str | None]
    previous_version: Mapped[int | None]
    # Captured once at generation time (planner.py's `_plan_itinerary_
    # candidate`, unconditionally) — the real baseline the adaptive journey
    # engine's CROWD_CHANGE detector (app/domains/adaptation/detection.py)
    # diffs a later reading against. Null on pre-adaptation-engine rows,
    # meaning "no baseline captured," which the detector treats as nothing
    # to compare against rather than a false zero.
    baseline_crowd_risk_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    baseline_crowd_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    trip: Mapped["Trip"] = relationship(back_populates="itineraries")
    items: Mapped[list["ItineraryItem"]] = relationship(
        back_populates="itinerary", order_by="ItineraryItem.sequence"
    )


class ItineraryItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "itinerary_items"
    __table_args__ = (
        CheckConstraint("sequence >= 0", name="ck_itinerary_items_sequence_nonneg"),
        {"schema": "travel"},
    )

    itinerary_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("travel.itineraries.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[ItemType] = mapped_column(
        Enum(ItemType, name="itinerary_item_type", schema="travel"), nullable=False
    )
    # Polymorphic target — exactly one of these is populated, matching item_type.
    attraction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.attractions.id"))
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.tourism_events.id"))
    route_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("travel.routes.id"))

    sequence: Mapped[int] = mapped_column(nullable=False)
    scheduled_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The AI's own PlannedItem already returns day_offset/time_of_day today
    # (app/domains/travel/planner.py) — they were only ever used to compute
    # scheduled_time and then discarded. Persisting them directly means a
    # duration-only trip (no real start_date, so scheduled_time stays null)
    # still keeps real day structure instead of degenerating to a flat list.
    day_offset: Mapped[int | None]
    time_of_day: Mapped[str | None] = mapped_column(String(16))  # morning|afternoon|evening
    cost: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    transport_mode: Mapped[str | None] = mapped_column(String(32))

    # Explainability — Database Design extraction §5.2 "Reason snapshot".
    reason_code: Mapped[str | None] = mapped_column(String(64))
    explanation: Mapped[str | None]
    score_snapshot: Mapped[dict | None] = mapped_column(JSONB)

    # Real item-level mutation (offline-first upgrade) — previously the
    # only way to change an itinerary was a whole-new AI-regenerated
    # version. A plain integer counter, not `updated_at`, is the
    # optimistic-concurrency precondition: a client-held JS Date truncates
    # to millisecond precision and would cause spurious false-conflicts
    # against a microsecond-precision DB timestamp.
    note: Mapped[str | None]
    completed: Mapped[bool] = mapped_column(nullable=False, default=False)
    item_version: Mapped[int] = mapped_column(nullable=False, default=1)

    itinerary: Mapped["Itinerary"] = relationship(back_populates="items")


class Route(UUIDPKMixin, TimestampMixin, Base):
    """Cached route computations. Geometry and scores come from the spatial
    routing engine (Phase 13) — never generated by the LLM
    (docs/00-planning/01-project-master-model.md §O)."""

    __tablename__ = "routes"
    __table_args__ = {"schema": "travel"}

    mode: Mapped[RouteMode] = mapped_column(Enum(RouteMode, name="route_mode", schema="travel"), nullable=False)
    origin: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    destination: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    geometry: Mapped[str | None] = mapped_column(Geography(geometry_type="LINESTRING", srid=4326))
    score: Mapped[float | None] = mapped_column(Numeric(6, 4))
    reasons: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))