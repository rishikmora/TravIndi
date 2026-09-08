"""Shared column mixins — applies the conventions confirmed in
docs/00-planning/09-database-schema-plan.md §4: UUIDv7 primary keys, UTC
timestamps, NUMERIC + ISO-4217 money.
"""

import uuid
from datetime import datetime

import uuid6
from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPKMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid6.uuid7
    )


class TimestampMixin:
    # eager_defaults: without it, `updated_at`'s server-computed onupdate
    # value is merely marked "expired" after an UPDATE flush, not fetched —
    # accessing it afterward (e.g. building a response body post-commit)
    # then triggers an implicit lazy-refresh, which needs to run a query but
    # isn't inside the async greenlet context at that point, and fails with
    # "MissingGreenlet: greenlet_spawn has not been called". eager_defaults
    # makes SQLAlchemy fetch it via RETURNING as part of the same UPDATE
    # instead of deferring it — the officially recommended fix for
    # server-side defaults under asyncio (SQLAlchemy asyncio docs, "ORM
    # Usage" section on server-side default/onupdate values).
    __mapper_args__ = {"eager_defaults": True}

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MoneyMixin:
    """NUMERIC(12,2) + ISO-4217 currency code — never floating point.

    Convention confirmed in docs/00-planning/09-database-schema-plan.md §4.
    """

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
