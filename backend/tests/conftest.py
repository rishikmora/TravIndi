"""Shared test fixtures.

`client` yields an `httpx.AsyncClient` talking to the app in-process via
`ASGITransport` — not Starlette's `TestClient`. That's a deliberate fix, not
a style preference: `TestClient` runs the app on an anyio portal thread, and
any handler that itself makes a real outbound async HTTP call (Keycloak
login/register, OPA policy checks — most of Phase 9/10) can deadlock the
portal. It's intermittent enough that `/auth/login` (one outbound call)
happened to work reliably through `TestClient` while `/auth/register`
(several chained outbound calls) hung indefinitely every time. `ASGITransport`
runs the whole request on the *same* event loop as the test, so there's no
second thread/loop to deadlock against. This is also the pattern httpx
itself now recommends — `TestClient` prints "Using httpx with
starlette.testclient is deprecated" on every use, which was foreshadowing
exactly this class of bug.

One consequence: with everything on one event loop, `app/db/session.py`'s
lru_cache'd engine binds correctly and consistently for the whole test
session — the per-test cache-clearing this file used before ASGITransport
is no longer needed and has been removed.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
