"""Keycloak Admin API client — used for user provisioning on `/auth/register`
(Phase 10) and, since the Feature Blueprint P1 Administration pass, real
role/account management from `app/api/v1/admin.py` (change a user's realm
role, suspend/reactivate a Keycloak account). Authenticates as the
`travindi-backend` service account (client_credentials grant) — a distinct
service identity from any user's own token, per the "separate credential
models" rule (docs/00-planning/01-project-master-model.md §M). Never uses a
user's own token to call the admin API.
"""

import time

import httpx

from app.core.config import get_settings
from app.core.errors import AppError

_cached_admin_token: dict = {"token": None, "expires_at": 0.0}


async def _get_admin_token() -> str:
    settings = get_settings()
    if not (settings.keycloak_url and settings.keycloak_realm and settings.keycloak_admin_client_secret):
        raise AppError(
            code="AUTH_NOT_CONFIGURED",
            message="Keycloak admin service account is not configured.",
            status_code=500,
        )

    if _cached_admin_token["token"] and time.monotonic() < _cached_admin_token["expires_at"]:
        return _cached_admin_token["token"]

    token_url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token"
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(
            token_url,
            data={
                "client_id": "travindi-backend",
                "client_secret": settings.keycloak_admin_client_secret,
                "grant_type": "client_credentials",
            },
        )
    if response.status_code != 200:
        raise AppError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Could not authenticate as the backend service account.",
            status_code=503,
            retryable=True,
        )

    body = response.json()
    # Refresh a little early (30s margin) rather than exactly at expiry.
    _cached_admin_token["token"] = body["access_token"]
    _cached_admin_token["expires_at"] = time.monotonic() + body["expires_in"] - 30
    return body["access_token"]


async def get_user_id_by_email(email: str) -> str | None:
    """Looks up an existing Keycloak user's id by exact username match.
    Used only by `app/db/seed_demo.py` to make demo-account provisioning
    idempotent (re-running the seed script after a partial failure — e.g. the
    Keycloak user was created but the local `identity.users` row wasn't —
    should reuse the existing Keycloak account rather than fail on a 409)."""
    settings = get_settings()
    admin_token = await _get_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    base = f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}"

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(
            f"{base}/users", params={"username": email, "exact": "true"}, headers=headers
        )
    response.raise_for_status()
    users = response.json()
    return users[0]["id"] if users else None


async def create_user(*, email: str | None, phone: str | None, password: str, realm_role: str) -> str:
    """Creates a Keycloak user, assigns `realm_role`, and returns the new
    user's id (== the `sub` claim every future token for them will carry —
    this becomes `identity.users.id`)."""
    settings = get_settings()
    admin_token = await _get_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    base = f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}"

    username = email or phone
    payload = {
        "username": username,
        "email": email,
        "enabled": True,
        "emailVerified": False,
        "requiredActions": [],
        # Keycloak's declarative user profile (default-enabled since KC 24+)
        # treats firstName/lastName as mandatory; leaving them unset makes
        # the *next* login silently fail with "Account is not fully set up"
        # (a required action direct-grant can't satisfy) rather than
        # erroring here at creation time — same gotcha hit with the seeded
        # test users in infra/keycloak/realm-export.json. Our own API
        # contract never collects a name at registration, so these are
        # placeholders, not real profile data — nothing else in this
        # codebase reads them.
        "firstName": "Traveler",
        "lastName": username or "User",
        "credentials": [{"type": "password", "value": password, "temporary": False}],
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        create_response = await client.post(f"{base}/users", json=payload, headers=headers)
        if create_response.status_code == 409:
            raise AppError(code="USER_ALREADY_EXISTS", message="An account already exists for that identifier.", status_code=409)
        if create_response.status_code != 201:
            raise AppError(
                code="REGISTRATION_FAILED",
                message="Could not create the account with the identity provider.",
                status_code=502,
            )

        # Keycloak returns the new resource's location, not a body.
        user_id = create_response.headers["Location"].rsplit("/", 1)[-1]

        role_response = await client.get(f"{base}/roles/{realm_role}", headers=headers)
        role_response.raise_for_status()
        role_repr = role_response.json()

        assign_response = await client.post(
            f"{base}/users/{user_id}/role-mappings/realm", json=[role_repr], headers=headers
        )
        assign_response.raise_for_status()

    return user_id


async def get_user_realm_roles(user_id: str) -> list[str]:
    """Real current realm-role assignment for one Keycloak user — used by
    the admin role-change endpoint to know exactly which role(s) to remove
    before assigning the new one (a principal is expected to hold exactly
    one recognized role, per `app/core/security.py`'s `extract_role`)."""
    settings = get_settings()
    admin_token = await _get_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    base = f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}"

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(f"{base}/users/{user_id}/role-mappings/realm", headers=headers)
    response.raise_for_status()
    return [role["name"] for role in response.json()]


async def set_user_realm_role(user_id: str, new_role: str) -> None:
    """Replaces every application role currently assigned to this user with
    exactly `new_role` — removes any of `KNOWN_ROLES` still attached (a
    principal is expected to carry exactly one) and assigns the new one."""
    from app.core.security import KNOWN_ROLES  # local import: avoids a module-level cycle

    settings = get_settings()
    admin_token = await _get_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    base = f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}"

    async with httpx.AsyncClient(timeout=5.0) as client:
        current = await client.get(f"{base}/users/{user_id}/role-mappings/realm", headers=headers)
        current.raise_for_status()
        to_remove = [r for r in current.json() if r["name"] in KNOWN_ROLES]
        if to_remove:
            remove_response = await client.request(
                "DELETE", f"{base}/users/{user_id}/role-mappings/realm", json=to_remove, headers=headers
            )
            remove_response.raise_for_status()

        role_response = await client.get(f"{base}/roles/{new_role}", headers=headers)
        role_response.raise_for_status()
        assign_response = await client.post(
            f"{base}/users/{user_id}/role-mappings/realm", json=[role_response.json()], headers=headers
        )
        assign_response.raise_for_status()


async def set_user_enabled(user_id: str, enabled: bool) -> None:
    """Real account suspension — a disabled Keycloak user cannot obtain a
    new access token (password grant fails at the IdP), so this is genuine
    enforcement, not a cosmetic flag. Any token issued before the change
    remains valid only until it naturally expires (short-lived by design)."""
    settings = get_settings()
    admin_token = await _get_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    base = f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}"

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.put(f"{base}/users/{user_id}", json={"enabled": enabled}, headers=headers)
    response.raise_for_status()
