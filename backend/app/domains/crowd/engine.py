"""Live-variation heuristic layered on top of `crowd.crowd_cells`' stored
baseline density/risk_score. The baseline itself is already honestly
labeled fabricated seed data (`app/db/seed.py`'s `model_version="seed-demo-v1"`
disclaimer) — real live crowd telemetry (Computer Vision / IoT ingestion)
is explicitly out of scope for this prototype (no camera feed or sensor
hardware exists to ingest from). This module does not pretend otherwise:
it deterministically modulates the stored baseline by time of day so the
same real API endpoint genuinely returns different numbers depending on
when you call it, instead of a frozen snapshot forever — the same honest
"documented heuristic, not a trained/measured model" posture as
`tourism/router.py`'s `_OVERTOURISM_DENSITY_THRESHOLD` and
`get_demand_forecast`'s `method: "heuristic_v1"`.
"""

import math
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.crowd.models import CrowdCell

METHOD_NAME = "time_of_day_heuristic_v1"

_PEAK_HOUR = 13.0
"""Illustrative midday peak — real tourist attractions do genuinely see a
midday crowd peak and overnight trough; this is a smooth deterministic
approximation of that shape, not a measured or learned one."""

_SWING = 0.25
"""+/-25% modulation around the stored baseline — kept modest so a
real seeded max value (e.g. 0.90) never gets pushed absurdly past 1.0
after clamping."""


def time_of_day_multiplier(now: datetime) -> float:
    hour = now.hour + now.minute / 60 + now.second / 3600
    phase = (hour - _PEAK_HOUR) / 24 * 2 * math.pi
    return 1.0 + _SWING * math.cos(phase)


def apply_live_multiplier(baseline: float | None, multiplier: float) -> float | None:
    """Clamped to the same real 0-1 scale every stored density/risk_score
    value already uses (app/db/seed.py). `baseline` arrives as a
    `decimal.Decimal` at runtime (the columns are `Numeric`), not the
    `float` the type hint says SQLAlchemy's own model annotation claims —
    always convert before arithmetic."""
    if baseline is None:
        return None
    return max(0.0, min(1.0, float(baseline) * multiplier))


async def latest_risk_score(session: AsyncSession, *, destination_id: uuid.UUID) -> tuple[float, datetime] | None:
    """The one source of truth for "what does crowd risk look like right
    now at this destination" — same "most recent row, no freshness
    window" convention as `travel/planner.py`'s `_latest_crowd_density`.
    Reused by both itinerary generation's baseline capture and the
    adaptation engine's fresh-read comparison, so the two sides of a
    CROWD_CHANGE diff are always computed the same way."""
    row = (
        await session.execute(
            select(CrowdCell.risk_score, CrowdCell.observed_at)
            .where(CrowdCell.destination_id == destination_id)
            .order_by(CrowdCell.observed_at.desc())
            .limit(1)
        )
    ).first()
    if row is None or row[0] is None:
        return None
    return float(row[0]), row[1]
