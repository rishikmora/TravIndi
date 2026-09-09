"""Shared plain-Python geo math for callers that don't need a PostGIS round
trip — e.g. computing distances across a small, already-fetched set of
points (group location centroid/separation, trip carbon-footprint estimate).
For anything querying the database by distance/proximity, use a real
PostGIS `ST_DWithin`/`ST_Distance` call instead (see
app/domains/travel/routing.py, app/domains/gamification/router.py) — this
is only for post-fetch arithmetic on coordinates already in memory.
"""

import math

_EARTH_RADIUS_METERS = 6_371_000.0


def haversine_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * _EARTH_RADIUS_METERS * math.asin(math.sqrt(a))
