"""Flight/train/bus booking — real extension of the existing business
`Service`/`Availability` + `booking` `Booking`/`Ticket` machinery (see
`app/domains/business/models.py`'s `TRANSPORT_CATEGORIES` docstring for why
no new schema was needed). These tests create their own fresh business/
service/availability rows through the real API rather than depending on
`app/db/seed_demo.py`'s demo operators, so they pass on a freshly-seeded
database too.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from tests.integration.test_trust_and_business import _register_and_login


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _real_destination_ids(client: AsyncClient) -> tuple[str, str]:
    listing = (await client.get("/api/v1/destinations?limit=10")).json()["data"]
    assert len(listing) >= 2, "seed data must include at least 2 destinations"
    return listing[0]["id"], listing[1]["id"]


async def _create_transport_route(
    client: AsyncClient, *, category: str, origin_id: str, destination_id: str
) -> dict:
    owner = await _register_and_login(client, account_type="business")
    headers = _auth(owner["access_token"])

    business = (
        await client.post(
            "/api/v1/businesses",
            json={"name": f"Test {category} {uuid.uuid4().hex[:6]}", "category": category},
            headers=headers,
        )
    ).json()["data"]

    service = (
        await client.post(
            f"/api/v1/businesses/{business['id']}/services",
            json={
                "name": "Test Route",
                "base_price": 500.0,
                "origin_destination_id": origin_id,
                "destination_destination_id": destination_id,
            },
            headers=headers,
        )
    ).json()["data"]

    starts_at = datetime.now(UTC) + timedelta(days=1)
    availability = (
        await client.post(
            f"/api/v1/services/{service['id']}/availability",
            json={
                "starts_at": starts_at.isoformat(),
                "ends_at": (starts_at + timedelta(hours=2)).isoformat(),
                "capacity": 5,
            },
            headers=headers,
        )
    ).json()["data"]

    return {"owner": owner, "business": business, "service": service, "availability": availability}


async def test_transport_search_rejects_non_transport_category(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    response = await client.get(
        "/api/v1/services/search", params={"category": "HOTEL"}, headers=_auth(tourist["access_token"])
    )
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "INVALID_CATEGORY"


async def test_transport_search_finds_a_real_seeded_route_and_names_are_denormalized(client: AsyncClient) -> None:
    origin_id, destination_id = await _real_destination_ids(client)
    route = await _create_transport_route(client, category="RAILWAY", origin_id=origin_id, destination_id=destination_id)

    response = await client.get(
        "/api/v1/services/search",
        params={"category": "RAILWAY", "origin_destination_id": origin_id, "destination_destination_id": destination_id},
    )
    assert response.status_code == 200, response.text
    results = response.json()["data"]
    match = next(r for r in results if r["service_id"] == route["service"]["id"])
    assert match["availability_id"] == route["availability"]["id"]
    assert match["business_name"] == route["business"]["name"]
    assert match["capacity"] == 5
    assert match["remaining"] == 5
    assert match["origin_destination_id"] == origin_id
    assert match["destination_destination_id"] == destination_id
    assert match["origin_name"] is not None
    assert match["destination_name"] is not None


async def test_transport_search_only_returns_the_requested_category(client: AsyncClient) -> None:
    origin_id, destination_id = await _real_destination_ids(client)
    railway_route = await _create_transport_route(
        client, category="RAILWAY", origin_id=origin_id, destination_id=destination_id
    )
    await _create_transport_route(client, category="BUS_OPERATOR", origin_id=origin_id, destination_id=destination_id)

    response = await client.get(
        "/api/v1/services/search",
        params={"category": "BUS_OPERATOR", "origin_destination_id": origin_id, "destination_destination_id": destination_id},
    )
    ids = {r["service_id"] for r in response.json()["data"]}
    assert railway_route["service"]["id"] not in ids


async def test_transport_search_excludes_past_departures(client: AsyncClient) -> None:
    origin_id, destination_id = await _real_destination_ids(client)
    route = await _create_transport_route(client, category="AIRLINE", origin_id=origin_id, destination_id=destination_id)
    owner_headers = _auth(route["owner"]["access_token"])

    past_start = datetime.now(UTC) - timedelta(days=1)
    past_slot = (
        await client.post(
            f"/api/v1/services/{route['service']['id']}/availability",
            json={"starts_at": past_start.isoformat(), "ends_at": (past_start + timedelta(hours=2)).isoformat(), "capacity": 5},
            headers=owner_headers,
        )
    ).json()["data"]

    response = await client.get(
        "/api/v1/services/search",
        params={"category": "AIRLINE", "origin_destination_id": origin_id, "destination_destination_id": destination_id},
    )
    availability_ids = {r["availability_id"] for r in response.json()["data"]}
    assert past_slot["id"] not in availability_ids
    assert route["availability"]["id"] in availability_ids


async def test_booking_a_transport_slot_via_search_result_issues_a_real_ticket(client: AsyncClient) -> None:
    origin_id, destination_id = await _real_destination_ids(client)
    route = await _create_transport_route(client, category="BUS_OPERATOR", origin_id=origin_id, destination_id=destination_id)
    tourist = await _register_and_login(client)

    response = await client.post(
        "/api/v1/bookings",
        json={"service_id": route["service"]["id"], "availability_id": route["availability"]["id"], "party_size": 2},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 201, response.text
    booking = response.json()["data"]
    assert booking["party_size"] == 2
    assert booking["total_amount"] == 1000.0
    assert booking["status"] == "CONFIRMED"
    assert booking["ticket"]["status"] == "ISSUED"
    assert booking["ticket"]["qr_token"]

    # The search result's `remaining` must reflect the real booked_count.
    search_after = await client.get(
        "/api/v1/services/search",
        params={"category": "BUS_OPERATOR", "origin_destination_id": origin_id, "destination_destination_id": destination_id},
    )
    match = next(
        r for r in search_after.json()["data"] if r["availability_id"] == route["availability"]["id"]
    )
    assert match["booked_count"] == 2
    assert match["remaining"] == 3
