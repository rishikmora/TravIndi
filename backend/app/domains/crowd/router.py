"""Crowd awareness — FR-08 minimal P0 slice. Real queries against
`crowd.crowd_cells`; legitimately empty until Phase 14 wires up live
telemetry ingestion.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_pagination
from app.db.session import get_db_session
from app.domains.crowd.models import CrowdCell
from app.domains.crowd.schemas import CrowdCellOut
from app.schemas.common import ListResponse, Pagination

router = APIRouter(prefix="/crowd", tags=["crowd"])


def _to_out(row: CrowdCell) -> CrowdCellOut:
    return CrowdCellOut(
        h3_cell=row.h3_cell,
        destination_id=row.destination_id,
        observed_at=row.observed_at,
        density=row.density,
        risk_score=row.risk_score,
    )


@router.get("/heatmap", response_model=ListResponse[CrowdCellOut])
async def crowd_heatmap(
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[CrowdCellOut]:
    result = await session.execute(
        select(CrowdCell).order_by(CrowdCell.observed_at.desc()).limit(pagination.limit)
    )
    return ListResponse(data=[_to_out(r) for r in result.scalars().all()])


@router.get("/risk", response_model=ListResponse[CrowdCellOut])
async def crowd_risk(
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[CrowdCellOut]:
    result = await session.execute(
        select(CrowdCell)
        .where(CrowdCell.risk_score.is_not(None))
        .order_by(CrowdCell.risk_score.desc())
        .limit(pagination.limit)
    )
    return ListResponse(data=[_to_out(r) for r in result.scalars().all()])
