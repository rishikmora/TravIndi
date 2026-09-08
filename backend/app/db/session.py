from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    """Lazy singleton — importing this module must not require a fully
    configured environment (e.g. `.env`); the engine is only actually built
    the first time a DB call is made, so pure-unit tests that never touch the
    database (like the 501 auth-stub contract tests in Phase 8) don't need
    DATABASE_URL/REDIS_URL/S3_* to be set at all."""
    return create_async_engine(get_settings().database_url)


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped session."""
    async with get_session_factory()() as session:
        yield session
