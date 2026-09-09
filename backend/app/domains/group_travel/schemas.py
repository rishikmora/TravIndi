import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.domains.group_travel.models import TripMemberRole, TripMemberStatus
from app.domains.tourism.schemas import GeoPoint


class MemberInviteIn(BaseModel):
    email: EmailStr


class TripMemberOut(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    user_id: uuid.UUID
    role: TripMemberRole
    status: TripMemberStatus
    invited_at: datetime
    joined_at: datetime | None


class LocationUpdateIn(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class MemberLocationOut(BaseModel):
    member_id: uuid.UUID
    user_id: uuid.UUID
    location: GeoPoint
    recorded_at: datetime
    distance_from_centroid_meters: float | None
    is_separated: bool


class GroupLocationsOut(BaseModel):
    centroid: GeoPoint | None
    members: list[MemberLocationOut]


class GroupSafetyOut(BaseModel):
    average_safety_score: float | None
    members_covered: int
    members_total: int
    by_member: dict[str, float | None]
