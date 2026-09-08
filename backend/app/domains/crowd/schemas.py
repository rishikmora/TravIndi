import uuid
from datetime import datetime

from pydantic import BaseModel


class CrowdCellOut(BaseModel):
    h3_cell: str
    destination_id: uuid.UUID | None
    observed_at: datetime
    density: float | None
    risk_score: float | None
