"""Keycloak/OIDC JWT verification — Phase 9.

This module only answers "who is this, and what realm role do they hold."
It never itself decides whether an action is allowed — that's OPA's job
(app/core/opa.py), per the "AI recommends, policy decides" / here
"identity verifies, policy decides" separation
(docs/00-planning/01-project-master-model.md §N, §M).
"""

from functools import lru_cache

import jwt
from jwt import PyJWKClient

from app.core.config import get_settings
from app.core.errors import AppError

# The complete role vocabulary confirmed in
# docs/00-planning/08-role-permission-matrix.md — base FR-01 account types
# plus the authority sub-roles, all modeled as Keycloak realm roles under
# the single `authority` account type (see app/domains/identity/models.py
# AuthorityRole for the authority subset).
KNOWN_ROLES = frozenset(
    {
        "tourist",
        "guide",
        "business",
        "authority_police",
        "authority_emergency_responder",
        "authority_tourism_dept",
        "authority_municipality",
        "authority_verifier",
        "authority_platform_admin",
    }
)


@lru_cache
def _jwk_client() -> PyJWKClient:
    """Lazy singleton, same rationale as app/db/session.py::get_engine —
    importing this module must not require Keycloak to be configured;
    only actually verifying a token does."""
    settings = get_settings()
    if not settings.keycloak_url or not settings.keycloak_realm:
        raise AppError(
            code="AUTH_NOT_CONFIGURED",
            message="KEYCLOAK_URL / KEYCLOAK_REALM are not configured on this deployment.",
            status_code=500,
        )
    jwks_uri = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"
    return PyJWKClient(jwks_uri, cache_keys=True, lifespan=300)


def decode_and_verify(token: str) -> dict:
    """Verifies signature, expiry, issuer, and audience. Raises AppError
    (never a raw jwt.* exception) so callers get the canonical error
    envelope for free."""
    settings = get_settings()
    client = _jwk_client()
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.keycloak_audience,
            issuer=f"{settings.keycloak_url}/realms/{settings.keycloak_realm}",
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(
            code="TOKEN_EXPIRED", message="Access token has expired.", status_code=401, retryable=False
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(
            code="INVALID_TOKEN", message="Access token is invalid.", status_code=401, retryable=False
        ) from exc


def extract_role(claims: dict) -> str:
    """A principal is expected to hold exactly one recognized application
    role. Zero or multiple matches fail closed rather than guessing —
    either is a real configuration problem to fix in Keycloak, not paper
    over in the backend."""
    realm_roles = set(claims.get("realm_access", {}).get("roles", []))
    matched = realm_roles & KNOWN_ROLES

    if not matched:
        raise AppError(
            code="NO_APPLICATION_ROLE",
            message="Token does not carry a recognized application role.",
            status_code=403,
        )
    if len(matched) > 1:
        raise AppError(
            code="AMBIGUOUS_ROLE",
            message=f"Token carries multiple application roles: {sorted(matched)}.",
            status_code=403,
        )
    return next(iter(matched))
