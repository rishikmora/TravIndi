import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.business.models import BusinessCategory, DietaryOption, PriceRange
from app.domains.tourism.schemas import GeoPoint


class BusinessCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: BusinessCategory
    destination_id: uuid.UUID | None = None
    lon: float | None = None
    lat: float | None = None


class BusinessProfileIn(BaseModel):
    description: str | None = Field(default=None, max_length=4000)
    image_url: str | None = Field(default=None, max_length=500)
    contact_info: dict = Field(default_factory=dict)
    accessibility_features: dict = Field(default_factory=dict)
    cuisines: list[str] = Field(default_factory=list, max_length=20)
    dietary_options: list[DietaryOption] = Field(default_factory=list)
    price_range: PriceRange | None = None


class BusinessProfileOut(BaseModel):
    description: str | None
    image_url: str | None
    contact_info: dict
    accessibility_features: dict
    safety_score: float | None
    women_friendly_score: float | None
    family_friendly_score: float | None
    cuisines: list[str]
    dietary_options: list[str]
    price_range: str | None


class BusinessOut(BaseModel):
    id: uuid.UUID
    owner_user_id: uuid.UUID
    name: str
    category: BusinessCategory
    destination_id: uuid.UUID | None
    location: GeoPoint | None
    is_verified: bool
    is_eco_certified: bool
    profile: BusinessProfileOut | None = None
    created_at: datetime


class ServiceCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    base_price: float | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    # Only meaningful when the owning business is AIRLINE/RAILWAY/BUS_OPERATOR
    # — a real route between two seeded destinations. Ignored (left null) for
    # every other business category.
    origin_destination_id: uuid.UUID | None = None
    destination_destination_id: uuid.UUID | None = None


class ServiceOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    description: str | None
    base_price: float | None
    currency: str
    origin_destination_id: uuid.UUID | None
    destination_destination_id: uuid.UUID | None


class TransportSearchResultOut(BaseModel):
    """One real, bookable departure — a `Service` (route) joined with one
    of its upcoming `Availability` rows (a specific scheduled departure)
    and its owning `Business` (the operator). Names are denormalized so
    the frontend search results need no follow-up requests."""

    service_id: uuid.UUID
    business_id: uuid.UUID
    business_name: str
    category: BusinessCategory
    origin_destination_id: uuid.UUID | None
    origin_name: str | None
    destination_destination_id: uuid.UUID | None
    destination_name: str | None
    availability_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    capacity: int
    booked_count: int
    remaining: int
    base_price: float | None
    currency: str


class AvailabilityCreateIn(BaseModel):
    starts_at: datetime
    ends_at: datetime
    capacity: int = Field(default=1, ge=1)


class AvailabilityOut(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    capacity: int
    booked_count: int


class GuideCreateIn(BaseModel):
    languages: list[str] = Field(default_factory=list)
    specialties: list[str] = Field(default_factory=list)
    destination_id: uuid.UUID | None = None
    bio: str | None = Field(default=None, max_length=2000)


class GuideOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    languages: list[str]
    specialties: list[str]
    destination_id: uuid.UUID | None
    is_verified: bool
    bio: str | None
    created_at: datetime
