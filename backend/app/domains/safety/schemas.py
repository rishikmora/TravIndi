import uuid
from datetime import datetime

from pydantic import BaseModel

from app.domains.tourism.schemas import GeoPoint


class SafetyScoreOut(BaseModel):
    destination_id: uuid.UUID
    score: float
    computed_at: datetime
    model_version: str | None


class IncidentCreateIn(BaseModel):
    incident_type: str
    severity: str
    lon: float
    lat: float
    description: str | None = None


class IncidentOut(BaseModel):
    id: uuid.UUID
    reporter_user_id: uuid.UUID
    incident_type: str
    severity: str
    status: str
    location: GeoPoint
    description: str | None
    assigned_to_user_id: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class IncidentActionIn(BaseModel):
    note: str | None = None
    outcome: str | None = None  # resolve only: "RESOLVED" (default) or "FALSE_ALARM"
