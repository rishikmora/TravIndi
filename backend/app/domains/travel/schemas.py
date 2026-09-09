import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.identity.schemas import AccessibilityNeed, TravelerType


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
    is_public: bool | None = None


class CarbonFootprintOut(BaseModel):
    """A rough, honestly-labeled heuristic — real distances between the
    trip's real itinerary stops, times a documented illustrative emission
    factor, never a certified carbon calculation. See
    app/domains/travel/router.py's `get_trip_carbon_footprint` docstring."""

    trip_id: uuid.UUID
    total_distance_km: float
    estimated_kg_co2: float
    stops_counted: int
    method: str = "distance_heuristic_v1"


class TripOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    start_date: datetime | None
    end_date: datetime | None
    budget: float | None
    currency: str
    status: str
    is_public: bool
    created_at: datetime
    updated_at: datetime


class TripPlanRequestIn(BaseModel):
    destination_id: uuid.UUID | None = None
    prompt: str
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    currency: str = "INR"
    # Disability-aware personalized planning — when omitted, `generate_itinerary`
    # falls back to the traveler's own saved `travel_preferences` profile
    # (PUT /users/me/travel-preferences) rather than assuming SOLO/no needs.
    traveler_type: TravelerType | None = None
    accessibility_needs: list[AccessibilityNeed] | None = None
    family_children_count: int | None = Field(default=None, ge=0, le=20)
    family_seniors_count: int | None = Field(default=None, ge=0, le=20)


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
    traveler_type: TravelerType | None = None
    accessibility_needs: list[AccessibilityNeed] | None = None
    family_children_count: int | None = Field(default=None, ge=0, le=20)
    family_seniors_count: int | None = Field(default=None, ge=0, le=20)


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
    nearest_accessible_facility_m: float | None = None
    """Surfaced from `ItineraryItem.score_snapshot` — the same real
    haversine distance (never fabricated) the disability-aware planner
    (app/domains/travel/planner.py) grounded its `explanation` in, so the
    frontend can show it as a structured badge, not just buried in prose.
    `None` when the item wasn't planned for an accessibility need."""


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
