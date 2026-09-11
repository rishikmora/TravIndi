import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.tourism.schemas import GeoPoint


class CrowdDemoBumpIn(BaseModel):
    """Demo/jury-only trigger for the adaptive journey engine's
    CROWD_CHANGE path (`POST /crowd/demo/bump`) — see that endpoint's
    docstring for why this inserts a real row rather than fabricating an
    event directly."""

    destination_id: uuid.UUID
    risk_score: float = Field(ge=0.0, le=1.0)


class CrowdCellOut(BaseModel):
    h3_cell: str
    destination_id: uuid.UUID | None
    observed_at: datetime
    density: float | None
    risk_score: float | None


class CrowdHeatmapPointOut(BaseModel):
    """`/crowd/heatmap` and `/crowd/risk`'s enriched shape — real map
    rendering needs coordinates and a name, which the bare `CrowdCellOut`
    (still used by `/destinations/{id}/crowd`) never carried. `density`/
    `risk_score` are the live, time-of-day-adjusted estimate (see
    `app/domains/crowd/engine.py`); `baseline_*` are the real stored values
    exactly as last recorded, kept alongside for transparency rather than
    silently replaced."""

    h3_cell: str
    destination_id: uuid.UUID | None
    destination_name: str | None
    location: GeoPoint | None
    recorded_at: datetime
    baseline_density: float | None
    baseline_risk_score: float | None
    density: float | None
    risk_score: float | None
    computed_at: datetime
    method: str
