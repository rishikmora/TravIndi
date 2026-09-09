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
    image_url: str | None
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


class TourismEventCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime
    expected_attendance: int | None = Field(default=None, ge=0)


class TourismEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    destination_id: uuid.UUID
    name: str
    starts_at: datetime
    ends_at: datetime
    expected_attendance: int | None


class OvertourismOut(BaseModel):
    """Real threshold check against the most recent `crowd.crowd_cells.density`
    reading — never a fabricated "carrying capacity" score. See
    app/domains/tourism/router.py's `get_overtourism_signal` docstring for
    the exact (illustrative, undocumented-elsewhere) threshold used."""

    destination_id: uuid.UUID
    latest_density: float | None
    threshold: float
    is_overtouristed: bool
    observed_at: datetime | None


class WeatherOut(BaseModel):
    """Real current conditions at the destination's own coordinates, from
    Open-Meteo (free, no API key, no fabricated numbers) — see
    app/domains/tourism/weather.py. `None` fields mean the upstream call
    failed; the frontend must render an honest "unavailable" state, never a
    guessed value."""

    temperature_c: float | None
    condition: str | None
    is_day: bool | None
    observed_at: datetime | None


class ExploreOut(BaseModel):
    """Result of a real "virtual explore" — a small points award (Feature
    Blueprint gamification) for engaging with a destination's real content
    on the site. Deliberately smaller than, and never confused with, a real
    GPS-verified `DestinationCheckIn` — see
    app/domains/gamification/engine.py's `record_virtual_explore`."""

    destination_id: uuid.UUID
    points_awarded: int
    already_explored: bool


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
