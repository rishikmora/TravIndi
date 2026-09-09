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
from typing import Any

import h3
from sqlalchemy import select, text

from app.db.session import get_engine, get_session_factory
from app.domains.crowd.models import CrowdCell
from app.domains.safety.models import SafetyScore
from app.domains.tourism.models import Attraction, Destination, Facility

# Real photos of each real place, sourced from Wikimedia Commons (via each
# destination's English Wikipedia lead image) and self-hosted under
# `web/public/images/destinations/` — downloaded once and resized rather
# than hotlinked, since upload.wikimedia.org rate-limits/blocks anonymous
# server-side fetches without a descriptive User-Agent (hit live while
# building this). Paths are frontend-served static assets, not backend URLs.
_SEED_DESTINATIONS: list[dict[str, Any]] = [
    {
        "name": "India Gate",
        "city": "New Delhi",
        "state": "Delhi",
        "lon": 77.2295,
        "lat": 28.6129,
        "image_url": "/images/destinations/india-gate.jpg",
    },
    {
        "name": "Gateway of India",
        "city": "Mumbai",
        "state": "Maharashtra",
        "lon": 72.8347,
        "lat": 18.9220,
        "image_url": "/images/destinations/gateway-of-india.jpg",
    },
    {
        "name": "Mysore Palace",
        "city": "Mysuru",
        "state": "Karnataka",
        "lon": 76.6552,
        "lat": 12.3052,
        "image_url": "/images/destinations/mysore-palace.jpg",
    },
    # Added for demo breadth (2026-09-08) — real, well-known heritage sites
    # spanning several states, so destination discovery/AI planner/crowd
    # views have more than 3 entries to browse in a demo.
    {
        "name": "Taj Mahal",
        "city": "Agra",
        "state": "Uttar Pradesh",
        "lon": 78.0421,
        "lat": 27.1751,
        "image_url": "/images/destinations/taj-mahal.jpg",
    },
    {
        "name": "Dashashwamedh Ghat",
        "city": "Varanasi",
        "state": "Uttar Pradesh",
        "lon": 83.0107,
        "lat": 25.3109,
        "image_url": "/images/destinations/dashashwamedh-ghat.jpg",
    },
    {
        "name": "Amber Fort",
        "city": "Jaipur",
        "state": "Rajasthan",
        "lon": 75.8513,
        "lat": 26.9855,
        "image_url": "/images/destinations/amber-fort.jpg",
    },
    {
        "name": "Khajuraho Group of Monuments",
        "city": "Khajuraho",
        "state": "Madhya Pradesh",
        "lon": 79.9199,
        "lat": 24.8318,
        "image_url": "/images/destinations/khajuraho.jpg",
    },
    {
        "name": "Hampi",
        "city": "Hampi",
        "state": "Karnataka",
        "lon": 76.4600,
        "lat": 15.3350,
        "image_url": "/images/destinations/hampi.jpg",
    },
    {
        "name": "Golden Temple",
        "city": "Amritsar",
        "state": "Punjab",
        "lon": 74.8765,
        "lat": 31.6200,
        "image_url": "/images/destinations/golden-temple.jpg",
    },
    {
        "name": "Meenakshi Amman Temple",
        "city": "Madurai",
        "state": "Tamil Nadu",
        "lon": 78.1193,
        "lat": 9.9195,
        "image_url": "/images/destinations/meenakshi-temple.jpg",
    },
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
    "Taj Mahal": [
        {"name": "Agra Fort", "category": "heritage", "lon": 78.0081, "lat": 27.1795},
        {"name": "Mehtab Bagh", "category": "garden", "lon": 78.0421, "lat": 27.1783},
    ],
    "Dashashwamedh Ghat": [
        {"name": "Kashi Vishwanath Temple", "category": "temple", "lon": 83.0104, "lat": 25.3109},
        {"name": "Sarnath", "category": "heritage", "lon": 83.0224, "lat": 25.3811},
    ],
    "Amber Fort": [
        {"name": "Jaigarh Fort", "category": "heritage", "lon": 75.8484, "lat": 26.9852},
        {"name": "Jal Mahal", "category": "landmark", "lon": 75.8461, "lat": 26.9530},
    ],
    "Khajuraho Group of Monuments": [
        {"name": "Western Group of Temples", "category": "temple", "lon": 79.9199, "lat": 24.8318},
        {"name": "Raneh Falls", "category": "natural", "lon": 79.9666, "lat": 24.8935},
    ],
    "Hampi": [
        {"name": "Virupaksha Temple", "category": "temple", "lon": 76.4600, "lat": 15.3350},
        {"name": "Vittala Temple", "category": "heritage", "lon": 76.4747, "lat": 15.3406},
    ],
    "Golden Temple": [
        {"name": "Jallianwala Bagh", "category": "memorial", "lon": 74.8800, "lat": 31.6199},
        {"name": "Wagah Border", "category": "landmark", "lon": 74.5744, "lat": 31.6045},
    ],
    "Meenakshi Amman Temple": [
        {"name": "Thirumalai Nayakkar Palace", "category": "heritage", "lon": 78.1258, "lat": 9.9159},
        {"name": "Gandhi Memorial Museum", "category": "museum", "lon": 78.1339, "lat": 9.9252},
    ],
}

