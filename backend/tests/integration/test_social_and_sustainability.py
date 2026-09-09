"""Integration tests for two small Feature Blueprint P2 domains that had no
coverage yet:

1. Social Tourism #16 (app/domains/social/router.py) — public destination
   discussion threads, and "Public trip journals" (Trip.is_public, read
   access opened up in app/domains/travel/router.py's `_get_own_trip`).
2. Sustainability — overtourism detection (a plain documented threshold on
   real crowd density, app/domains/tourism/router.py), the carbon-footprint
   heuristic over a real itinerary's real attraction distances
   (app/domains/travel/router.py), and eco-certification (authority-only,
   app/domains/business/router.py).

Same ASGITransport `client` fixture convention as tests/integration/
test_ai_planner.py. No ANTHROPIC_API_KEY needed — none of these paths call
Claude (itinerary items are inserted directly via the DB, same pattern as
tests/integration/test_analytics_accessibility.py's demand-forecast test,
rather than going through the real AI planner).
"""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import get_session_factory
from app.domains.crowd.models import CrowdCell
from app.domains.tourism.models import Attraction, Destination
from app.domains.travel.models import ItemType, Itinerary, ItineraryItem, Trip
from tests.integration.test_sos_and_incidents import _decode_sub


async def _register_and_login(client: AsyncClient, account_type: str = "tourist") -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "account_type": account_type},
    )
    assert register.status_code == 201, register.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


