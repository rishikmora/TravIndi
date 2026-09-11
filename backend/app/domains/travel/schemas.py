import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.identity.schemas import AccessibilityNeed, TravelerType

Pace = Literal["relaxed", "balanced", "packed"]
SafetyPreference = Literal["standard", "high", "very_high"]
QuickAction = Literal[
    "cheaper", "more_relaxed", "more_heritage", "more_food", "less_walking", "avoid_crowds", "improve_safety"
]


class TripCreateIn(BaseModel):
    title: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    currency: str = "INR"
    interests: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    pace: Pace | None = None
    safety_preference: SafetyPreference | None = None
    days: int | None = Field(default=None, ge=1, le=60)
    nights: int | None = Field(default=None, ge=0, le=60)


class TripUpdateIn(BaseModel):
    title: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    currency: str | None = None
    status: str | None = None
    is_public: bool | None = None
    interests: list[str] | None = None
    avoid: list[str] | None = None
    pace: Pace | None = None
    safety_preference: SafetyPreference | None = None
    days: int | None = Field(default=None, ge=1, le=60)
    nights: int | None = Field(default=None, ge=0, le=60)


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
    interests: list[str]
    avoid: list[str]
    pace: str | None
    safety_preference: str | None
    days: int | None
    nights: int | None
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
    # Trip-intent fields — persisted on the Trip this endpoint creates (see
    # Trip model docstring) so a later replan keeps them automatically.
    interests: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    pace: Pace | None = None
    safety_preference: SafetyPreference | None = None
    days: int | None = Field(default=None, ge=1, le=60)
    nights: int | None = Field(default=None, ge=0, le=60)


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
    day_offset: int | None
    time_of_day: str | None
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
    note: str | None
    completed: bool
    item_version: int
    """Optimistic-concurrency precondition for `PATCH .../items/{item_id}`
    — a client must echo the value it last saw back as `base_item_version`;
    a mismatch means the item changed elsewhere and the edit is rejected,
    never silently overwritten."""


class ItineraryItemUpdateIn(BaseModel):
    note: str | None = None
    completed: bool | None = None
    base_item_version: int
    """The `item_version` the client last saw. Required on every call —
    there is no unconditional write path for itinerary items."""


class ItineraryOut(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    destination_id: uuid.UUID | None
    version: int
    generated_by: str
    total_cost: float | None
    currency: str
    cost_estimate_available: bool
    """`any(item.cost is not None)` — no attraction anywhere has real price
    data yet, so this is currently always False. Exists so the frontend can
    say so honestly instead of silently omitting the budget section or
    implying a fabricated ₹0 total."""
    replan_reason: str | None
    previous_version: int | None
    unmatched_avoid_terms: list[str] = Field(default_factory=list)
    """`avoid` terms from the trip that matched no real attraction category
    at this destination — reported, never silently no-opped."""
    items: list[ItineraryItemOut]


class ItineraryReplanIn(BaseModel):
    reason: str
    context: dict = {}
    quick_action: QuickAction | None = None


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


class TripIntentExtractIn(BaseModel):
    prompt: str


class DestinationCandidateOut(BaseModel):
    id: uuid.UUID
    name: str
    city: str | None
    state: str | None
    has_attractions: bool
    """Whether this destination has any seeded Attraction rows — a
    destination can be a real, correctly-resolved row and still be
    unplannable (only 10 of ~60 seeded destinations have attraction data).
    Never let the frontend treat "resolved" and "plannable" as the same
    thing."""


class TripIntentExtractOut(BaseModel):
    destination_id: uuid.UUID | None
    """Only ever set when exactly one real destination matched the extracted
    name/city AND it has seeded attractions — never a value the model
    invented or a guess among multiple real candidates."""
    destination_candidates: list[DestinationCandidateOut] = Field(default_factory=list)
    days: int | None
    nights: int | None
    budget: float | None
    interests: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    traveler_type_hint: TravelerType | None
    missing_required: list[str] = Field(default_factory=list)
    """Computed deterministically in Python from what was actually resolved
    — never left to the model to decide what's "missing"."""
