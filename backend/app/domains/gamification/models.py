"""Gamification domain models — `gamification` schema (Feature Blueprint P2
domains #15 Gamification / #26 Digital Tourism Passport, folded into one —
docs/00-planning/04-feature-priority-matrix.md classifies both P2/P3,
"staged, not cut"; this is that staging picked back up).

Every point/badge award here traces to a real action elsewhere in the system
(a GPS-proximity-verified check-in, a real booking, a real review) — never a
fabricated counter. `PointsLedger` is append-only (an audit trail of *why*
a user has however many points), not a single mutable balance column, so a
user's total is always a real sum over real events, not a number that can
drift from its own history.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class GamificationCategory(enum.StrEnum):
    """Shared category taxonomy across badges/challenges/points — the
    Blueprint's own category list (state/district/heritage/hidden-gem/eco/
    local-business challenges, exploration/responsible-tourism/local-economy/
    heritage points) collapsed into one enum since they're the same concept
    wearing three different Blueprint-domain hats."""

    EXPLORATION = "EXPLORATION"
    HERITAGE = "HERITAGE"
    LOCAL_ECONOMY = "LOCAL_ECONOMY"
    RESPONSIBLE_TOURISM = "RESPONSIBLE_TOURISM"
    COMMUNITY = "COMMUNITY"


class Badge(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "badges"
    __table_args__ = {"schema": "gamification"}

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    category: Mapped[GamificationCategory] = mapped_column(
        Enum(GamificationCategory, name="gamification_category", schema="gamification"), nullable=False
    )
    icon_key: Mapped[str] = mapped_column(String(64), nullable=False)
    points_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    user_badges: Mapped[list["UserBadge"]] = relationship(back_populates="badge")


class UserBadge(UUIDPKMixin, Base):
    __tablename__ = "user_badges"
    __table_args__ = (
        Index("ix_user_badges_user_badge", "user_id", "badge_id", unique=True),
        {"schema": "gamification"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    badge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gamification.badges.id", ondelete="CASCADE"), nullable=False)
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    awarded_reason: Mapped[str] = mapped_column(nullable=False)

    badge: Mapped["Badge"] = relationship(back_populates="user_badges")


class PointsLedger(UUIDPKMixin, Base):
    """Append-only — never updated or deleted, so a user's balance is always
    a real, re-derivable SUM over genuine events, not a mutable counter."""

    __tablename__ = "points_ledger"
    __table_args__ = (Index("ix_points_ledger_user_created", "user_id", "created_at"), {"schema": "gamification"})

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[GamificationCategory] = mapped_column(
        Enum(GamificationCategory, name="gamification_category", schema="gamification"), nullable=False
    )
    reason: Mapped[str] = mapped_column(nullable=False)
    related_entity_type: Mapped[str | None] = mapped_column(String(32))
    related_entity_id: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Challenge(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "challenges"
    __table_args__ = {"schema": "gamification"}

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    category: Mapped[GamificationCategory] = mapped_column(
        Enum(GamificationCategory, name="gamification_category", schema="gamification"), nullable=False
    )
    target_count: Mapped[int] = mapped_column(Integer, nullable=False)
    points_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    badge_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("gamification.badges.id"))
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)


class UserChallengeProgress(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user_challenge_progress"
    __table_args__ = (
        Index("ix_user_challenge_progress_user_challenge", "user_id", "challenge_id", unique=True),
        {"schema": "gamification"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    challenge_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gamification.challenges.id", ondelete="CASCADE"), nullable=False
    )
    progress_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DestinationCheckIn(UUIDPKMixin, Base):
    """A real, GPS-proximity-verified visit — `app/domains/gamification/
    router.py` rejects a check-in whose submitted coordinates aren't within
    `_CHECK_IN_RADIUS_METERS` of the destination's real location (PostGIS
    `ST_DWithin`), so a row here is real evidence the user's device was
    actually near the place, not a self-reported claim."""

    __tablename__ = "destination_check_ins"
    __table_args__ = (
        Index("ix_destination_check_ins_user_destination", "user_id", "destination_id"),
        {"schema": "gamification"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    destination_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tourism.destinations.id", ondelete="CASCADE"), nullable=False
    )
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
