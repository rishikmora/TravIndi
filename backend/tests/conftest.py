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

Test isolation note: this suite deliberately does NOT wrap each test in a
transaction that's rolled back at teardown — several tests open a second,
separate session directly via `get_session_factory()()` (e.g. to seed a row
under the `service` RLS role, or to poll past a `SET LOCAL` boundary), and
those commits would never be visible to nor rolled back by a transaction
wrapping only the `client` fixture's own connection. Instead, the
`_cleanup_test_business_pollution` fixture below runs once, after the whole
session finishes, and deletes every business the run created (see
`app/db/test_data_cleanup.py`) — the actual pollution this suite produces
in practice, since almost every test that creates throwaway data does so
via a business/service/booking chain.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_session_factory
from app.db.test_data_cleanup import (
    cleanup_test_business_pollution,
    cleanup_test_crowd_cell_pollution,
)
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
async def _cleanup_test_business_pollution():
    yield
    async with get_session_factory()() as session:
        await cleanup_test_business_pollution(session)
        await cleanup_test_crowd_cell_pollution(session)
