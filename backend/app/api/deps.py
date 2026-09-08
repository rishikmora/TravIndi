"""Shared FastAPI dependencies for the P0 API surface.

`get_current_principal` does real Keycloak/OIDC verification (Phase 9,
app/core/security.py) — identity only, never an authorization decision
(that's app/core/opa.py). `get_rls_session` layers the RLS session-variable
contract (SET LOCAL app.current_user_id / app.user_role) on top of a DB
session so routes that touch the 5 RLS-protected tables
(docs/00-planning/09-database-schema-plan.md §5) get correct row-level
enforcement without repeating the SET LOCAL calls themselves.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import decode_and_verify, extract_role
from app.db.session import get_db_session
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Pagination

_bearer_scheme = HTTPBearer(auto_error=True)


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str


async def get_current_principal(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> Principal:
    claims = decode_and_verify(credentials.credentials)
    role = extract_role(claims)
    return Principal(user_id=claims["sub"], role=role)


async def get_rls_session(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> AsyncIterator[AsyncSession]:
    """Use this instead of bare `get_db_session` for any route touching
    `identity.users`/`user_profiles`/`trusted_contact_access_tokens`,
    `safety.incidents`, or `emergency.sos_requests` — those have RLS
    enabled and will silently return zero rows without this."""
    # `SET LOCAL` itself doesn't accept bind parameters at the protocol
    # level (PostgreSQL only allows a literal there) — `set_config(...,
    # is_local=true)` is the parameterized equivalent and avoids building
    # SQL by string interpolation.
    await session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)").bindparams(uid=principal.user_id)
    )
    await session.execute(
        text("SELECT set_config('app.user_role', :role, true)").bindparams(role=principal.role)
    )
    yield session


async def get_pagination(cursor: str | None = None, limit: int = DEFAULT_PAGE_SIZE) -> Pagination:
    return Pagination(cursor=cursor, limit=min(limit, MAX_PAGE_SIZE))


async def require_idempotency_key(
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> str:
    """Declares the Idempotency-Key contract (API Design §4.1) for critical
    writes so it's validated/documented now. The actual dedup store (check
    against a persisted key before executing the write) is wired up per
    domain as each write path is implemented (Phase 14 for SOS, etc.) —
    this dependency only guarantees the header is present and non-empty."""
    if not idempotency_key.strip():
        raise AppError(code="MISSING_IDEMPOTENCY_KEY", message="Idempotency-Key header must not be empty.")
    return idempotency_key
