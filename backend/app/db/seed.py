"""Reference/dev seed data — deliberately separate from Alembic migrations
per the governing migration rule ("seed data must be separate from
migrations"). Safe to re-run: every insert is idempotent (checks for an
existing row first).

Usage: `python -m app.db.seed` (requires the app's runtime DATABASE_URL,
i.e. the `travindi_app` role — seeding goes through the same RLS-aware path
production code uses, so it runs with `app.user_role = 'service'` for the
duration of the session).

Deliberately does NOT seed `knowledge.knowledge_chunks` — that needs a
(local) embedding-model call, unlike everything here, which is pure DB
writes. See `python -m app.db.seed_knowledge` (Phase 12) for that step,
kept separate so this script stays instant and dependency-light.
"""

import asyncio
from datetime import UTC, datetime

import h3
from sqlalchemy import select, text

from app.db.session import get_engine, get_session_factory
from app.domains.crowd.models import CrowdCell
from app.domains.safety.models import SafetyScore
from app.domains.tourism.models import Attraction, Destination

_SEED_DESTINATIONS = [
    {"name": "India Gate", "city": "New Delhi", "state": "Delhi", "lon": 77.2295, "lat": 28.6129},
    {"name": "Gateway of India", "city": "Mumbai", "state": "Maharashtra", "lon": 72.8347, "lat": 18.9220},
    {"name": "Mysore Palace", "city": "Mysuru", "state": "Karnataka", "lon": 76.6552, "lat": 12.3052},
]

# Real, publicly-known attractions near/associated with each seeded
# destination — not fabricated. Kept deliberately free of specific ticket
# prices/opening hours (those change and aren't independently verified
# here); category/name/location are the only claims made.
_SEED_ATTRACTIONS = {
    "India Gate": [
        {"name": "National War Memorial", "category": "memorial", "lon": 77.2249, "lat": 28.6120},
        {"name": "Rajpath", "category": "landmark", "lon": 77.2246, "lat": 28.6139},
    ],
    "Gateway of India": [
        {
            "name": "Chhatrapati Shivaji Maharaj Vastu Sangrahalaya",
            "category": "museum",
            "lon": 72.8347,
            "lat": 18.9264,
        },
        {"name": "Elephanta Caves", "category": "heritage", "lon": 72.9317, "lat": 18.9633},
    ],
    "Mysore Palace": [
        {"name": "Mysuru Zoo", "category": "zoo", "lon": 76.6634, "lat": 12.3060},
        {"name": "Chamundi Hills", "category": "temple", "lon": 76.6698, "lat": 12.2724},
    ],
}

# Illustrative current-state snapshots so the destination safety/crowd views
# and safe-route scoring (Phase 13) have real signal to compute against in a
# demo, instead of legitimately-empty "no telemetry yet" results. Clearly
# labeled model_version="seed-demo-v1" — this is fabricated seed data, never
# real model/telemetry output, and must never be reported as such.
_SEED_CROWD_SAFETY = {
    "India Gate": {"density": 0.65, "risk_score": 0.55, "safety_score": 0.72},
    "Gateway of India": {"density": 0.80, "risk_score": 0.75, "safety_score": 0.60},
    "Mysore Palace": {"density": 0.30, "risk_score": 0.20, "safety_score": 0.88},
}
_H3_RESOLUTION = 9


async def seed() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("SET app.user_role = 'service'"))

        destinations_by_name: dict[str, Destination] = {}
        for row in _SEED_DESTINATIONS:
            existing = await session.execute(
                select(Destination).where(Destination.name == row["name"])
            )
            destination = existing.scalar_one_or_none()
            if destination is None:
                destination = Destination(
                    name=row["name"],
                    city=row["city"],
                    state=row["state"],
                    location=f"SRID=4326;POINT({row['lon']} {row['lat']})",
                )
                session.add(destination)
                await session.flush()
            destinations_by_name[row["name"]] = destination

        for destination_name, attractions in _SEED_ATTRACTIONS.items():
            destination = destinations_by_name[destination_name]
            for row in attractions:
                existing = await session.execute(
                    select(Attraction).where(
                        Attraction.destination_id == destination.id, Attraction.name == row["name"]
                    )
                )
                if existing.scalar_one_or_none() is not None:
                    continue
                session.add(
                    Attraction(
                        destination_id=destination.id,
                        name=row["name"],
                        category=row["category"],
                        location=f"SRID=4326;POINT({row['lon']} {row['lat']})",
                    )
                )

        for row in _SEED_DESTINATIONS:
            destination = destinations_by_name[row["name"]]
            signals = _SEED_CROWD_SAFETY[row["name"]]
            h3_cell = h3.latlng_to_cell(row["lat"], row["lon"], _H3_RESOLUTION)

            existing_cell = await session.execute(select(CrowdCell).where(CrowdCell.h3_cell == h3_cell))
            if existing_cell.scalar_one_or_none() is None:
                session.add(
                    CrowdCell(
                        h3_cell=h3_cell,
                        destination_id=destination.id,
                        observed_at=datetime.now(UTC),
                        density=signals["density"],
                        risk_score=signals["risk_score"],
                        source="seed",
                        model_version="seed-demo-v1",
                        confidence=0.5,
                    )
                )

            existing_score = await session.execute(
                select(SafetyScore).where(SafetyScore.destination_id == destination.id)
            )
            if existing_score.scalar_one_or_none() is None:
                session.add(
                    SafetyScore(
                        destination_id=destination.id,
                        score=signals["safety_score"],
                        computed_at=datetime.now(UTC),
                        model_version="seed-demo-v1",
                    )
                )

        await session.commit()
    # Explicit disposal before the event loop closes — leaving asyncpg
    # connections to be garbage-collected at interpreter shutdown has been
    # observed to segfault the process on Windows (asyncpg 0.31 + Python
    # 3.11's Proactor event loop tearing down connection objects out of
    # order). The seeding itself still completes correctly either way; this
    # just makes exit clean.
    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed())
