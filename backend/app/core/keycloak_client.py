"""Backend-for-frontend proxy to Keycloak's token endpoint — implements
`POST /api/v1/auth/login` and `POST /api/v1/auth/token/refresh` per the
source API contract (both documented as backend endpoints, not a
direct-to-Keycloak client flow). Password-grant is used deliberately for
`login` since the source spec calls for a single credentials-in,
tokens-out backend call rather than redirect-based Authorization Code+PKCE
— an explicit simplification, not a silent one: PKCE remains the right
choice once a real login UI exists (mobile/web can still use it directly
against Keycloak instead of this endpoint if preferred).

This module never verifies tokens (that's app/core/security.py) — it only
issues/refreshes them by calling Keycloak as a client.
"""

import httpx

from app.core.config import get_settings
from app.core.errors import AppError


async def _token_request(grant_data: dict) -> dict:
    settings = get_settings()
    if not settings.keycloak_url or not settings.keycloak_realm:
        raise AppError(code="AUTH_NOT_CONFIGURED", message="Keycloak is not configured.", status_code=500)

    token_url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token"
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.post(
                token_url, data={"client_id": settings.keycloak_public_client_id, **grant_data}
            )
        except httpx.HTTPError as exc:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Identity provider is unreachable.",
                status_code=503,
                retryable=True,
            ) from exc

    if response.status_code == 200:
        return response.json()

    # Keycloak's error body: {"error": "invalid_grant", "error_description": "..."}
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    raise AppError(
        code="INVALID_CREDENTIALS",
        message=body.get("error_description", "Authentication failed."),
        status_code=401,
    )


async def login_with_password(*, username: str, password: str) -> dict:
    return await _token_request({"grant_type": "password", "username": username, "password": password})


async def refresh_access_token(*, refresh_token: str) -> dict:
    return await _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
