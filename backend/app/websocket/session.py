"""A non-`Depends` equivalent of `app.api.deps.get_rls_session` for use
inside the WebSocket message loop, where FastAPI's dependency injection
doesn't run per-frame. Opens a **fresh, short-lived session per inbound
operation** — never one session held open for the connection's lifetime.
Prod Postgres is Supabase behind a connection pooler; a WS-lifetime-held
transaction would be a real connection-exhaustion risk there, not a
theoretical one.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session_factory


@asynccontextmanager
async def rls_session(user_id: uuid.UUID | None, role: str) -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        await session.execute(
            text("SELECT set_config('app.current_user_id', :uid, true)").bindparams(uid=str(user_id or ""))
        )
        await session.execute(text("SELECT set_config('app.user_role', :role, true)").bindparams(role=role))
        yield session
