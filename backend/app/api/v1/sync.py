"""Offline sync — FR-07 core. Narrow real implementation for this build's
demo-critical path (offline SOS -> reconnect -> authority response): a
"sos"/"CREATE" operation genuinely creates a real SOS request, idempotent
on `operation_id` (checked against existing SosEvent payloads, the same
idempotency pattern POST /sos itself uses via Idempotency-Key). Every other
entity_type is honestly reported as skipped rather than silently ignored or
faked — a generic sync engine for arbitrary entity types is out of scope
for this prototype (request/response shapes still match the canonical sync
envelope, API Design §13.1 / Database Design §5.8).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session
from app.domains.emergency.models import SosEvent, SosRequest
from app.schemas.common import DataResponse

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncOperation(BaseModel):
    operation_id: str
    entity_type: str
    operation: str  # CREATE | UPDATE | DELETE
    client_timestamp: datetime
    payload: dict


class SyncRequestIn(BaseModel):
    device_id: str
    operations: list[SyncOperation]


class SyncAckOut(BaseModel):
    acknowledged_operation_ids: list[str]
    skipped_operation_ids: list[str]
    server_time: datetime


async def _find_existing_sos_by_operation_id(session: AsyncSession, operation_id: str) -> SosRequest | None:
    result = await session.execute(
        select(SosEvent).where(
            SosEvent.event_type == "CREATED", SosEvent.payload["idempotency_key"].astext == operation_id
        )
    )
    event = result.scalars().first()
    if event is None:
        return None
    return await session.get(SosRequest, event.sos_id)


@router.post("", response_model=DataResponse[SyncAckOut])
async def sync(
    body: SyncRequestIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SyncAckOut]:
    acknowledged: list[str] = []
    skipped: list[str] = []
    for op in body.operations:
        if op.entity_type == "sos" and op.operation == "CREATE":
            existing = await _find_existing_sos_by_operation_id(session, op.operation_id)
            if existing is None:
                sos = SosRequest(
                    user_id=uuid.UUID(principal.user_id),
                    location=f"SRID=4326;POINT({op.payload['lon']} {op.payload['lat']})",
                    emergency_type=op.payload.get("emergency_type"),
                    severity=op.payload.get("severity"),
                    local_ack_at=op.client_timestamp,  # the real offline-ack timestamp, not "now"
                )
                session.add(sos)
                await session.flush()
                session.add(
                    SosEvent(
                        sos_id=sos.id,
                        event_type="CREATED",
                        payload={"idempotency_key": op.operation_id, "synced": True},
                        actor_user_id=uuid.UUID(principal.user_id),
                        occurred_at=datetime.now(UTC),
                    )
                )
            acknowledged.append(op.operation_id)
        else:
            skipped.append(op.operation_id)
    await session.commit()
    return DataResponse(
        data=SyncAckOut(
            acknowledged_operation_ids=acknowledged, skipped_operation_ids=skipped, server_time=datetime.now(UTC)
        )
    )
