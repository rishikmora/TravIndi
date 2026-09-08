"""Safe-route scoring — Phase 13, prototype depth. Real PostGIS queries and
a real weighted cost function, but deliberately NOT a road-network routing
engine (OSRM/GraphHopper/Valhalla, Assumption C1): geometry is a straight
line between origin and destination, and "along the route" is approximated
by a fixed-radius buffer around that line, not actual road segments. This
is an explicit, documented scope cut for "build what requires not in full
depth" — the confirmed rule that follows from
docs/00-planning/01-project-master-model.md §O ("the LLM may explain or
select among validated route candidates; it must never invent road
geometry") is still honored: nothing here is LLM-generated, and the
straight-line geometry is clearly not represented as real road geometry.

Score is genuinely computed from live data (open incidents and crowd risk
near the route corridor), never a placeholder constant — reasons/confidence
reflect what data was actually found, never fabricated.
"""

from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.crowd.models import CrowdCell
from app.domains.safety.models import Incident, IncidentStatus
from app.domains.tourism.models import Destination
from app.domains.travel.models import RouteMode

_BUFFER_METERS = 3000
"""Corridor width around the straight-line route used to find "nearby"
incidents/destinations — a prototype-depth proxy for "along the route"
without real road-network segments."""

_OPEN_INCIDENT_STATUSES = [
    s for s in IncidentStatus if s not in (IncidentStatus.RESOLVED, IncidentStatus.CANCELLED, IncidentStatus.FALSE_ALARM)
]


@dataclass
class RouteScore:
    score: float
    confidence: float
    reasons: dict


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r_km * atan2(sqrt(a), sqrt(1 - a))


async def score_route(
    session: AsyncSession,
    *,
    mode: RouteMode,
    origin_lon: float,
    origin_lat: float,
    destination_lon: float,
    destination_lat: float,
) -> RouteScore:
    distance_km = _haversine_km(origin_lon, origin_lat, destination_lon, destination_lat)
    line_geog = func.ST_GeogFromText(
        f"SRID=4326;LINESTRING({origin_lon} {origin_lat}, {destination_lon} {destination_lat})"
    )

    incident_count = (
        await session.execute(
            select(func.count(Incident.id)).where(
                Incident.status.in_(_OPEN_INCIDENT_STATUSES),
                func.ST_DWithin(Incident.location, line_geog, _BUFFER_METERS),
            )
        )
    ).scalar_one()

    nearby_destination_ids = (
        (await session.execute(select(Destination.id).where(func.ST_DWithin(Destination.location, line_geog, _BUFFER_METERS))))
        .scalars()
        .all()
    )
    avg_crowd_risk = None
    if nearby_destination_ids:
        avg_crowd_risk = (
            await session.execute(
                select(func.avg(CrowdCell.risk_score)).where(CrowdCell.destination_id.in_(nearby_destination_ids))
            )
        ).scalar_one()
        avg_crowd_risk = float(avg_crowd_risk) if avg_crowd_risk is not None else None

    distance_penalty = min(distance_km / 50.0, 1.0)
    incident_penalty = min(incident_count / 5.0, 1.0)
    crowd_penalty = avg_crowd_risk if avg_crowd_risk is not None else 0.0

    if mode == RouteMode.CROWD_FREE:
        score = 1 - (0.7 * crowd_penalty + 0.1 * incident_penalty + 0.2 * distance_penalty)
    elif mode == RouteMode.EMERGENCY:
        score = 1 - distance_penalty
    else:  # SAFE and ACCESSIBLE — no accessibility-specific data exists yet, so
        # ACCESSIBLE uses the same formula as SAFE (documented simplification).
        score = 1 - (0.5 * incident_penalty + 0.3 * crowd_penalty + 0.2 * distance_penalty)
    score = max(0.0, min(1.0, score))

    # Confidence reflects real data availability, never a fabricated
    # constant: higher when there's an actual crowd signal near the route.
    confidence = 0.8 if avg_crowd_risk is not None else 0.5

    reasons = {
        "distance_km": round(distance_km, 2),
        "nearby_open_incident_count": incident_count,
        "avg_crowd_risk_nearby": round(avg_crowd_risk, 3) if avg_crowd_risk is not None else None,
        "corridor_buffer_meters": _BUFFER_METERS,
        "note": (
            "Straight-line corridor heuristic scored against live incident/crowd data — "
            "no road-network routing engine (OSRM) in this prototype; geometry is a "
            "straight line, not real road geometry."
        ),
    }
    return RouteScore(score=round(score, 4), confidence=confidence, reasons=reasons)
