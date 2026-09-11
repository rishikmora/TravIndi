"""`sync.sync_operations` — the first real, atomic idempotency ledger in
this codebase. Replaces two previously-divergent, partially-inert
mechanisms: the non-atomic JSONB-payload scan `POST /api/v1/sync` used to
dedup `sos`/`CREATE` ops, and the `Idempotency-Key` header on `POST /sos` /
`POST /emergency/incidents`, which was validated-present but never actually
checked against anything before writing (a retry created a duplicate row).

Uniqueness is `(user_id, operation_id)`, not `operation_id` alone — a
client-generated id colliding across two different users must never let
one user's retry resolve to, or block, another user's entity (cross-user
isolation is mandatory for offline sync per the governing spec).
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import UUIDPKMixin


class SyncOperationStatus(enum.StrEnum):
    ACCEPTED = "ACCEPTED"
    DUPLICATE = "DUPLICATE"
    REJECTED = "REJECTED"
    CONFLICT = "CONFLICT"


class SyncOperationLedger(UUIDPKMixin, Base):
    __tablename__ = "sync_operations"
    __table_args__ = (
        UniqueConstraint("user_id", "operation_id", name="uq_sync_operations_user_operation"),
        {"schema": "sync"},
    )

    operation_id: Mapped[str] = mapped_column(String(128), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # direct | sync
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    operation: Mapped[str] = mapped_column(String(16), nullable=False)  # CREATE | UPDATE | DELETE
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=SyncOperationStatus.ACCEPTED)
    result_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    error_code: Mapped[str | None] = mapped_column(String(64))
    client_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
