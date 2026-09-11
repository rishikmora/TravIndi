"""Incident management (FR-06, FR-20). Canonical path is
`/api/v1/emergency/incidents/*` per docs/00-planning/02-conflict-register.md
§5 even though the backing table lives in the `safety` schema. Real state
machine as of this build (prototype depth): REPORTED -> ASSIGNED ->
IN_PROGRESS -> RESOLVED | FALSE_ALARM, plus CANCELLED (reporter, from any
non-terminal state). `assign` self-assigns the calling police/responder
principal rather than taking an arbitrary target-officer id in the request
body — a documented prototype simplification (real dispatch routing to a
specific officer/geography is out of scope here).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session, require_idempotency_key
from app.core.errors import AppError
from app.core.notify import notify
from app.core.opa import require_allowed
from app.domains.adaptation.jobs import enqueue_job, incident_impact_job_payload
from app.domains.safety.models import Incident, IncidentEvent, IncidentStatus
from app.domains.safety.schemas import IncidentActionIn, IncidentCreateIn, IncidentOut
from app.domains.sync.service import claim_operation, get_existing_operation, mark_operation_result
from app.domains.tourism.schemas import GeoPoint
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/emergency/incidents", tags=["incidents"])

_TERMINAL_STATUSES = {IncidentStatus.RESOLVED, IncidentStatus.CANCELLED, IncidentStatus.FALSE_ALARM}


def _to_geo_point(wkb_element) -> GeoPoint:
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _to_incident_out(row: Incident) -> IncidentOut:
    return IncidentOut(
        id=row.id,
        reporter_user_id=row.reporter_user_id,
        incident_type=row.incident_type,
        severity=row.severity,
        status=row.status.value,
        location=_to_geo_point(row.location),
        description=row.description,
        assigned_to_user_id=row.assigned_to_user_id,
        resolved_at=row.resolved_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _add_event(
    session: AsyncSession, incident: Incident, event_type: str, actor_user_id: uuid.UUID, payload: dict | None = None
) -> None:
    session.add(
        IncidentEvent(
            incident_id=incident.id,
            event_type=event_type,
            payload=payload or {},
            actor_user_id=actor_user_id,
            occurred_at=datetime.now(UTC),
        )
    )


async def _get_incident_or_404(session: AsyncSession, incident_id: uuid.UUID) -> Incident:
    incident = await session.get(Incident, incident_id)
    if incident is None:
        raise AppError(code="INCIDENT_NOT_FOUND", message="No such incident.", status_code=404)
    return incident


def _require_open(incident: Incident) -> None:
    if incident.status in _TERMINAL_STATUSES:
        raise AppError(code="INCIDENT_ALREADY_CLOSED", message="This incident is already closed.", status_code=409)


@router.post("", response_model=DataResponse[IncidentOut], status_code=201)
async def create_incident(
    body: IncidentCreateIn,
    principal: Principal = Depends(get_current_principal),
    idempotency_key: str = Depends(require_idempotency_key),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[IncidentOut]:
    now = datetime.now(UTC)
    user_id = uuid.UUID(principal.user_id)

    # Same real dedup fix as create_sos in app/domains/emergency/router.py —
    # the Idempotency-Key header used to be validated-present but never
    # actually checked, so a retry created a second incident report.
    claimed = await claim_operation(
        session,
        operation_id=idempotency_key,
        user_id=user_id,
        device_id=None,
        source="direct",
        entity_type="incident",
        operation="CREATE",
        client_timestamp=now,
    )
    if claimed is None:
        existing = await get_existing_operation(session, operation_id=idempotency_key, user_id=user_id)
        if existing is not None and existing.result_entity_id is not None:
            prior_incident = await session.get(Incident, existing.result_entity_id)
            if prior_incident is not None:
                await session.commit()
                return DataResponse(data=_to_incident_out(prior_incident))
        raise AppError(
            code="DUPLICATE_OPERATION_IN_PROGRESS",
            message="An incident report with this Idempotency-Key is already being processed.",
            status_code=409,
            retryable=True,
        )

    incident = Incident(
        reporter_user_id=uuid.UUID(principal.user_id),
        incident_type=body.incident_type,
        severity=body.severity,
        location=f"SRID=4326;POINT({body.lon} {body.lat})",
        description=body.description,
    )
    session.add(incident)
    await session.flush()
    mark_operation_result(claimed, result_entity_id=incident.id)
    _add_event(session, incident, "REPORTED", uuid.UUID(principal.user_id), {"idempotency_key": idempotency_key})
    # Durable job row, not a FastAPI BackgroundTask — see
    # app/domains/adaptation/models.py's AdaptationJob docstring. Enqueued
    # in the SAME transaction as the incident itself, so the "something
    # new happened" signal for the adaptive journey engine is committed
    # atomically with the incident — it can never be silently lost even if
    # this process crashes immediately after responding. Picked up by
    # app/domains/adaptation/worker.py's poll loop; a slow/failed AI call
    # inside that job (e.g. the current Anthropic credit outage) can never
    # delay or break the reporter's own incident submission.
    await enqueue_job(
        session, job_type="detect_incident_impact", payload=incident_impact_job_payload(incident.id)
    )
    # Refresh before commit, while RLS's session GUCs are still valid for
    # this transaction — same reasoning as create_sos in
    # app/domains/emergency/router.py.
    await session.refresh(incident)
    await session.commit()
    return DataResponse(data=_to_incident_out(incident))


@router.get("", response_model=ListResponse[IncidentOut])
async def list_incidents(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[IncidentOut]:
    """No code-level role filtering — RLS's own read policy on
    `safety.incidents` (reporter/assigned/police/responder/tourism_dept)
    already scopes this via the session GUCs `get_rls_session` sets."""
    result = await session.execute(select(Incident).order_by(Incident.created_at.desc()).limit(50))
    return ListResponse(data=[_to_incident_out(row) for row in result.scalars().all()])


@router.get("/{incident_id}", response_model=DataResponse[IncidentOut])
async def get_incident(
    incident_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[IncidentOut]:
    incident = await _get_incident_or_404(session, incident_id)
    await require_allowed(
        principal=principal,
        action="read",
        resource_type="incident",
        owner_id=str(incident.reporter_user_id),
        assigned_to=str(incident.assigned_to_user_id) if incident.assigned_to_user_id else None,
    )
    return DataResponse(data=_to_incident_out(incident))


@router.post("/{incident_id}/assign", response_model=DataResponse[IncidentOut])
async def assign_incident(
    incident_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[IncidentOut]:
    incident = await _get_incident_or_404(session, incident_id)
    await require_allowed(
        principal=principal, action="dispatch", resource_type="incident", owner_id=str(incident.reporter_user_id)
    )
    _require_open(incident)
    incident.status = IncidentStatus.ASSIGNED
    incident.assigned_to_user_id = uuid.UUID(principal.user_id)
    _add_event(session, incident, "ASSIGNED", uuid.UUID(principal.user_id))
    await notify(
        session,
        user_id=incident.reporter_user_id,
        title="Your report was assigned",
        body="An authority responder has been assigned to your incident report.",
        notification_type="incident_update",
        related_entity_type="incident",
        related_entity_id=incident.id,
    )
    await session.commit()
    return DataResponse(data=_to_incident_out(incident))


@router.post("/{incident_id}/escalate", response_model=DataResponse[IncidentOut])
async def escalate_incident(
    incident_id: uuid.UUID,
    body: IncidentActionIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[IncidentOut]:
    incident = await _get_incident_or_404(session, incident_id)
    await require_allowed(
        principal=principal, action="dispatch", resource_type="incident", owner_id=str(incident.reporter_user_id)
    )
    _require_open(incident)
    incident.status = IncidentStatus.IN_PROGRESS
    _add_event(session, incident, "ESCALATED", uuid.UUID(principal.user_id), {"note": body.note})
    await session.commit()
    return DataResponse(data=_to_incident_out(incident))


@router.post("/{incident_id}/resolve", response_model=DataResponse[IncidentOut])
async def resolve_incident(
    incident_id: uuid.UUID,
    body: IncidentActionIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[IncidentOut]:
    incident = await _get_incident_or_404(session, incident_id)
    await require_allowed(
        principal=principal, action="dispatch", resource_type="incident", owner_id=str(incident.reporter_user_id)
    )
    _require_open(incident)
    outcome = body.outcome if body.outcome in ("RESOLVED", "FALSE_ALARM") else "RESOLVED"
    incident.status = IncidentStatus(outcome)
    incident.resolved_at = datetime.now(UTC)
    _add_event(session, incident, outcome, uuid.UUID(principal.user_id), {"note": body.note})
    await notify(
        session,
        user_id=incident.reporter_user_id,
        title="Your report was resolved",
        body="Your incident report has been marked resolved.",
        notification_type="incident_update",
        related_entity_type="incident",
        related_entity_id=incident.id,
    )
    await session.commit()
    return DataResponse(data=_to_incident_out(incident))
