"""Phase 8 contract tests. Split deliberately by what they need:

- OpenAPI generation and the stub 501 endpoints never touch the database
  (get_current_principal raises before any DB dependency resolves), so they
  run as pure unit tests with no environment/infra required.
- Destination/crowd endpoints are genuinely DB-backed and belong in
  tests/integration/ (see test_destinations.py) since they need the live
  Postgres from infra/docker-compose.yml.

`/ai/trip-plan` and `/routes/safe` were the stubs this suite originally
exercised — both are real now (Phase 12, Phase 13 "build a working
prototype" pass), so the generic "stub still returns the canonical
envelope" check below points at `/auth/otp/verify`, which is genuinely
unscheduled: no source document ever defines how an OTP challenge gets
created, so there's nothing to build against.
"""

from httpx import AsyncClient


async def test_openapi_schema_generates(client: AsyncClient) -> None:
    schema = await client.get("/openapi.json")
    assert schema.status_code == 200
    paths = schema.json()["paths"]
    assert "/api/v1/sos" in paths
    assert "/api/v1/routes/safe" in paths
    assert "/api/v1/destinations" in paths


async def test_stub_endpoint_returns_canonical_error_envelope(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/otp/verify", json={"challenge_id": "x", "code": "000000"})
    assert response.status_code == 501
    body = response.json()
    error = body["error"]
    assert error["code"] == "NOT_IMPLEMENTED_YET"
    assert "request_id" in error
    assert "timestamp" in error
    assert error["retryable"] is False


async def test_auth_dependent_route_rejects_missing_bearer_token(client: AsyncClient) -> None:
    """Phase 9: auth is real now. No Authorization header at all is
    rejected by FastAPI's HTTPBearer dependency (401, canonical envelope)
    before our own code runs at all. Testing an actually-invalid *token* (as
    opposed to a missing one) needs KEYCLOAK_URL/KEYCLOAK_REALM configured
    for the JWKS fetch, so that case lives in
    tests/integration/test_auth.py instead."""
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "HTTP_ERROR"


async def test_sos_declares_idempotency_key_as_required_header(client: AsyncClient) -> None:
    """Contract-level check: the header requirement is declared in the
    OpenAPI schema."""
    schema = (await client.get("/openapi.json")).json()
    params = schema["paths"]["/api/v1/sos"]["post"]["parameters"]
    idempotency_param = next(p for p in params if p["name"] == "Idempotency-Key")
    assert idempotency_param["required"] is True


async def test_sos_without_a_token_is_rejected(client: AsyncClient) -> None:
    """Auth gates this route before the (now real, Phase 14) SOS logic ever
    runs. Reaching real SOS behavior with a *valid* token is an integration
    test (tests/integration/test_sos_and_incidents.py) since it needs a
    real Keycloak-issued token."""
    response = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={"Idempotency-Key": "test-key-123"},
    )
    assert response.status_code == 401


async def test_validation_error_uses_canonical_envelope(client: AsyncClient) -> None:
    response = await client.post("/api/v1/routes/safe", json={"origin_lon": "not-a-number"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_request_id_echoed_on_response(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["X-Request-ID"] == "abc-123"


async def test_404_uses_canonical_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "HTTP_ERROR"
