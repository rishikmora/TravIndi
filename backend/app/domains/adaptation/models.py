"""Adaptive journey engine models — `adaptation` schema. Only two event
categories are ever emitted: CROWD_CHANGE and SAFETY_CHANGE/INCIDENT_IMPACT
— the only ones with a real underlying signal in this codebase to detect
from. WEATHER_CHANGE/TRANSPORT_CHANGE/AVAILABILITY_CHANGE are deliberately
absent, matching how this codebase always treats infra that doesn't exist
yet (`crowd.CrowdEvent`/`safety.SafetyScore` carry the same kind of
documented-absence disclaimer rather than a fabricated implementation).

No RLS here — verified via `git grep "ENABLE ROW LEVEL SECURITY"
alembic/versions/` that `travel.trips`/`travel.itineraries` have never had
RLS applied in this codebase; trip-scoped data here is authorized entirely
at the app layer via OPA's "self" resource type
(`app/domains/travel/access.py`). This data is exactly that shape, so it
follows `travel`'s own precedent, not `chat`'s membership-RLS pattern.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class AdaptationEventType(enum.StrEnum):
    CROWD_CHANGE = "CROWD_CHANGE"
    SAFETY_CHANGE = "SAFETY_CHANGE"


class AdaptationEventStatus(enum.StrEnum):
    PENDING = "PENDING"
    PROCESSED = "PROCESSED"
    IGNORED = "IGNORED"
    FAILED = "FAILED"


class AdaptationReasonCode(enum.StrEnum):
    CROWD_THRESHOLD = "CROWD_THRESHOLD"
    SAFETY_THRESHOLD = "SAFETY_THRESHOLD"
    """Reserved, never emitted this pass — would need a real-time
    `safety.SafetyScore` recompute job, which doesn't exist (scores are
    only ever written by the one-time seed script, confirmed via grep)."""
    INCIDENT_IMPACT = "INCIDENT_IMPACT"
    USER_REQUEST = "USER_REQUEST"
    """Not emitted by this engine at all — reserved for retroactively
    tagging the existing, unrelated manual `/ai/itinerary/{id}/replan`
    path for reason-code consistency, if that's ever done. Not part of
    this pass's scope."""


class AdaptationProposalStatus(enum.StrEnum):
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    """Reserved, unreachable this pass — accept goes straight
    PROPOSED -> APPLIED once staleness/policy checks pass; there is no
    separate human-approval step beyond the trip owner's own accept."""
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    APPLIED = "APPLIED"
    STALE = "STALE"


class AdaptationEvent(UUIDPKMixin, TimestampMixin, Base):
    """A real, validated signal that something changed near a trip's
    current itinerary. Never AI-generated — always produced by
    deterministic detection code (`app/domains/adaptation/detection.py`)
    reading real rows: a real `safety.Incident`, or a real fresh
    `crowd.CrowdCell` reading compared against a stored baseline."""

    __tablename__ = "adaptation_events"
    __table_args__ = (
        Index("ix_adaptation_events_trip_created", "trip_id", "created_at"),
        {"schema": "adaptation"},
    )

    event_type: Mapped[AdaptationEventType] = mapped_column(
        Enum(AdaptationEventType, name="adaptation_event_type", schema="adaptation"), nullable=False
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("travel.trips.id", ondelete="CASCADE"), nullable=False)
    itinerary_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("travel.itinerary_items.id", ondelete="SET NULL")
    )
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    # Polymorphic pointer to whatever real row triggered this — no FK,
    # matching `identity.Notification.related_entity_id`'s own convention.
    # Today the only real source is `safety.incidents`; CROWD_CHANGE events
    # leave both fields null (the signal is a destination-level reading,
    # not one row).
    source_entity_type: Mapped[str | None] = mapped_column(String(32))
    source_entity_id: Mapped[uuid.UUID | None]
    severity: Mapped[str] = mapped_column(String(16), nullable=False)  # LOW|MEDIUM|HIGH
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[AdaptationEventStatus] = mapped_column(
        Enum(AdaptationEventStatus, name="adaptation_event_status", schema="adaptation"),
        nullable=False,
        default=AdaptationEventStatus.PENDING,
    )
    # Real, id-based for SAFETY_CHANGE (incident_id + item_id — a durable
    # identity, no time bucket needed); hour-bucketed for CROWD_CHANGE (no
    # discrete source row to key off) — see detection.py.
    deduplication_key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class AdaptationProposal(UUIDPKMixin, TimestampMixin, Base):
    """A concrete, AI-assisted candidate change — never auto-applied.
    `changes` stores the exact structured diff the user was shown; accept
    materializes precisely that (never re-calls Claude), so there is no gap
    between what was reviewed and what gets applied."""

    __tablename__ = "adaptation_proposals"
    __table_args__ = (
        Index("ix_adaptation_proposals_trip_status_created", "trip_id", "status", "created_at"),
        {"schema": "adaptation"},
    )

    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("travel.trips.id", ondelete="CASCADE"), nullable=False)
    based_on_itinerary_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("travel.itineraries.id", ondelete="CASCADE"), nullable=False
    )
    trigger_event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("adaptation.adaptation_events.id", ondelete="CASCADE"), nullable=False
    )
    reason_code: Mapped[AdaptationReasonCode] = mapped_column(
        Enum(AdaptationReasonCode, name="adaptation_reason_code", schema="adaptation"), nullable=False
    )
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False)  # LOW|MODERATE|HIGH
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    status: Mapped[AdaptationProposalStatus] = mapped_column(
        Enum(AdaptationProposalStatus, name="adaptation_proposal_status", schema="adaptation"),
        nullable=False,
        default=AdaptationProposalStatus.PROPOSED,
    )
    applied_itinerary_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("travel.itineraries.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
