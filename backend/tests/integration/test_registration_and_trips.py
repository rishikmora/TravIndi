"""Phase 10 integration tests — real registration (Keycloak Admin API +
local DB provisioning), /users/me, consents, and trip CRUD. Requires
`docker compose --profile full up -d` from infra/. `client` fixture: see
tests/conftest.py — this suite is exactly why it uses ASGITransport instead
of Starlette's TestClient: /auth/register makes several chained outbound
calls to Keycloak, which reliably deadlocked TestClient's portal thread.
"""

import uuid

from httpx import AsyncClient


async def _register_and_login(client: AsyncClient) -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"

    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "account_type": "tourist"},
    )
    assert register.status_code == 201, register.text

    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


async def test_register_then_login_then_get_me_round_trips_real_data(client: AsyncClient) -> None:
    session = await _register_and_login(client)

    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {session['access_token']}"})
    assert me.status_code == 200
    data = me.json()["data"]
    assert data["email"] == session["email"]
    assert data["account_type"] == "tourist"
    assert data["status"] == "ACTIVE"


async def test_registering_the_same_email_twice_is_rejected(client: AsyncClient) -> None:
    session = await _register_and_login(client)

    duplicate = await client.post(
        "/api/v1/auth/register",
        json={"email": session["email"], "password": "Test1234!", "account_type": "tourist"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "USER_ALREADY_EXISTS"


async def test_grant_list_and_revoke_consent(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    granted = await client.post(
        "/api/v1/users/me/consents", json={"purpose": "location_sharing", "version": "1.0"}, headers=headers
    )
    assert granted.status_code == 201
    consent_id = granted.json()["data"]["id"]
    assert granted.json()["data"]["status"] == "GRANTED"

    listed = await client.get("/api/v1/users/me/consents", headers=headers)
    assert any(c["id"] == consent_id for c in listed.json()["data"])

    revoked = await client.delete(f"/api/v1/users/me/consents/{consent_id}", headers=headers)
    assert revoked.status_code == 204

    listed_after = (await client.get("/api/v1/users/me/consents", headers=headers)).json()["data"]
    revoked_entry = next(c for c in listed_after if c["id"] == consent_id)
    assert revoked_entry["status"] == "REVOKED"
    assert revoked_entry["revoked_at"] is not None


async def test_trip_crud_lifecycle(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    created = await client.post("/api/v1/trips", json={"title": "Delhi weekend", "currency": "INR"}, headers=headers)
    assert created.status_code == 201
    trip = created.json()["data"]
    assert trip["title"] == "Delhi weekend"
    assert trip["status"] == "DRAFT"

    listed = (await client.get("/api/v1/trips", headers=headers)).json()["data"]
    assert any(t["id"] == trip["id"] for t in listed)

    fetched = await client.get(f"/api/v1/trips/{trip['id']}", headers=headers)
    assert fetched.status_code == 200

    updated = await client.patch(
        f"/api/v1/trips/{trip['id']}", json={"title": "Delhi long weekend"}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["title"] == "Delhi long weekend"

    cancelled = await client.delete(f"/api/v1/trips/{trip['id']}", headers=headers)
    assert cancelled.status_code == 204
    final = await client.get(f"/api/v1/trips/{trip['id']}", headers=headers)
    assert final.json()["data"]["status"] == "CANCELLED"


async def test_trip_not_found_for_random_id(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}
    response = await client.get(f"/api/v1/trips/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


async def test_cannot_read_another_users_trip(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)

    created = (
        await client.post(
            "/api/v1/trips",
            json={"title": "Private trip"},
            headers={"Authorization": f"Bearer {owner['access_token']}"},
        )
    ).json()["data"]

    response = await client.get(
        f"/api/v1/trips/{created['id']}", headers={"Authorization": f"Bearer {stranger['access_token']}"}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
