"""Asynchronous job tracking — for long-running AI planning/CV work that
doesn't fit the synchronous request/response path (API Design §5.1). Phase
12's trip planner (app/domains/travel/planner.py) runs synchronously
instead, matching the NFR's "AI synchronous latency <= 5s (when
predictable)" target — this endpoint is for the exceptional case that
doesn't fit that budget. No job queue/worker exists yet (Phase 14+ workers
package, app/workers/). Contract-only 501 stub.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import Principal, get_current_principal
from app.core.errors import NotImplementedYet
from app.schemas.common import DataResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobOut(BaseModel):
    id: str
    status: str  # PENDING | RUNNING | COMPLETED | FAILED
    progress: float
    created_at: datetime
    result: dict | None = None


@router.get("/{job_id}", response_model=DataResponse[JobOut])
async def get_job(job_id: str, principal: Principal = Depends(get_current_principal)) -> DataResponse[JobOut]:
    raise NotImplementedYet(phase="Phase 14 (async job workers)")


@router.post("/{job_id}/cancel", response_model=DataResponse[JobOut])
async def cancel_job(
    job_id: str, principal: Principal = Depends(get_current_principal)
) -> DataResponse[JobOut]:
    raise NotImplementedYet(phase="Phase 14 (async job workers)")
