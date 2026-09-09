import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.gamification.models import GamificationCategory


class BadgeOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str
    category: GamificationCategory
    icon_key: str
    points_value: int


class UserBadgeOut(BaseModel):
    badge: BadgeOut
    awarded_at: datetime
    awarded_reason: str


class PointsSummaryOut(BaseModel):
    total_points: int
    by_category: dict[str, int]


class ChallengeOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str
    category: GamificationCategory
    target_count: int
    points_reward: int
    badge: BadgeOut | None
    my_progress_count: int = 0
    my_completed_at: datetime | None = None


class CheckInIn(BaseModel):
    destination_id: uuid.UUID
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class CheckInOut(BaseModel):
    id: uuid.UUID
    destination_id: uuid.UUID
    checked_in_at: datetime
    points_awarded: int
    new_badges: list[BadgeOut]


class LeaderboardEntryOut(BaseModel):
    display_name: str
    total_points: int
    rank: int


class MeGamificationOut(BaseModel):
    points: PointsSummaryOut
    badges: list[UserBadgeOut]
    destinations_visited: int
