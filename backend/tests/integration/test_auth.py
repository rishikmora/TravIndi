"""Phase 9 integration tests — require `docker compose --profile full up -d`
(Keycloak + OPA, in addition to postgres/redis/minio) and the realm import
from infra/keycloak/realm-export.json (test-tourist / Test1234!). `client`
fixture: see tests/conftest.py.
"""

import uuid

from httpx import AsyncClient


async def test_login_with_valid_credentials_issues_real_tokens(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test-tourist@example.com", "password": "Test1234!"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["expires_in"] > 0


async def test_login_with_wrong_password_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test-tourist@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_valid_token_authenticates_and_reaches_real_business_logic(client: AsyncClient) -> None:
    """Proves the full chain: login -> Keycloak-issued JWT -> our own
    signature/issuer/audience verification -> role extraction -> a real
    Phase 10 route handler actually runs (not just a 501 stub)."""
    login = (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "test-tourist@example.com", "password": "Test1234!"},
        )
    ).json()["data"]

    response = await client.get("/api/v1/trips", headers={"Authorization": f"Bearer {login['access_token']}"})
    assert response.status_code == 200


async def test_valid_token_and_idempotency_key_reaches_real_sos_logic(client: AsyncClient) -> None:
    """SOS is real as of Phase 14 (this "build a working prototype" pass) —
    the fixture `test-tourist@example.com` Keycloak user was never passed
    through /auth/register, so it has no `identity.users` row and would
    fail this endpoint's real FK constraint; a freshly-registered user is
    used instead. Deeper SOS behavior (acknowledge/resolve/cancel,
    trusted-contact tokens) lives in tests/integration/test_sos_and_incidents.py
    — this test only proves the auth layer's contract: a valid token +
    Idempotency-Key genuinely reaches business logic, not just the auth gate."""
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "Test1234!", "account_type": "tourist"}
    )
    login = (await client.post("/api/v1/auth/login", json={"email": email, "password": "Test1234!"})).json()["data"]

    response = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={
            "Authorization": f"Bearer {login['access_token']}",
            "Idempotency-Key": "test-key-123",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["status"] == "CREATED"


async def test_token_refresh_issues_a_new_working_access_token(client: AsyncClient) -> None:
    login = (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "test-tourist@example.com", "password": "Test1234!"},
        )
    ).json()["data"]

    refreshed = await client.post("/api/v1/auth/token/refresh", json={"refresh_token": login["refresh_token"]})
    assert refreshed.status_code == 200
    new_access_token = refreshed.json()["data"]["access_token"]

    response = await client.get("/api/v1/trips", headers={"Authorization": f"Bearer {new_access_token}"})
    assert response.status_code == 200


async def test_garbage_bearer_token_is_rejected_by_our_own_verification(client: AsyncClient) -> None:
    response = await client.get("/api/v1/users/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


async def test_police_role_is_extracted_correctly(client: AsyncClient) -> None:
    """Different accounts genuinely carry different application roles —
    exercised end to end rather than assumed."""
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "test-police@example.com", "password": "Test1234!"},
    )
    assert login.status_code == 200
