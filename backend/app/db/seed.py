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
    # Added for demo breadth (2026-09-10) — 50 more real, well-known Indian
    # destinations spanning every major region, so discovery/AI planner/map
    # views have real geographic diversity beyond the original 10. `image_url`
    # is each place's own real English Wikipedia lead image (same sourcing
    # method as the original 10 — see the module docstring above), downloaded
    # and self-hosted under `web/public/images/destinations/`, not hotlinked.
    # Two titles needed a more specific real Wikipedia article to resolve to
    # the right photo rather than a disambiguation page: Ellora Caves uses
    # "Kailasa Temple, Ellora" (the caves' own lead image was unset) and
    # several others use the disambiguated "<Place>, <State/City>" title
    # (e.g. "City Palace, Jaipur") to avoid a same-named article elsewhere.
    # Unlike the original 10, no attractions/facilities/crowd/safety-score
    # rows are seeded for these (that data has to be independently real per
    # place, same "curator adds it for real, not invented here" posture as
    # the rest of this file) — `seed()` below explicitly tolerates that.
    {"name": "Red Fort", "city": "Delhi", "state": "Delhi", "lon": 77.2410, "lat": 28.6562, "image_url": "/images/destinations/red-fort.jpg"},
    {"name": "Qutub Minar", "city": "Delhi", "state": "Delhi", "lon": 77.1855, "lat": 28.5245, "image_url": "/images/destinations/qutub-minar.jpg"},
    {"name": "Humayun's Tomb", "city": "Delhi", "state": "Delhi", "lon": 77.2507, "lat": 28.5933, "image_url": "/images/destinations/humayuns-tomb.jpg"},
    {"name": "City Palace Jaipur", "city": "Jaipur", "state": "Rajasthan", "lon": 75.8237, "lat": 26.9258, "image_url": "/images/destinations/city-palace-jaipur.jpg"},
    {"name": "Hawa Mahal", "city": "Jaipur", "state": "Rajasthan", "lon": 75.8267, "lat": 26.9239, "image_url": "/images/destinations/hawa-mahal.jpg"},
    {"name": "Jaisalmer Fort", "city": "Jaisalmer", "state": "Rajasthan", "lon": 70.9127, "lat": 26.9124, "image_url": "/images/destinations/jaisalmer-fort.jpg"},
    {"name": "Udaipur City Palace", "city": "Udaipur", "state": "Rajasthan", "lon": 73.6835, "lat": 24.5764, "image_url": "/images/destinations/udaipur-city-palace.jpg"},
    {"name": "Mehrangarh Fort", "city": "Jodhpur", "state": "Rajasthan", "lon": 73.0182, "lat": 26.2979, "image_url": "/images/destinations/mehrangarh-fort.jpg"},
    {"name": "Ranthambore National Park", "city": "Sawai Madhopur", "state": "Rajasthan", "lon": 76.5026, "lat": 26.0173, "image_url": "/images/destinations/ranthambore-national-park.jpg"},
    {"name": "Ajanta Caves", "city": "Aurangabad", "state": "Maharashtra", "lon": 75.7033, "lat": 20.5519, "image_url": "/images/destinations/ajanta-caves.jpg"},
    {"name": "Ellora Caves", "city": "Aurangabad", "state": "Maharashtra", "lon": 75.1780, "lat": 20.0258, "image_url": "/images/destinations/ellora-caves.jpg"},
    {"name": "Lonavala", "city": "Lonavala", "state": "Maharashtra", "lon": 73.4062, "lat": 18.7546, "image_url": "/images/destinations/lonavala.jpg"},
    {"name": "Shirdi", "city": "Shirdi", "state": "Maharashtra", "lon": 74.4769, "lat": 19.7645, "image_url": "/images/destinations/shirdi.jpg"},
    {"name": "Calangute Beach", "city": "Bardez", "state": "Goa", "lon": 73.7553, "lat": 15.5439, "image_url": "/images/destinations/calangute-beach.jpg"},
    {"name": "Basilica of Bom Jesus", "city": "Old Goa", "state": "Goa", "lon": 73.9114, "lat": 15.5009, "image_url": "/images/destinations/basilica-of-bom-jesus.jpg"},
    {"name": "Alleppey Backwaters", "city": "Alappuzha", "state": "Kerala", "lon": 76.3388, "lat": 9.4981, "image_url": "/images/destinations/alleppey-backwaters.jpg"},
    {"name": "Munnar", "city": "Munnar", "state": "Kerala", "lon": 77.0595, "lat": 10.0889, "image_url": "/images/destinations/munnar.jpg"},
    {"name": "Wayanad", "city": "Wayanad", "state": "Kerala", "lon": 76.1320, "lat": 11.6854, "image_url": "/images/destinations/wayanad.jpg"},
    {"name": "Kovalam Beach", "city": "Thiruvananthapuram", "state": "Kerala", "lon": 76.9787, "lat": 8.4004, "image_url": "/images/destinations/kovalam-beach.jpg"},
    {"name": "Ooty", "city": "Ooty", "state": "Tamil Nadu", "lon": 76.6950, "lat": 11.4102, "image_url": "/images/destinations/ooty.jpg"},
    {"name": "Kodaikanal", "city": "Kodaikanal", "state": "Tamil Nadu", "lon": 77.4892, "lat": 10.2381, "image_url": "/images/destinations/kodaikanal.jpg"},
    {"name": "Mahabalipuram", "city": "Mahabalipuram", "state": "Tamil Nadu", "lon": 80.1927, "lat": 12.6269, "image_url": "/images/destinations/mahabalipuram.jpg"},
    {"name": "Brihadeeswarar Temple", "city": "Thanjavur", "state": "Tamil Nadu", "lon": 79.1318, "lat": 10.7828, "image_url": "/images/destinations/brihadeeswarar-temple.jpg"},
    {"name": "Rameswaram", "city": "Rameswaram", "state": "Tamil Nadu", "lon": 79.3129, "lat": 9.2876, "image_url": "/images/destinations/rameswaram.jpg"},
    {"name": "Coorg", "city": "Madikeri", "state": "Karnataka", "lon": 75.7382, "lat": 12.4244, "image_url": "/images/destinations/coorg.jpg"},
    {"name": "Belur Halebidu", "city": "Hassan", "state": "Karnataka", "lon": 75.8574, "lat": 13.1631, "image_url": "/images/destinations/belur-halebidu.jpg"},
    {"name": "Bandipur National Park", "city": "Chamarajanagar", "state": "Karnataka", "lon": 76.6344, "lat": 11.6592, "image_url": "/images/destinations/bandipur-national-park.jpg"},
    {"name": "Charminar", "city": "Hyderabad", "state": "Telangana", "lon": 78.4747, "lat": 17.3616, "image_url": "/images/destinations/charminar.jpg"},
    {"name": "Golconda Fort", "city": "Hyderabad", "state": "Telangana", "lon": 78.4011, "lat": 17.3833, "image_url": "/images/destinations/golconda-fort.jpg"},
    {"name": "Konark Sun Temple", "city": "Konark", "state": "Odisha", "lon": 86.0945, "lat": 19.8876, "image_url": "/images/destinations/konark-sun-temple.jpg"},
    {"name": "Puri Jagannath Temple", "city": "Puri", "state": "Odisha", "lon": 85.8181, "lat": 19.8048, "image_url": "/images/destinations/puri-jagannath-temple.jpg"},
    {"name": "Chilika Lake", "city": "Puri", "state": "Odisha", "lon": 85.3206, "lat": 19.7160, "image_url": "/images/destinations/chilika-lake.jpg"},
    {"name": "Sundarbans National Park", "city": "South 24 Parganas", "state": "West Bengal", "lon": 88.8965, "lat": 21.9497, "image_url": "/images/destinations/sundarbans-national-park.jpg"},
    {"name": "Darjeeling", "city": "Darjeeling", "state": "West Bengal", "lon": 88.2663, "lat": 27.0410, "image_url": "/images/destinations/darjeeling.jpg"},
    {"name": "Victoria Memorial", "city": "Kolkata", "state": "West Bengal", "lon": 88.3426, "lat": 22.5448, "image_url": "/images/destinations/victoria-memorial.jpg"},
    {"name": "Kaziranga National Park", "city": "Golaghat", "state": "Assam", "lon": 93.1714, "lat": 26.5775, "image_url": "/images/destinations/kaziranga-national-park.jpg"},
    {"name": "Shillong", "city": "Shillong", "state": "Meghalaya", "lon": 91.8933, "lat": 25.5788, "image_url": "/images/destinations/shillong.jpg"},
    {"name": "Gangtok", "city": "Gangtok", "state": "Sikkim", "lon": 88.6065, "lat": 27.3389, "image_url": "/images/destinations/gangtok.jpg"},
    {"name": "Rishikesh", "city": "Rishikesh", "state": "Uttarakhand", "lon": 78.2676, "lat": 30.0869, "image_url": "/images/destinations/rishikesh.jpg"},
    {"name": "Haridwar", "city": "Haridwar", "state": "Uttarakhand", "lon": 78.1642, "lat": 29.9457, "image_url": "/images/destinations/haridwar.jpg"},
    {"name": "Nainital", "city": "Nainital", "state": "Uttarakhand", "lon": 79.4542, "lat": 29.3919, "image_url": "/images/destinations/nainital.jpg"},
    {"name": "Valley of Flowers", "city": "Chamoli", "state": "Uttarakhand", "lon": 79.6045, "lat": 30.7268, "image_url": "/images/destinations/valley-of-flowers.jpg"},
    {"name": "Shimla", "city": "Shimla", "state": "Himachal Pradesh", "lon": 77.1734, "lat": 31.1048, "image_url": "/images/destinations/shimla.jpg"},
    {"name": "Manali", "city": "Manali", "state": "Himachal Pradesh", "lon": 77.1892, "lat": 32.2432, "image_url": "/images/destinations/manali.jpg"},
    {"name": "Dharamshala", "city": "Dharamshala", "state": "Himachal Pradesh", "lon": 76.3234, "lat": 32.2190, "image_url": "/images/destinations/dharamshala.jpg"},
    {"name": "Leh", "city": "Leh", "state": "Ladakh", "lon": 77.5771, "lat": 34.1526, "image_url": "/images/destinations/leh.jpg"},
    {"name": "Vaishno Devi", "city": "Katra", "state": "Jammu and Kashmir", "lon": 74.9500, "lat": 33.0303, "image_url": "/images/destinations/vaishno-devi.jpg"},
    {"name": "Dal Lake", "city": "Srinagar", "state": "Jammu and Kashmir", "lon": 74.8626, "lat": 34.1210, "image_url": "/images/destinations/dal-lake.jpg"},
    {"name": "Statue of Unity", "city": "Kevadia", "state": "Gujarat", "lon": 73.7191, "lat": 21.8380, "image_url": "/images/destinations/statue-of-unity.jpg"},
    {"name": "Somnath Temple", "city": "Veraval", "state": "Gujarat", "lon": 70.4013, "lat": 20.8880, "image_url": "/images/destinations/somnath-temple.jpg"},
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
    # Added 2026-09-11 — same illustrative-signal treatment as the original
    # 10 above, extended to the other 50 destinations added later (2026-09-08's
    # "destinations expansion") once left deliberately empty. Values are
    # place-appropriate estimates (pilgrimage/market sites skew higher
    # density and lower safety than a remote hill station or nature
    # reserve), not computed from any formula — same honesty bar as the
    # original 10, never reported as real telemetry.
    "Red Fort": {"density": 0.75, "risk_score": 0.45, "safety_score": 0.75},
    "Qutub Minar": {"density": 0.55, "risk_score": 0.30, "safety_score": 0.85},
    "Humayun's Tomb": {"density": 0.45, "risk_score": 0.25, "safety_score": 0.88},
    "City Palace Jaipur": {"density": 0.65, "risk_score": 0.35, "safety_score": 0.80},
    "Hawa Mahal": {"density": 0.70, "risk_score": 0.40, "safety_score": 0.78},
    "Jaisalmer Fort": {"density": 0.45, "risk_score": 0.30, "safety_score": 0.82},
    "Udaipur City Palace": {"density": 0.55, "risk_score": 0.30, "safety_score": 0.85},
    "Mehrangarh Fort": {"density": 0.50, "risk_score": 0.30, "safety_score": 0.85},
    "Ranthambore National Park": {"density": 0.35, "risk_score": 0.40, "safety_score": 0.75},
    "Ajanta Caves": {"density": 0.40, "risk_score": 0.20, "safety_score": 0.88},
    "Ellora Caves": {"density": 0.40, "risk_score": 0.20, "safety_score": 0.88},
    "Lonavala": {"density": 0.60, "risk_score": 0.35, "safety_score": 0.78},
    "Shirdi": {"density": 0.80, "risk_score": 0.35, "safety_score": 0.80},
    "Calangute Beach": {"density": 0.75, "risk_score": 0.45, "safety_score": 0.70},
    "Basilica of Bom Jesus": {"density": 0.45, "risk_score": 0.20, "safety_score": 0.88},
    "Alleppey Backwaters": {"density": 0.55, "risk_score": 0.25, "safety_score": 0.85},
    "Munnar": {"density": 0.50, "risk_score": 0.25, "safety_score": 0.87},
    "Wayanad": {"density": 0.35, "risk_score": 0.30, "safety_score": 0.85},
    "Kovalam Beach": {"density": 0.55, "risk_score": 0.35, "safety_score": 0.80},
    "Ooty": {"density": 0.65, "risk_score": 0.30, "safety_score": 0.83},
    "Kodaikanal": {"density": 0.55, "risk_score": 0.30, "safety_score": 0.85},
    "Mahabalipuram": {"density": 0.55, "risk_score": 0.25, "safety_score": 0.85},
    "Brihadeeswarar Temple": {"density": 0.50, "risk_score": 0.20, "safety_score": 0.88},
    "Rameswaram": {"density": 0.60, "risk_score": 0.30, "safety_score": 0.80},
    "Coorg": {"density": 0.45, "risk_score": 0.25, "safety_score": 0.87},
    "Belur Halebidu": {"density": 0.30, "risk_score": 0.15, "safety_score": 0.90},
    "Bandipur National Park": {"density": 0.30, "risk_score": 0.40, "safety_score": 0.78},
    "Charminar": {"density": 0.75, "risk_score": 0.45, "safety_score": 0.72},
    "Golconda Fort": {"density": 0.45, "risk_score": 0.25, "safety_score": 0.85},
    "Konark Sun Temple": {"density": 0.45, "risk_score": 0.20, "safety_score": 0.87},
    "Puri Jagannath Temple": {"density": 0.85, "risk_score": 0.45, "safety_score": 0.72},
    "Chilika Lake": {"density": 0.30, "risk_score": 0.25, "safety_score": 0.85},
    "Sundarbans National Park": {"density": 0.25, "risk_score": 0.50, "safety_score": 0.70},
    "Darjeeling": {"density": 0.55, "risk_score": 0.30, "safety_score": 0.83},
    "Victoria Memorial": {"density": 0.55, "risk_score": 0.20, "safety_score": 0.88},
    "Kaziranga National Park": {"density": 0.30, "risk_score": 0.40, "safety_score": 0.78},
    "Shillong": {"density": 0.40, "risk_score": 0.25, "safety_score": 0.85},
    "Gangtok": {"density": 0.40, "risk_score": 0.30, "safety_score": 0.83},
    "Rishikesh": {"density": 0.60, "risk_score": 0.35, "safety_score": 0.80},
    "Haridwar": {"density": 0.75, "risk_score": 0.40, "safety_score": 0.75},
    "Nainital": {"density": 0.55, "risk_score": 0.30, "safety_score": 0.83},
    "Valley of Flowers": {"density": 0.15, "risk_score": 0.35, "safety_score": 0.80},
    "Shimla": {"density": 0.65, "risk_score": 0.30, "safety_score": 0.82},
    "Manali": {"density": 0.65, "risk_score": 0.35, "safety_score": 0.80},
    "Dharamshala": {"density": 0.40, "risk_score": 0.25, "safety_score": 0.85},
    "Leh": {"density": 0.35, "risk_score": 0.35, "safety_score": 0.80},
    "Vaishno Devi": {"density": 0.85, "risk_score": 0.45, "safety_score": 0.75},
    "Dal Lake": {"density": 0.55, "risk_score": 0.30, "safety_score": 0.78},
    "Statue of Unity": {"density": 0.55, "risk_score": 0.25, "safety_score": 0.87},
    "Somnath Temple": {"density": 0.60, "risk_score": 0.30, "safety_score": 0.82},
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
            signals = _SEED_CROWD_SAFETY.get(row["name"])
            if signals is None:
                # Every seeded destination has an entry above as of
                # 2026-09-11; this stays as a guard rather than an
                # assertion so a genuinely new destination added later
                # without one falls back to the honest "no signal yet"
                # posture instead of crashing the seed script.
                continue
            destination = destinations_by_name[row["name"]]
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
