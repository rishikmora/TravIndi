"""SOS — FR-05, the platform's highest-criticality path. Real state machine
as of this build (prototype depth): CREATED -> ACKNOWLEDGED -> RESOLVED |
FALSE_ALARM, plus CANCELLED (owner, from any non-terminal state). The full
state machine's other states (AUTHORITY_NOTIFIED, RESOURCE_ASSIGNED,
RESPONDER_ARRIVED — app/domains/emergency/models.py `SosStatus`) exist for
future depth but this build exposes no separate transition into them — a
documented scope cut, not a hidden gap. Every write still requires an
Idempotency-Key (docs/00-planning/01-project-master-model.md §L).

Trusted-contact flow is real but simplified: a one-time SOS-scoped token is
genuinely issued to every registered contact on SOS creation, and genuinely
validated (hash lookup, expiry, revocation, single otp_code step-up) on
verify — but there's no real SMS delivery channel or OTP channel (both
Assumption C6/undefined-in-source-docs gaps), so the raw token is returned
directly in the create response instead of "sent," and any non-empty
otp_code satisfies the step-up check.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session, require_idempotency_key
from app.core.errors import AppError
from app.core.notify import notify
from app.core.opa import require_allowed
from app.db.session import get_db_session
from app.domains.emergency.models import SosEvent, SosRequest, SosStatus
from app.domains.emergency.schemas import (
    SosActionIn,
    SosCreateIn,
    SosOut,
    TrustedContactSosViewOut,
    TrustedContactTokenOut,
    TrustedContactVerifyIn,
)
from app.domains.group_travel.models import TripMember, TripMemberStatus
from app.domains.identity.models import TrustedContact, TrustedContactAccessToken
from app.domains.sync.service import claim_operation, get_existing_operation, mark_operation_result
from app.domains.tourism.schemas import GeoPoint
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/sos", tags=["sos"])

_TERMINAL_STATUSES = {SosStatus.RESOLVED, SosStatus.CANCELLED, SosStatus.FALSE_ALARM}


def _to_geo_point(wkb_element) -> GeoPoint:
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _to_sos_out(row: SosRequest, tokens: list[TrustedContactTokenOut] | None = None) -> SosOut:
    return SosOut(
        id=row.id,
        user_id=row.user_id,
        status=row.status.value,
        emergency_type=row.emergency_type,
        severity=row.severity,
        location=_to_geo_point(row.location),
        local_ack_at=row.local_ack_at,
        resolved_at=row.resolved_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        trusted_contact_tokens=tokens or [],
    )


def _add_event(
    session: AsyncSession, sos: SosRequest, event_type: str, actor_user_id: uuid.UUID, payload: dict | None = None
) -> None:
    session.add(
        SosEvent(
            sos_id=sos.id,
            event_type=event_type,
            payload=payload or {},
            actor_user_id=actor_user_id,
            occurred_at=datetime.now(UTC),
        )
    )


async def _get_sos_or_404(session: AsyncSession, sos_id: uuid.UUID) -> SosRequest:
    sos = await session.get(SosRequest, sos_id)
    if sos is None:
        raise AppError(code="SOS_NOT_FOUND", message="No such SOS request.", status_code=404)
    return sos


def _require_open(sos: SosRequest) -> None:
    if sos.status in _TERMINAL_STATUSES:
        raise AppError(code="SOS_ALREADY_CLOSED", message="This SOS request is already closed.", status_code=409)


@router.post("", response_model=DataResponse[SosOut], status_code=201)
async def create_sos(
    body: SosCreateIn,
    principal: Principal = Depends(get_current_principal),
    idempotency_key: str = Depends(require_idempotency_key),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SosOut]:
    now = datetime.now(UTC)
    user_id = uuid.UUID(principal.user_id)

    # Real dedup as of this build — a retry with the same Idempotency-Key
    # used to create a second SOS (the header was validated-present but
    # never checked against anything). Claim the key in the shared ledger
    # first; a miss means some earlier call already created this SOS.
    claimed = await claim_operation(
        session,
        operation_id=idempotency_key,
        user_id=user_id,
        device_id=None,
        source="direct",
        entity_type="sos",
        operation="CREATE",
        client_timestamp=now,
    )
    if claimed is None:
        existing = await get_existing_operation(session, operation_id=idempotency_key, user_id=user_id)
        if existing is not None and existing.result_entity_id is not None:
            prior_sos = await session.get(SosRequest, existing.result_entity_id)
            if prior_sos is not None:
                await session.commit()
                return DataResponse(data=_to_sos_out(prior_sos))
        # Claimed by another in-flight request for this same key, but that
        # request hasn't recorded its result yet — never fall through and
        # create a second SOS for an idempotency key that's already spoken
        # for; the original request's own response is the real outcome.
        raise AppError(
            code="DUPLICATE_OPERATION_IN_PROGRESS",
            message="An SOS request with this Idempotency-Key is already being processed.",
            status_code=409,
            retryable=True,
        )

    sos = SosRequest(
        user_id=uuid.UUID(principal.user_id),
        location=f"SRID=4326;POINT({body.lon} {body.lat})",
        emergency_type=body.emergency_type,
        severity=body.severity,
        local_ack_at=now,  # app-side ack is immediate — online or synced from an offline device
    )
    session.add(sos)
    await session.flush()
    if claimed is not None:
        mark_operation_result(claimed, result_entity_id=sos.id)
    _add_event(session, sos, "CREATED", uuid.UUID(principal.user_id), {"idempotency_key": idempotency_key})

    contacts_result = await session.execute(
        select(TrustedContact).where(TrustedContact.user_id == uuid.UUID(principal.user_id))
    )
    contacts = contacts_result.scalars().all()

    # `identity.trusted_contact_access_tokens`'s RLS policy is
    # service/admin-only by design (no ordinary session should read or
    # write these rows directly — see the Phase 7 migration's comment on
    # that table). Issuing a token here is a system-orchestrated side
    # effect of the tourist's own SOS creation, not a query they run
    # themselves, so it uses the same service-role escape hatch
    # app/domains/identity/router.py's /auth/register uses for its own
    # no-principal-yet writes — safe to flip for the rest of this request
    # since every remaining statement (further inserts, the refresh below)
    # only needs read/write access this principal already has anyway.
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))

    issued_tokens: list[TrustedContactTokenOut] = []
    for contact in contacts:
        raw_token = secrets.token_urlsafe(24)
        expires_at = now + timedelta(hours=6)
        session.add(
            TrustedContactAccessToken(
                trusted_contact_id=contact.id,
                sos_id=sos.id,
                token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
                issued_at=now,
                expires_at=expires_at,
            )
        )
        issued_tokens.append(
            TrustedContactTokenOut(
                trusted_contact_id=contact.id, trusted_contact_name=contact.name, token=raw_token, expires_at=expires_at
            )
        )

    # Real "group SOS" alert (Feature Blueprint P2 #21) — if the reporter is
    # an active member of any group trip, every *other* active member on
    # that same trip gets a real in-app notification. Query-only, no new
    # write path; reuses app.core.notify's existing side-effect mechanism.
    my_trip_ids = (
        await session.execute(
            select(TripMember.trip_id).where(
                TripMember.user_id == uuid.UUID(principal.user_id), TripMember.status == TripMemberStatus.ACTIVE
            )
        )
    ).scalars().all()
    if my_trip_ids:
        fellow_members = (
            await session.execute(
                select(TripMember).where(
                    TripMember.trip_id.in_(my_trip_ids),
                    TripMember.status == TripMemberStatus.ACTIVE,
                    TripMember.user_id != uuid.UUID(principal.user_id),
                )
            )
        ).scalars().all()
        for fellow in fellow_members:
            await notify(
                session,
                user_id=fellow.user_id,
                title="Travel group SOS alert",
                body="A member of your group trip has triggered an SOS.",
                notification_type="group_sos",
                priority="high",
                related_entity_type="sos",
                related_entity_id=sos.id,
            )

    # Refresh *before* commit, while the RLS session GUCs get_rls_session
    # set are still valid for this transaction: `location` was assigned as
    # a plain WKT string in Python and needs a real reload to become a
    # WKBElement _to_geo_point can convert. A post-commit refresh would
    # start a new transaction with those GUCs reset, and RLS's policy
    # expression (which casts app.current_user_id to uuid) would then fail
    # on the now-empty setting instead of silently bypassing anything.
    await session.refresh(sos)
    await session.commit()
    return DataResponse(data=_to_sos_out(sos, issued_tokens))


@router.get("", response_model=ListResponse[SosOut])
async def list_sos(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[SosOut]:
    """No code-level filtering by role — RLS's own read policy on
    `emergency.sos_requests` (owner sees only their own; police/responder/
    tourism_dept see all rows) already does this via the `app.user_role`/
    `app.current_user_id` session GUCs `get_rls_session` sets, same pattern
    as every other RLS-protected read in this codebase."""
    result = await session.execute(select(SosRequest).order_by(SosRequest.created_at.desc()).limit(50))
    return ListResponse(data=[_to_sos_out(row) for row in result.scalars().all()])


@router.get("/{sos_id}", response_model=DataResponse[SosOut])
async def get_sos(
    sos_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SosOut]:
    sos = await _get_sos_or_404(session, sos_id)
    await require_allowed(principal=principal, action="read", resource_type="sos", owner_id=str(sos.user_id))
    return DataResponse(data=_to_sos_out(sos))


@router.post("/{sos_id}/acknowledge", response_model=DataResponse[SosOut])
async def acknowledge_sos(
    sos_id: uuid.UUID,
    body: SosActionIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SosOut]:
    sos = await _get_sos_or_404(session, sos_id)
    await require_allowed(principal=principal, action="dispatch", resource_type="sos", owner_id=str(sos.user_id))
    _require_open(sos)
    sos.status = SosStatus.ACKNOWLEDGED
    _add_event(session, sos, "ACKNOWLEDGED", uuid.UUID(principal.user_id), {"note": body.note})
    await notify(
        session,
        user_id=sos.user_id,
        title="Help is on the way",
        body="Your SOS has been acknowledged by an authority responder.",
        notification_type="sos_update",
        priority="high",
        related_entity_type="sos",
        related_entity_id=sos.id,
    )
    await session.commit()
    return DataResponse(data=_to_sos_out(sos))


@router.post("/{sos_id}/resolve", response_model=DataResponse[SosOut])
async def resolve_sos(
    sos_id: uuid.UUID,
    body: SosActionIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SosOut]:
    sos = await _get_sos_or_404(session, sos_id)
    await require_allowed(principal=principal, action="dispatch", resource_type="sos", owner_id=str(sos.user_id))
    _require_open(sos)
    outcome = body.outcome if body.outcome in ("RESOLVED", "FALSE_ALARM") else "RESOLVED"
    sos.status = SosStatus(outcome)
    sos.resolved_at = datetime.now(UTC)
    _add_event(session, sos, outcome, uuid.UUID(principal.user_id), {"note": body.note})
    await notify(
        session,
        user_id=sos.user_id,
        title="SOS resolved",
        body="Your SOS request has been marked resolved by an authority responder.",
        notification_type="sos_update",
        priority="normal",
        related_entity_type="sos",
        related_entity_id=sos.id,
    )
    await session.commit()
    return DataResponse(data=_to_sos_out(sos))


@router.post("/{sos_id}/cancel", response_model=DataResponse[SosOut])
async def cancel_sos(
    sos_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[SosOut]:
    sos = await _get_sos_or_404(session, sos_id)
    await require_allowed(principal=principal, action="write", resource_type="sos", owner_id=str(sos.user_id))
    _require_open(sos)
    sos.status = SosStatus.CANCELLED
    _add_event(session, sos, "CANCELLED", uuid.UUID(principal.user_id))
    await session.commit()
    return DataResponse(data=_to_sos_out(sos))


@router.post("/{sos_id}/trusted-contact/verify", response_model=DataResponse[TrustedContactSosViewOut])
async def verify_trusted_contact_token(
    sos_id: uuid.UUID,
    body: TrustedContactVerifyIn,
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TrustedContactSosViewOut]:
    """No platform login exists for a trusted contact — this is a public,
    token-gated endpoint (docs/00-planning/08-role-permission-matrix.md §1),
    not behind get_current_principal. Runs as the `service` RLS role since
    there's no principal to set app.current_user_id for, same pattern as
    /auth/register."""
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    result = await session.execute(
        select(TrustedContactAccessToken).where(TrustedContactAccessToken.token_hash == token_hash)
    )
    token_row = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        token_row is None
        or token_row.sos_id != sos_id
        or token_row.revoked_at is not None
        or token_row.expires_at < now
    ):
        raise AppError(code="INVALID_TOKEN", message="This access token is invalid or has expired.", status_code=403)

    sos = await session.get(SosRequest, sos_id)
    if sos is None:
        raise AppError(code="SOS_NOT_FOUND", message="No such SOS request.", status_code=404)

    token_row.used_at = now
    precise_location = None
    if body.otp_code:
        token_row.otp_verified_at = now
        precise_location = _to_geo_point(sos.location)
    await session.commit()

    return DataResponse(
        data=TrustedContactSosViewOut(
            sos_id=sos.id,
            status=sos.status.value,
            emergency_type=sos.emergency_type,
            created_at=sos.created_at,
            precise_location=precise_location,
        )
    )
