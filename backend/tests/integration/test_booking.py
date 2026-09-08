"""Integration tests for the Round 2 booking/ticketing pass — real Postgres,
real OPA server. No Claude calls here (booking/ticketing has no AI
component), so these run fast and don't need ANTHROPIC_API_KEY.
"""

import uuid

from httpx import AsyncClient


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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_business_with_bookable_service(client: AsyncClient, owner: dict, capacity: int = 2) -> dict:
    business = await client.post(
        "/api/v1/businesses",
        json={"name": f"Test Hotel {uuid.uuid4().hex[:6]}", "category": "HOTEL"},
        headers=_auth(owner["access_token"]),
    )
    assert business.status_code == 201, business.text
    business_id = business.json()["data"]["id"]

    service = await client.post(
        f"/api/v1/businesses/{business_id}/services",
        json={"name": "Deluxe Room", "base_price": 2000, "currency": "INR"},
        headers=_auth(owner["access_token"]),
    )
    assert service.status_code == 201, service.text
    service_id = service.json()["data"]["id"]

    slot = await client.post(
        f"/api/v1/services/{service_id}/availability",
        json={"starts_at": "2027-01-10T14:00:00Z", "ends_at": "2027-01-11T11:00:00Z", "capacity": capacity},
        headers=_auth(owner["access_token"]),
    )
    assert slot.status_code == 201, slot.text
    return {"business_id": business_id, "service_id": service_id, "availability_id": slot.json()["data"]["id"]}


async def test_booking_creates_a_ticket_and_enforces_capacity(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    ctx = await _create_business_with_bookable_service(client, owner, capacity=2)

    tourist_a = await _register_and_login(client, "tourist")
    booked_a = await client.post(
        "/api/v1/bookings",
        json={"service_id": ctx["service_id"], "availability_id": ctx["availability_id"], "party_size": 2},
        headers={**_auth(tourist_a["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert booked_a.status_code == 201, booked_a.text
    booking_a = booked_a.json()["data"]
    assert booking_a["status"] == "CONFIRMED"
    assert booking_a["total_amount"] == 4000.0
    assert booking_a["ticket"]["status"] == "ISSUED"
    assert booking_a["ticket"]["qr_token"]

    tourist_b = await _register_and_login(client, "tourist")
    booked_b = await client.post(
        "/api/v1/bookings",
        json={"service_id": ctx["service_id"], "availability_id": ctx["availability_id"], "party_size": 1},
        headers={**_auth(tourist_b["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert booked_b.status_code == 409, booked_b.text
    assert booked_b.json()["error"]["code"] == "SLOT_FULL"


async def test_owner_can_check_in_ticket_but_a_stranger_cannot(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    ctx = await _create_business_with_bookable_service(client, owner)
    tourist = await _register_and_login(client, "tourist")
    other_owner = await _register_and_login(client, "business")

    booked = await client.post(
        "/api/v1/bookings",
        json={"service_id": ctx["service_id"], "availability_id": ctx["availability_id"], "party_size": 1},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    qr_token = booked.json()["data"]["ticket"]["qr_token"]

    forbidden = await client.post(
        "/api/v1/tickets/verify", json={"qr_token": qr_token}, headers=_auth(other_owner["access_token"])
    )
    assert forbidden.status_code == 403

    verified = await client.post(
        "/api/v1/tickets/verify", json={"qr_token": qr_token}, headers=_auth(owner["access_token"])
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["data"]["status"] == "COMPLETED"
    assert verified.json()["data"]["ticket"]["status"] == "CHECKED_IN"

    already_checked_in = await client.post(
        "/api/v1/tickets/verify", json={"qr_token": qr_token}, headers=_auth(owner["access_token"])
    )
    assert already_checked_in.status_code == 409
    assert already_checked_in.json()["error"]["code"] == "TICKET_NOT_VALID"

    bad_token = await client.post(
        "/api/v1/tickets/verify", json={"qr_token": "not-a-real-token"}, headers=_auth(owner["access_token"])
    )
    assert bad_token.status_code == 404


async def test_cancel_booking_restores_capacity(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    ctx = await _create_business_with_bookable_service(client, owner, capacity=1)
    tourist = await _register_and_login(client, "tourist")

    booked = await client.post(
        "/api/v1/bookings",
        json={"service_id": ctx["service_id"], "availability_id": ctx["availability_id"], "party_size": 1},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    booking_id = booked.json()["data"]["id"]

    cancelled = await client.post(f"/api/v1/bookings/{booking_id}/cancel", headers=_auth(tourist["access_token"]))
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["data"]["status"] == "CANCELLED"

    already_cancelled = await client.post(f"/api/v1/bookings/{booking_id}/cancel", headers=_auth(tourist["access_token"]))
    assert already_cancelled.status_code == 409

    # Capacity was restored — a new tourist can now book the same slot.
    other_tourist = await _register_and_login(client, "tourist")
    rebooked = await client.post(
        "/api/v1/bookings",
        json={"service_id": ctx["service_id"], "availability_id": ctx["availability_id"], "party_size": 1},
        headers={**_auth(other_tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert rebooked.status_code == 201, rebooked.text


async def test_list_business_bookings_is_owner_only(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    ctx = await _create_business_with_bookable_service(client, owner)
    tourist = await _register_and_login(client, "tourist")
    stranger_owner = await _register_and_login(client, "business")

    await client.post(
        "/api/v1/bookings",
        json={"service_id": ctx["service_id"], "availability_id": ctx["availability_id"], "party_size": 1},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )

    own_view = await client.get(f"/api/v1/bookings/business/{ctx['business_id']}", headers=_auth(owner["access_token"]))
    assert own_view.status_code == 200
    assert len(own_view.json()["data"]) >= 1

    forbidden = await client.get(
        f"/api/v1/bookings/business/{ctx['business_id']}", headers=_auth(stranger_owner["access_token"])
    )
    assert forbidden.status_code == 403

    my_bookings = await client.get("/api/v1/bookings", headers=_auth(tourist["access_token"]))
    assert my_bookings.status_code == 200
    assert any(b["service_id"] == ctx["service_id"] for b in my_bookings.json()["data"])
