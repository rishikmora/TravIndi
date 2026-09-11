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
from datetime import datetime

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
