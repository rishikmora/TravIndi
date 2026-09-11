"""Crowd awareness — FR-08 minimal P0 slice. Real queries against
`crowd.crowd_cells`; legitimately empty until Phase 14 wires up live
telemetry ingestion.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.api.deps import get_pagination
from app.db.session import get_db_session
from app.domains.crowd.engine import METHOD_NAME, apply_live_multiplier, time_of_day_multiplier
from app.domains.crowd.models import CrowdCell
from app.domains.crowd.schemas import CrowdHeatmapPointOut
from app.domains.tourism.models import Destination
from app.domains.tourism.schemas import GeoPoint
from app.schemas.common import ListResponse, Pagination

router = APIRouter(prefix="/crowd", tags=["crowd"])


def _latest_per_cell(base_query: Select) -> Select:
    """Collapses to exactly one row per `h3_cell` (its most recent
    `observed_at`) before joining `Destination` — without this, a cell
    re-observed more than once (a real future ingestion pipeline re-reading
    the same location, or even just a test writing a second row without
    cleaning up the first) shows up as duplicate stale markers on the same
    spot instead of one current reading."""
    latest = (
        select(CrowdCell.h3_cell, func.max(CrowdCell.observed_at).label("latest_observed_at"))
        .group_by(CrowdCell.h3_cell)
        .subquery()
    )
    return base_query.join(
        latest,
        (CrowdCell.h3_cell == latest.c.h3_cell) & (CrowdCell.observed_at == latest.c.latest_observed_at),
    )


def _to_geo_point(wkb_element) -> GeoPoint:
    # Same GeoAlchemy2 str-vs-WKBElement mypy quirk tourism/router.py's
    # identical helper already works around — leaving the parameter
    # unannotated (implicit Any) is the established fix, not an oversight.
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _to_heatmap_point(
    cell: CrowdCell, destination: Destination | None, now: datetime, multiplier: float
) -> CrowdHeatmapPointOut:
    location = _to_geo_point(destination.location) if destination is not None else None
    return CrowdHeatmapPointOut(
        h3_cell=cell.h3_cell,
        destination_id=cell.destination_id,
        destination_name=destination.name if destination else None,
        location=location,
        recorded_at=cell.observed_at,
        baseline_density=cell.density,
        baseline_risk_score=cell.risk_score,
        density=apply_live_multiplier(cell.density, multiplier),
        risk_score=apply_live_multiplier(cell.risk_score, multiplier),
        computed_at=now,
        method=METHOD_NAME,
    )


@router.get("/heatmap", response_model=ListResponse[CrowdHeatmapPointOut])
async def crowd_heatmap(
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[CrowdHeatmapPointOut]:
    """Global, across every destination — the map's whole point. Ordering
    by the real stored baseline (not the live-adjusted value) is
    equivalent here: a single shared multiplier applied to every row in
    one response never changes their relative order."""
    query = _latest_per_cell(select(CrowdCell, Destination)).outerjoin(
        Destination, Destination.id == CrowdCell.destination_id
    )
    result = await session.execute(query.order_by(CrowdCell.observed_at.desc()).limit(pagination.limit))
    now = datetime.now(UTC)
    multiplier = time_of_day_multiplier(now)
    return ListResponse(data=[_to_heatmap_point(cell, dest, now, multiplier) for cell, dest in result.all()])


@router.get("/risk", response_model=ListResponse[CrowdHeatmapPointOut])
async def crowd_risk(
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[CrowdHeatmapPointOut]:
    query = _latest_per_cell(select(CrowdCell, Destination)).outerjoin(
        Destination, Destination.id == CrowdCell.destination_id
    )
    result = await session.execute(
        query.where(CrowdCell.risk_score.is_not(None)).order_by(CrowdCell.risk_score.desc()).limit(pagination.limit)
    )
    now = datetime.now(UTC)
    multiplier = time_of_day_multiplier(now)
    return ListResponse(data=[_to_heatmap_point(cell, dest, now, multiplier) for cell, dest in result.all()])
