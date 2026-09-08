"""Integration tests for the Round 3 pass — accessibility facilities/
preferences, the predictive-tourism demand-forecast heuristic, and tourism
operations analytics. Real Postgres, real OPA server (via the `client`
fixture's real routes); no Claude calls, so these run fast.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import get_session_factory
from app.domains.tourism.models import Attraction, Destination
from app.domains.travel.models import ItemType, Itinerary, ItineraryItem, Trip
from tests.integration.test_sos_and_incidents import _decode_sub


async def _register_and_login(client: AsyncClient, account_type: str = "tourist") -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"
    register = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password, "account_type": account_type}
    )
    assert register.status_code == 201, register.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


async def _login_admin(client: AsyncClient) -> dict:
    login = await client.post("/api/v1/auth/login", json={"email": "test-admin@example.com", "password": "Test1234!"})
    assert login.status_code == 200, login.text
    return login.json()["data"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _india_gate_id(client: AsyncClient) -> str:
    listing = (await client.get("/api/v1/destinations")).json()
    return next(d for d in listing["data"] if d["name"] == "India Gate")["id"]


async def test_only_tourism_authority_can_create_a_facility(client: AsyncClient) -> None:
    destination_id = await _india_gate_id(client)
    tourist = await _register_and_login(client)
    admin = await _login_admin(client)

    forbidden = await client.post(
        f"/api/v1/destinations/{destination_id}/facilities",
        json={"name": "Test Elevator", "facility_type": "ELEVATOR", "lon": 77.2295, "lat": 28.6129},
        headers=_auth(tourist["access_token"]),
    )
    assert forbidden.status_code == 403

    created = await client.post(
        f"/api/v1/destinations/{destination_id}/facilities",
        json={"name": "Test Elevator", "facility_type": "ELEVATOR", "lon": 77.2295, "lat": 28.6129},
        headers=_auth(admin["access_token"]),
    )
    assert created.status_code == 201, created.text
    assert created.json()["data"]["facility_type"] == "ELEVATOR"

    listing = await client.get(f"/api/v1/destinations/{destination_id}/facilities")
    assert listing.status_code == 200
    assert any(f["name"] == "Test Elevator" for f in listing.json()["data"])

    filtered = await client.get(
        f"/api/v1/destinations/{destination_id}/facilities", params={"facility_type": "ACCESSIBLE_TOILET"}
    )
    assert filtered.status_code == 200
    assert all(f["facility_type"] == "ACCESSIBLE_TOILET" for f in filtered.json()["data"])


async def test_accessibility_preferences_round_trip(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)

    default = await client.get("/api/v1/users/me/accessibility-preferences", headers=_auth(tourist["access_token"]))
    assert default.status_code == 200, default.text
    assert default.json()["data"] == {"high_contrast": False, "large_text": False, "reduce_motion": False}

    updated = await client.put(
        "/api/v1/users/me/accessibility-preferences",
        json={"high_contrast": True, "large_text": True, "reduce_motion": False},
        headers=_auth(tourist["access_token"]),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["high_contrast"] is True

    fetched_again = await client.get(
        "/api/v1/users/me/accessibility-preferences", headers=_auth(tourist["access_token"])
    )
    assert fetched_again.json()["data"] == {"high_contrast": True, "large_text": True, "reduce_motion": False}


async def test_demand_forecast_reflects_real_planned_visits(client: AsyncClient) -> None:
    destination_id = await _india_gate_id(client)
    tourist = await _register_and_login(client)
    user_id = _decode_sub(tourist["access_token"])

    baseline = await client.get(f"/api/v1/destinations/{destination_id}/demand-forecast")
    assert baseline.status_code == 200, baseline.text
    baseline_data = baseline.json()["data"]
    assert baseline_data["method"] == "heuristic_v1"

    async with get_session_factory()() as session:
        destination = (
            await session.execute(select(Destination).where(Destination.id == destination_id))
        ).scalar_one()
        attraction = (
            await session.execute(select(Attraction).where(Attraction.destination_id == destination.id))
        ).scalars().first()
        trip = Trip(user_id=uuid.UUID(user_id), title="Analytics test trip")
        session.add(trip)
        await session.flush()
        itinerary = Itinerary(trip_id=trip.id, version=1, generated_by="USER")
        session.add(itinerary)
        await session.flush()
        session.add(
            ItineraryItem(
                itinerary_id=itinerary.id,
                item_type=ItemType.ATTRACTION,
                attraction_id=attraction.id,
                sequence=0,
                scheduled_time=datetime.now(UTC) + timedelta(days=5),
            )
        )
        await session.commit()

    after = await client.get(f"/api/v1/destinations/{destination_id}/demand-forecast")
    assert after.status_code == 200, after.text
    after_data = after.json()["data"]
    assert after_data["planned_visits_next_30_days"] == baseline_data["planned_visits_next_30_days"] + 1
    assert after_data["recent_planning_momentum_7_days"] == baseline_data["recent_planning_momentum_7_days"] + 1


async def test_analytics_overview_and_trending_gated_to_tourism_authority(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    admin = await _login_admin(client)

    forbidden = await client.get("/api/v1/analytics/overview", headers=_auth(tourist["access_token"]))
    assert forbidden.status_code == 403

    overview = await client.get("/api/v1/analytics/overview", headers=_auth(admin["access_token"]))
    assert overview.status_code == 200, overview.text
    data = overview.json()["data"]
    assert data["total_destinations"] >= 3
    assert data["total_businesses"] >= 0

    trending_forbidden = await client.get(
        "/api/v1/analytics/trending-destinations", headers=_auth(tourist["access_token"])
    )
    assert trending_forbidden.status_code == 403

    trending = await client.get("/api/v1/analytics/trending-destinations", headers=_auth(admin["access_token"]))
    assert trending.status_code == 200, trending.text
    assert isinstance(trending.json()["data"], list)
