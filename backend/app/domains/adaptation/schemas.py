import uuid
from datetime import datetime

from pydantic import BaseModel


class AdaptationProposalOut(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    based_on_itinerary_id: uuid.UUID
    trigger_event_id: uuid.UUID
    reason_code: str
    changes: dict
    risk_level: str
    confidence: float | None
    status: str
    applied_itinerary_id: uuid.UUID | None
    created_at: datetime
    expires_at: datetime
    decided_at: datetime | None
