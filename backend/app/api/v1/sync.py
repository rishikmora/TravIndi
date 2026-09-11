"""Offline sync — FR-07 core. Supports exactly three entity_type/operation
combinations, matching the offline-first spec's own named flagship
scenarios: `sos`/`CREATE`, `incident`/`CREATE`, and `itinerary_item`/
`UPDATE`. Everything else is honestly reported as skipped rather than
silently ignored or faked — a generic sync engine for arbitrary entity
types is out of scope for this build (request/response shapes still match
the canonical sync envelope, API Design §13.1 / Database Design §5.8).

Dedup for all three is now the same atomic `sync.sync_operations` ledger
(`app/domains/sync/service.py`) that `POST /sos` and
`POST /emergency/incidents` also claim against for their own direct
Idempotency-Key header — replacing this endpoint's previous non-atomic
JSONB-payload scan. A duplicate `sos`/`incident` replay is reported back
as `acknowledged` (the client's queued op is done either way, nothing left
to retry); a duplicate `itinerary_item` replay returns its original
outcome (ACCEPTED -> acknowledged, CONFLICT -> conflicted) rather than
re-running the conflict check against an `item_version` its own first
attempt already advanced, which would otherwise report a false conflict
against itself.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session
from app.core.errors import AppError
from app.domains.emergency.models import SosEvent, SosRequest
from app.domains.safety.models import Incident, IncidentEvent
from app.domains.sync.models import SyncOperationStatus
from app.domains.sync.service import claim_operation, get_existing_operation, mark_operation_result
from app.domains.travel.models import ItineraryItem
from app.domains.travel.router import apply_itinerary_item_update
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


class SyncConflictOut(BaseModel):
    operation_id: str
    error_code: str
    current_state: dict | None = None


class SyncRejectionOut(BaseModel):
    operation_id: str
    error_code: str


class SyncAckOut(BaseModel):
    acknowledged_operation_ids: list[str]
    skipped_operation_ids: list[str]
    conflicted: list[SyncConflictOut] = []
    rejected: list[SyncRejectionOut] = []
    server_time: datetime


async def _item_state(session: AsyncSession, item_id_raw: object) -> dict | None:
    try:
        item_id = uuid.UUID(str(item_id_raw))
    except (ValueError, TypeError):
        return None
    item = await session.get(ItineraryItem, item_id)
    if item is None:
        return None
    return {"note": item.note, "completed": item.completed, "item_version": item.item_version}


async def _handle_sos_create(
    session: AsyncSession, *, op: SyncOperation, user_id: uuid.UUID, device_id: str
) -> None:
    claimed = await claim_operation(
        session,
        operation_id=op.operation_id,
        user_id=user_id,
        device_id=device_id,
        source="sync",
        entity_type="sos",
        operation="CREATE",
        client_timestamp=op.client_timestamp,
    )
    if claimed is None:
        return  # already created by an earlier attempt — nothing to do, still a success for the client
    sos = SosRequest(
        user_id=user_id,
        location=f"SRID=4326;POINT({op.payload['lon']} {op.payload['lat']})",
        emergency_type=op.payload.get("emergency_type"),
        severity=op.payload.get("severity"),
        local_ack_at=op.client_timestamp,  # the real offline-ack timestamp, not "now"
    )
    session.add(sos)
    await session.flush()
    mark_operation_result(claimed, result_entity_id=sos.id)
    session.add(
        SosEvent(
            sos_id=sos.id,
            event_type="CREATED",
            payload={"idempotency_key": op.operation_id, "synced": True},
            actor_user_id=user_id,
            occurred_at=datetime.now(UTC),
        )
    )


async def _handle_incident_create(
    session: AsyncSession, *, op: SyncOperation, user_id: uuid.UUID, device_id: str
) -> None:
    claimed = await claim_operation(
        session,
        operation_id=op.operation_id,
        user_id=user_id,
        device_id=device_id,
        source="sync",
        entity_type="incident",
        operation="CREATE",
        client_timestamp=op.client_timestamp,
    )
    if claimed is None:
        return
    incident = Incident(
        reporter_user_id=user_id,
        incident_type=op.payload.get("incident_type", "other"),
        severity=op.payload.get("severity", "low"),
        location=f"SRID=4326;POINT({op.payload['lon']} {op.payload['lat']})",
        description=op.payload.get("description"),
    )
    session.add(incident)
    await session.flush()
    mark_operation_result(claimed, result_entity_id=incident.id)
    session.add(
        IncidentEvent(
            incident_id=incident.id,
            event_type="REPORTED",
            payload={"idempotency_key": op.operation_id, "synced": True},
            actor_user_id=user_id,
            occurred_at=datetime.now(UTC),
        )
    )


@router.post("", response_model=DataResponse[SyncAckOut])
async def sync(
    body: SyncRequestIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SyncAckOut]:
    user_id = uuid.UUID(principal.user_id)
    acknowledged: list[str] = []
    skipped: list[str] = []
    conflicted: list[SyncConflictOut] = []
    rejected: list[SyncRejectionOut] = []

    for op in body.operations:
        if op.entity_type == "sos" and op.operation == "CREATE":
            await _handle_sos_create(session, op=op, user_id=user_id, device_id=body.device_id)
            acknowledged.append(op.operation_id)

        elif op.entity_type == "incident" and op.operation == "CREATE":
            await _handle_incident_create(session, op=op, user_id=user_id, device_id=body.device_id)
            acknowledged.append(op.operation_id)

        elif op.entity_type == "itinerary_item" and op.operation == "UPDATE":
            claimed = await claim_operation(
                session,
                operation_id=op.operation_id,
                user_id=user_id,
                device_id=body.device_id,
                source="sync",
                entity_type="itinerary_item",
                operation="UPDATE",
                client_timestamp=op.client_timestamp,
            )
            if claimed is None:
                existing = await get_existing_operation(session, operation_id=op.operation_id, user_id=user_id)
                if existing is not None and existing.status == SyncOperationStatus.CONFLICT:
                    conflicted.append(
                        SyncConflictOut(
                            operation_id=op.operation_id,
                            error_code=existing.error_code or "ITEM_VERSION_CONFLICT",
                            current_state=await _item_state(session, op.payload.get("item_id")),
                        )
                    )
                elif existing is not None and existing.status == SyncOperationStatus.REJECTED:
                    rejected.append(
                        SyncRejectionOut(operation_id=op.operation_id, error_code=existing.error_code or "REJECTED")
                    )
                else:
                    acknowledged.append(op.operation_id)
                continue
            try:
                item = await apply_itinerary_item_update(
                    session,
                    user_id=user_id,
                    item_id=uuid.UUID(str(op.payload["item_id"])),
                    note=op.payload.get("note"),
                    completed=op.payload.get("completed"),
                    base_item_version=int(op.payload["base_item_version"]),
                )
                mark_operation_result(claimed, result_entity_id=item.id)
                acknowledged.append(op.operation_id)
            except AppError as exc:
                if exc.code in ("ITEM_VERSION_CONFLICT", "ITINERARY_SUPERSEDED"):
                    mark_operation_result(
                        claimed, result_entity_id=None, status=SyncOperationStatus.CONFLICT, error_code=exc.code
                    )
                    conflicted.append(
                        SyncConflictOut(
                            operation_id=op.operation_id,
                            error_code=exc.code,
                            current_state=await _item_state(session, op.payload.get("item_id")),
                        )
                    )
                else:
                    mark_operation_result(
                        claimed, result_entity_id=None, status=SyncOperationStatus.REJECTED, error_code=exc.code
                    )
                    rejected.append(SyncRejectionOut(operation_id=op.operation_id, error_code=exc.code))
            except (KeyError, ValueError, TypeError):
                mark_operation_result(
                    claimed,
                    result_entity_id=None,
                    status=SyncOperationStatus.REJECTED,
                    error_code="INVALID_PAYLOAD",
                )
                rejected.append(SyncRejectionOut(operation_id=op.operation_id, error_code="INVALID_PAYLOAD"))

        else:
            skipped.append(op.operation_id)

    await session.commit()
    return DataResponse(
        data=SyncAckOut(
            acknowledged_operation_ids=acknowledged,
            skipped_operation_ids=skipped,
            conflicted=conflicted,
            rejected=rejected,
            server_time=datetime.now(UTC),
        )
    )