# One accessibility facility pair per destination (Round 3's accessibility
# feature had no seed data yet — real facility_type values, plausible
# locations near the destination point; no fabricated capacity/hours claims).
_SEED_FACILITIES = {
    "India Gate": [("India Gate Accessible Ramp", "wheelchair_ramp"), ("India Gate First Aid Post", "first_aid_post")],
    "Gateway of India": [("Gateway Accessible Toilet", "accessible_toilet"), ("Gateway First Aid Post", "first_aid_post")],
    "Mysore Palace": [("Palace Wheelchair Ramp", "wheelchair_ramp"), ("Palace Accessible Toilet", "accessible_toilet")],
    "Taj Mahal": [("Taj Mahal Wheelchair Ramp", "wheelchair_ramp"), ("Taj Mahal Accessible Toilet", "accessible_toilet")],
    "Dashashwamedh Ghat": [("Ghat First Aid Post", "first_aid_post"), ("Ghat Wheelchair Rental", "wheelchair_rental")],
    "Amber Fort": [("Amber Fort Elevator", "elevator"), ("Amber Fort Accessible Toilet", "accessible_toilet")],
    "Khajuraho Group of Monuments": [
        ("Khajuraho Wheelchair Ramp", "wheelchair_ramp"),
        ("Khajuraho Accessible Toilet", "accessible_toilet"),
    ],
    "Hampi": [("Hampi First Aid Post", "first_aid_post"), ("Hampi Wheelchair Rental", "wheelchair_rental")],
    "Golden Temple": [("Golden Temple Wheelchair Ramp", "wheelchair_ramp"), ("Golden Temple First Aid Post", "first_aid_post")],
    "Meenakshi Amman Temple": [
        ("Meenakshi Temple Accessible Toilet", "accessible_toilet"),
        ("Meenakshi Temple Wheelchair Ramp", "wheelchair_ramp"),
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
    "Taj Mahal": {"density": 0.85, "risk_score": 0.40, "safety_score": 0.90},
    "Dashashwamedh Ghat": {"density": 0.90, "risk_score": 0.70, "safety_score": 0.55},
    "Amber Fort": {"density": 0.55, "risk_score": 0.35, "safety_score": 0.82},
    "Khajuraho Group of Monuments": {"density": 0.25, "risk_score": 0.15, "safety_score": 0.92},
    "Hampi": {"density": 0.40, "risk_score": 0.30, "safety_score": 0.85},
    "Golden Temple": {"density": 0.75, "risk_score": 0.25, "safety_score": 0.93},
    "Meenakshi Amman Temple": {"density": 0.60, "risk_score": 0.35, "safety_score": 0.80},
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
                    image_url=row.get("image_url"),
                )
                session.add(destination)
                await session.flush()
            elif destination.image_url != row.get("image_url"):
                destination.image_url = row.get("image_url")
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

        destination_coords = {row["name"]: (row["lon"], row["lat"]) for row in _SEED_DESTINATIONS}
        for destination_name, facilities in _SEED_FACILITIES.items():
            destination = destinations_by_name[destination_name]
            lon, lat = destination_coords[destination_name]
            for facility_name, facility_type in facilities:
                existing = await session.execute(
                    select(Facility).where(
                        Facility.destination_id == destination.id, Facility.name == facility_name
                    )
                )
                if existing.scalar_one_or_none() is not None:
                    continue
                session.add(
                    Facility(
                        destination_id=destination.id,
                        name=facility_name,
                        facility_type=facility_type,
                        location=f"SRID=4326;POINT({lon} {lat})",
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
