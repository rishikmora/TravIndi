"""Claim-then-fulfill helpers over `sync.sync_operations`.

Usage, always inside the same transaction as the real write:
1. `claim_operation(...)` — atomic `INSERT ... ON CONFLICT DO NOTHING
   RETURNING`. A row back means this call is the first to see this
   `(user_id, operation_id)` pair — go perform the real write, then call
   `mark_operation_result` on the returned row.
2. No row back means a prior call already claimed it — fetch it via
   `get_existing_operation` and use its `result_entity_id`/`status`
   instead of repeating the write.

`ON CONFLICT DO NOTHING` (not try/except `IntegrityError`) is deliberate:
`POST /api/v1/sync` processes a batch of operations inside one shared
transaction with a single final `commit()` — an uncaught unique-violation
would abort that whole transaction (Postgres requires a SAVEPOINT to
recover from one), poisoning every other operation in the same batch.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.sync.models import SyncOperationLedger, SyncOperationStatus


async def claim_operation(
    session: AsyncSession,
    *,
    operation_id: str,
    user_id: uuid.UUID,
    device_id: str | None,
    source: str,
    entity_type: str,
    operation: str,
    client_timestamp: datetime,
) -> SyncOperationLedger | None:
    stmt = (
        pg_insert(SyncOperationLedger)
        .values(
            operation_id=operation_id,
            user_id=user_id,
            device_id=device_id,
            source=source,
            entity_type=entity_type,
            operation=operation,
            status=SyncOperationStatus.ACCEPTED,
            client_timestamp=client_timestamp,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "operation_id"])
        .returning(SyncOperationLedger)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_existing_operation(
    session: AsyncSession, *, operation_id: str, user_id: uuid.UUID
) -> SyncOperationLedger | None:
    result = await session.execute(
        select(SyncOperationLedger).where(
            SyncOperationLedger.operation_id == operation_id, SyncOperationLedger.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


def mark_operation_result(
    ledger_row: SyncOperationLedger,
    *,
    result_entity_id: uuid.UUID | None,
    status: SyncOperationStatus = SyncOperationStatus.ACCEPTED,
    error_code: str | None = None,
) -> None:
    ledger_row.result_entity_id = result_entity_id
    ledger_row.status = status
    ledger_row.error_code = error_code
