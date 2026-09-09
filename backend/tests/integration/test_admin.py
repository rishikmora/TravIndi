"""Integration tests for the Administration domain (FR-40 full admin suite):
real Keycloak role assignment/suspension, the first real writer to
`governance.audit_logs`, and the read-only policy/retention registries.
Same ASGITransport `client` fixture convention as tests/integration/
test_ai_planner.py. Requires `docker compose --profile full up -d` — no
ANTHROPIC_API_KEY needed, this domain makes no AI calls.

Reuses `_login_admin` from test_trust_and_business.py (logs in as the
pre-seeded Keycloak fixture user `test-admin@example.com`, which already
carries the `authority_platform_admin` realm role, then ensures a matching
local `identity.users` row exists so audit-log FK writes succeed) rather
than a dedicated fixture — same rationale documented there.
"""

import uuid

from httpx import AsyncClient

from tests.integration.test_sos_and_incidents import _decode_sub
from tests.integration.test_trust_and_business import _login_admin


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
    return {"email": email, "password": password, **login.json()["data"]}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_non_admin_is_forbidden_from_every_admin_endpoint(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    headers = _auth(tourist["access_token"])

    assert (await client.get("/api/v1/admin/users", headers=headers)).status_code == 403
    assert (await client.get("/api/v1/admin/audit-log", headers=headers)).status_code == 403
    assert (await client.get("/api/v1/admin/policies", headers=headers)).status_code == 403
    assert (await client.get("/api/v1/admin/retention-rules", headers=headers)).status_code == 403


async def test_admin_can_list_and_search_users(client: AsyncClient) -> None:
    admin = await _login_admin(client)
    tourist = await _register_and_login(client)
    tourist_id = _decode_sub(tourist["access_token"])
    admin_headers = _auth(admin["access_token"])

    listing = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert listing.status_code == 200, listing.text
    assert any(u["id"] == tourist_id for u in listing.json()["data"])

    searched = await client.get(
        "/api/v1/admin/users", params={"q": tourist["email"]}, headers=admin_headers
    )
    assert searched.status_code == 200, searched.text
    assert all(tourist["email"] == u["email"] for u in searched.json()["data"])
    assert any(u["id"] == tourist_id for u in searched.json()["data"])


async def test_admin_role_change_updates_account_type_and_keycloak_realm_role_and_writes_audit_log(
    client: AsyncClient,
) -> None:
    admin = await _login_admin(client)
    admin_headers = _auth(admin["access_token"])
    tourist = await _register_and_login(client)
    tourist_id = _decode_sub(tourist["access_token"])

    changed = await client.put(
        f"/api/v1/admin/users/{tourist_id}/role", json={"role": "guide"}, headers=admin_headers
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["data"]["account_type"] == "guide"

    detail = await client.get(f"/api/v1/admin/users/{tourist_id}", headers=admin_headers)
    assert detail.status_code == 200, detail.text
    assert "guide" in detail.json()["data"]["realm_roles"]

    unknown_role = await client.put(
        f"/api/v1/admin/users/{tourist_id}/role",
        json={"role": "not_a_real_role"},
        headers=admin_headers,
    )
    assert unknown_role.status_code == 422
    assert unknown_role.json()["error"]["code"] == "UNKNOWN_ROLE"

    audit = await client.get(
        "/api/v1/admin/audit-log", params={"actor_user_id": admin["user_id"]}, headers=admin_headers
    )
    assert audit.status_code == 200, audit.text
    assert any(
        entry["action"] == "ADMIN_CHANGE_ROLE" and entry["resource_id"] == tourist_id
        for entry in audit.json()["data"]
    )


async def test_admin_suspend_disables_real_login_then_reactivate_restores_it(
    client: AsyncClient,
) -> None:
    admin = await _login_admin(client)
    admin_headers = _auth(admin["access_token"])
    tourist = await _register_and_login(client)
    tourist_id = _decode_sub(tourist["access_token"])

    suspended = await client.put(
        f"/api/v1/admin/users/{tourist_id}/status",
        json={"status": "SUSPENDED"},
        headers=admin_headers,
    )
    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["data"]["status"] == "SUSPENDED"

    # Real enforcement, not a cosmetic flag: Keycloak itself now refuses to
    # issue a new token for this account.
    blocked_login = await client.post(
        "/api/v1/auth/login", json={"email": tourist["email"], "password": tourist["password"]}
    )
    assert blocked_login.status_code in (401, 403)

    reactivated = await client.put(
        f"/api/v1/admin/users/{tourist_id}/status", json={"status": "ACTIVE"}, headers=admin_headers
    )
    assert reactivated.status_code == 200, reactivated.text
    assert reactivated.json()["data"]["status"] == "ACTIVE"

    restored_login = await client.post(
        "/api/v1/auth/login", json={"email": tourist["email"], "password": tourist["password"]}
    )
    assert restored_login.status_code == 200, restored_login.text


async def test_admin_policies_and_retention_rules_are_readable(client: AsyncClient) -> None:
    admin = await _login_admin(client)
    admin_headers = _auth(admin["access_token"])

    policies = await client.get("/api/v1/admin/policies", headers=admin_headers)
    assert policies.status_code == 200, policies.text

    retention_rules = await client.get("/api/v1/admin/retention-rules", headers=admin_headers)
    assert retention_rules.status_code == 200, retention_rules.text
