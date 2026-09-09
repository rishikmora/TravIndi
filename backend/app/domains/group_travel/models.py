"""Group & Family Travel domain models — `group_travel` schema (Feature
Blueprint P2 domain #21: shared itineraries, group expenses, group location
sharing, group safety score, member separation alerts, group SOS alerts).

Deliberately reuses existing real infrastructure rather than duplicating it:
a "shared itinerary" is just `travel.itineraries` on a `travel.trips` row
that now has more than one active member (see
`app/domains/travel/router.py`'s member-aware ownership check); "group
expenses" is the same extension applied to `financial.expenses`. Only the
genuinely new concepts — who's in the group, and where they last said they
were — get new tables here. `TripMemberLocation` stores exactly one row per
member (upserted, not a history log) — same "current position only, not a
tracked-history surface" posture as `crowd.location_events`' short-retention
rule.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class TripMemberRole(enum.StrEnum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"


class TripMemberStatus(enum.StrEnum):
    INVITED = "INVITED"
    ACTIVE = "ACTIVE"
    LEFT = "LEFT"


class TripMember(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "trip_members"
    __table_args__ = (
        Index("ix_trip_members_trip_user", "trip_id", "user_id", unique=True),
        {"schema": "group_travel"},
    )

    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("travel.trips.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[TripMemberRole] = mapped_column(
        Enum(TripMemberRole, name="trip_member_role", schema="group_travel"), nullable=False, default=TripMemberRole.MEMBER
    )
    status: Mapped[TripMemberStatus] = mapped_column(
        Enum(TripMemberStatus, name="trip_member_status", schema="group_travel"),
        nullable=False,
        default=TripMemberStatus.INVITED,
    )
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    location: Mapped["TripMemberLocation | None"] = relationship(back_populates="member", uselist=False)


class TripMemberLocation(UUIDPKMixin, Base):
    __tablename__ = "trip_member_locations"
    __table_args__ = {"schema": "group_travel"}

    trip_member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("group_travel.trip_members.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    member: Mapped["TripMember"] = relationship(back_populates="location")
