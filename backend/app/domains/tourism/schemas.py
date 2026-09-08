import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GeoPoint(BaseModel):
    lon: float
    lat: float


class DestinationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    city: str | None
    state: str | None
    location: GeoPoint
    timezone: str
    status: str
    created_at: datetime
    updated_at: datetime


class AttractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    destination_id: uuid.UUID
    name: str
    category: str | None
    location: GeoPoint
    capacity: int | None


FacilityType = Literal[
    "WHEELCHAIR_RAMP",
    "ACCESSIBLE_TOILET",
    "ELEVATOR",
    "ACCESSIBLE_PARKING",
    "FIRST_AID",
    "INFORMATION_DESK",
    "DRINKING_WATER",
    "OTHER",
]


class FacilityCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    facility_type: FacilityType
    lon: float
    lat: float


class FacilityOut(BaseModel):
    id: uuid.UUID
    destination_id: uuid.UUID
    name: str
    facility_type: str
    location: GeoPoint


class DemandForecastOut(BaseModel):
    """A real heuristic (`method` always says so), never a trained ML
    forecast — see app/domains/tourism/router.py's `get_demand_forecast`
    docstring for exactly what real data these counts come from."""

    destination_id: uuid.UUID
    planned_visits_next_30_days: int
    confirmed_bookings_next_30_days: int
    recent_planning_momentum_7_days: int
    method: str = "heuristic_v1"
    computed_at: datetime