async def _login_admin(client: AsyncClient) -> dict:
    login = await client.post(
        "/api/v1/auth/login", json={"email": "test-admin@example.com", "password": "Test1234!"}
    )
    assert login.status_code == 200, login.text
    return login.json()["data"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _india_gate_id(client: AsyncClient) -> str:
    listing = (await client.get("/api/v1/destinations")).json()
    return next(d for d in listing["data"] if d["name"] == "India Gate")["id"]


async def test_discussion_post_create_and_public_list(client: AsyncClient) -> None:
    author = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    created = await client.post(
        f"/api/v1/social/destinations/{destination_id}/discussions",
        json={"body": "Anyone know the best time to avoid the crowds here?"},
        headers=_auth(author["access_token"]),
    )
    assert created.status_code == 201, created.text
    post = created.json()["data"]
    assert post["author_user_id"] == _decode_sub(author["access_token"])

    # No auth needed to read — public browse, same posture as destinations.
    listing = await client.get(f"/api/v1/social/destinations/{destination_id}/discussions")
    assert listing.status_code == 200, listing.text
    assert any(p["id"] == post["id"] for p in listing.json()["data"])

    missing_destination = await client.post(
        f"/api/v1/social/destinations/{uuid.uuid4()}/discussions",
        json={"body": "Does this destination exist?"},
        headers=_auth(author["access_token"]),
    )
    assert missing_destination.status_code == 404


async def test_public_trip_journal_opt_in_controls_stranger_read_access(
    client: AsyncClient,
) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    owner_headers = _auth(owner["access_token"])

    trip = await client.post(
        "/api/v1/trips", json={"title": "My private diary"}, headers=owner_headers
    )
    trip_id = trip.json()["data"]["id"]

    private_read = await client.get(
        f"/api/v1/trips/{trip_id}", headers=_auth(stranger["access_token"])
    )
    assert private_read.status_code == 403

    not_in_public_listing = await client.get("/api/v1/trips/public")
    assert all(t["id"] != trip_id for t in not_in_public_listing.json()["data"])

    made_public = await client.patch(
        f"/api/v1/trips/{trip_id}", json={"is_public": True}, headers=owner_headers
    )
    assert made_public.status_code == 200, made_public.text
    assert made_public.json()["data"]["is_public"] is True

    now_readable = await client.get(
        f"/api/v1/trips/{trip_id}", headers=_auth(stranger["access_token"])
    )
    assert now_readable.status_code == 200, now_readable.text

    in_public_listing = await client.get("/api/v1/trips/public")
    assert any(t["id"] == trip_id for t in in_public_listing.json()["data"])

    # is_public never grants edit rights — still owner-only.
    stranger_edit = await client.patch(
        f"/api/v1/trips/{trip_id}",
        json={"title": "Hijacked"},
        headers=_auth(stranger["access_token"]),
    )
    assert stranger_edit.status_code == 403


async def test_carbon_footprint_reflects_real_itinerary_distance(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    headers = _auth(owner["access_token"])
    owner_id = _decode_sub(owner["access_token"])

    trip_resp = await client.post(
        "/api/v1/trips", json={"title": "Footprint trip"}, headers=headers
    )
    trip_id = trip_resp.json()["data"]["id"]

    baseline = await client.get(f"/api/v1/trips/{trip_id}/carbon-footprint", headers=headers)
    assert baseline.status_code == 200, baseline.text
    baseline_data = baseline.json()["data"]
    assert baseline_data["stops_counted"] == 0
    assert baseline_data["total_distance_km"] == 0.0
    assert baseline_data["estimated_kg_co2"] == 0.0

    async with get_session_factory()() as session:
        destination = (
            await session.execute(select(Destination).where(Destination.name == "India Gate"))
        ).scalar_one()
        attractions = (
            (
                await session.execute(
                    select(Attraction).where(Attraction.destination_id == destination.id).limit(2)
                )
            )
            .scalars()
            .all()
        )
        assert len(attractions) == 2, (
            "India Gate needs >= 2 seeded attractions for this test to be meaningful"
        )

        trip = await session.get(Trip, uuid.UUID(trip_id))
        assert trip is not None and str(trip.user_id) == owner_id
        itinerary = Itinerary(trip_id=trip.id, version=1, generated_by="USER")
        session.add(itinerary)
        await session.flush()
        for idx, attraction in enumerate(attractions):
            session.add(
                ItineraryItem(
                    itinerary_id=itinerary.id,
                    item_type=ItemType.ATTRACTION,
                    attraction_id=attraction.id,
                    sequence=idx,
                    scheduled_time=datetime.now(UTC),
                )
            )
        await session.commit()

    after = await client.get(f"/api/v1/trips/{trip_id}/carbon-footprint", headers=headers)
    assert after.status_code == 200, after.text
    after_data = after.json()["data"]
    assert after_data["stops_counted"] == 2
    assert after_data["total_distance_km"] > 0
    assert after_data["estimated_kg_co2"] > 0
    assert after_data["method"] == "distance_heuristic_v1"


async def test_overtourism_signal_reflects_real_crowd_density(client: AsyncClient) -> None:
    destination_id = await _india_gate_id(client)

    async with get_session_factory()() as session:
        session.add(
            CrowdCell(
                h3_cell="test_ot_cell",
                destination_id=uuid.UUID(destination_id),
                observed_at=datetime.now(UTC),
                density=0.9,
            )
        )
        await session.commit()

    signal = await client.get(f"/api/v1/destinations/{destination_id}/overtourism")
    assert signal.status_code == 200, signal.text
    data = signal.json()["data"]
    assert data["latest_density"] == 0.9
    assert data["is_overtouristed"] is True
    assert data["threshold"] == 0.75


async def test_eco_certification_is_authority_gated(client: AsyncClient) -> None:
    business_owner = await _register_and_login(client, "business")
    admin = await _login_admin(client)

    business = await client.post(
        "/api/v1/businesses",
        json={"name": f"Green Lodge {uuid.uuid4().hex[:6]}", "category": "HOTEL"},
        headers=_auth(business_owner["access_token"]),
    )
    assert business.status_code == 201, business.text
    business_id = business.json()["data"]["id"]
    assert business.json()["data"]["is_eco_certified"] is False

    forbidden = await client.post(
        f"/api/v1/businesses/{business_id}/eco-certify",
        headers=_auth(business_owner["access_token"]),
    )
    assert forbidden.status_code == 403

    certified = await client.post(
        f"/api/v1/businesses/{business_id}/eco-certify", headers=_auth(admin["access_token"])
    )
    assert certified.status_code == 200, certified.text
    assert certified.json()["data"]["is_eco_certified"] is True

    fetched = await client.get(f"/api/v1/businesses/{business_id}")
    assert fetched.json()["data"]["is_eco_certified"] is True
