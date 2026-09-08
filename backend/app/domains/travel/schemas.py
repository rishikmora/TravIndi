import uuid
from datetime import datetime

from pydantic import BaseModel


class TripCreateIn(BaseModel):
    title: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    currency: str = "INR"


class TripUpdateIn(BaseModel):
    title: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    currency: str | None = None
    status: str | None = None


class TripOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    start_date: datetime | None
    end_date: datetime | None
    budget: float | None
    currency: str
    status: str
    created_at: datetime
    updated_at: datetime


class TripPlanRequestIn(BaseModel):
    destination_id: uuid.UUID | None = None
    prompt: str
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    currency: str = "INR"


class ItineraryGenerateIn(BaseModel):
    """Phase 12 addition — fills a gap between the traceability matrix
    (docs/00-planning/05-traceability-matrix-mvp.md §2 lists `POST
    /api/v1/ai/itinerary/generate` as part of FR-02's API surface) and what
    Phase 8 actually stubbed (only trip-plan and replan). `trip-plan` creates
    a brand-new Trip from a prompt; this generates an itinerary for a Trip
    that already exists (e.g. one created via plain `POST /trips`, Phase 10)
    — the natural next step from web/mobile's existing "Create trip" flow."""

    trip_id: uuid.UUID
    destination_id: uuid.UUID | None = None
    prompt: str


class ItineraryItemOut(BaseModel):
    id: uuid.UUID
    item_type: str
    attraction_id: uuid.UUID | None
    attraction_name: str | None
    sequence: int
    scheduled_time: datetime | None
    cost: float | None
    currency: str
    reason_code: str | None
    explanation: str | None


class ItineraryOut(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    version: int
    generated_by: str
    total_cost: float | None
    currency: str
    items: list[ItineraryItemOut]


class ItineraryReplanIn(BaseModel):
    reason: str
    context: dict = {}


class RouteRequestIn(BaseModel):
    origin_lon: float
    origin_lat: float
    destination_lon: float
    destination_lat: float


class RouteOut(BaseModel):
    id: uuid.UUID
    mode: str
    score: float | None
    reasons: dict
    confidence: float | None
