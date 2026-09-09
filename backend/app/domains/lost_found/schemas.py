import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.lost_found.models import (
    FoundItemStatus,
    LostFoundCategory,
    LostItemStatus,
    MatchStatus,
)
from app.domains.tourism.schemas import GeoPoint


class LostItemCreateIn(BaseModel):
    category: LostFoundCategory
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    lost_at: datetime
    destination_id: uuid.UUID | None = None
    lon: float | None = None
    lat: float | None = None


class LostItemOut(BaseModel):
    id: uuid.UUID
    reporter_user_id: uuid.UUID
    category: LostFoundCategory
    title: str
    description: str
    lost_at: datetime
    destination_id: uuid.UUID | None
    location: GeoPoint | None
    status: LostItemStatus
    created_at: datetime


class FoundItemCreateIn(BaseModel):
    category: LostFoundCategory
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    found_at: datetime
    destination_id: uuid.UUID | None = None
    lon: float | None = None
    lat: float | None = None
    storage_location: str | None = Field(default=None, max_length=300)


class FoundItemOut(BaseModel):
    id: uuid.UUID
    finder_user_id: uuid.UUID
    category: LostFoundCategory
    title: str
    description: str
    found_at: datetime
    destination_id: uuid.UUID | None
    location: GeoPoint | None
    storage_location: str | None
    status: FoundItemStatus
    created_at: datetime


class MatchOut(BaseModel):
    id: uuid.UUID
    lost_item: LostItemOut
    found_item: FoundItemOut
    similarity_score: float
    status: MatchStatus
    created_at: datetime
