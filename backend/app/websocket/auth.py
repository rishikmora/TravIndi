"""WebSocket authentication. A browser `WebSocket` can't set a custom
`Authorization` header on the handshake, so the first text frame after
connect must be an explicit auth frame — never a token-in-URL (which
would land in access logs/proxies). Two paths:

- `{"type":"auth","token":"<bearer-jwt>"}` — a real, logged-in principal,
  verified via the same `decode_and_verify`/`extract_role` every REST
  route uses.
- `{"type":"auth_share_token","token":"<share-link-token>"}` — the public,
  unauthenticated location-share recipient (mirrors
  `location_sharing/router.py`'s own `get_recipient_view` token lookup
  exactly: sha256 hash, `revoked_at is None`, `expires_at >= now`). This
  path never yields a `Principal` — only a `location_share_id`, and the
  connection is scoped to exactly that one share's channel.

Either way, a socket that never sends a valid auth frame within
`AUTH_TIMEOUT_SECONDS` is closed with a policy-violation code — no
silently-open, indefinitely-unauthenticated connection.

Token expiry mid-connection is deliberately **not** re-checked after this
initial handshake (a stated scope limit, not a hidden one) — connection-
time auth is treated as good for the life of that connection, since no
per-connection re-auth timer exists anywhere in this codebase to extend.
"""

import asyncio
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import WebSocket
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.api.deps import Principal
from app.core.errors import AppError
from app.core.security import decode_and_verify, extract_role
from app.domains.location_sharing.models import LocationShareAccessToken
from app.websocket.session import rls_session

AUTH_TIMEOUT_SECONDS = 8.0


@dataclass
class ShareTokenAuth:
    location_share_id: uuid.UUID


async def authenticate(websocket: WebSocket) -> Principal | ShareTokenAuth | None:
    """Returns a `Principal`, a `ShareTokenAuth`, or `None` (auth failed —
    caller must close the socket; this function never closes it itself so
    the caller can send a final error frame first)."""
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
    except (TimeoutError, WebSocketDisconnect):
        return None

    try:
        frame = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None

    frame_type = frame.get("type")
    token = frame.get("token")
    if not isinstance(token, str) or not token:
        return None

    if frame_type == "auth":
        try:
            claims = decode_and_verify(token)
            role = extract_role(claims)
        except AppError:
            return None
        return Principal(user_id=claims["sub"], role=role)

    if frame_type == "auth_share_token":
        return await _authenticate_share_token(token)

    return None


async def _authenticate_share_token(token: str) -> ShareTokenAuth | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    async with rls_session(None, "service") as session:
        result = await session.execute(
            select(LocationShareAccessToken).where(LocationShareAccessToken.token_hash == token_hash)
        )
        token_row = result.scalar_one_or_none()
        now = datetime.now(UTC)
        if token_row is None or token_row.revoked_at is not None or token_row.expires_at < now:
            return None
        return ShareTokenAuth(location_share_id=token_row.location_share_id)
