"""Live Location Sharing — a user-controlled, consent-gated, time-bounded
share to exactly one recipient (a trusted contact via a public token link,
or their travel group via the existing group-travel mechanism). Authority
access to location stays entirely on the existing, unmodified SOS path
(`emergency.router.py`) — this router has no authority branch anywhere.

No WebSocket/push infrastructure exists anywhere in this codebase (see
`app/websocket/__init__.py`'s unbuilt Phase-14 placeholder) — "live" here
means the same authenticated REST-polling pattern already shipped for SOS
status (`ActiveSosCard`, web/src/app/sos/page.tsx) and the crowd heatmap.

GROUP-recipient shares are deliberately a thin consent/duration/audit
wrapper: actual location read/write for that case stays on the existing,
unmodified `/group-travel/trips/{trip_id}/location(s)` endpoints — `/ping`
below only ever writes `current_location` for TRUSTED_CONTACT shares.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import h3
from fastapi import APIRouter, Depends, Query
from geoalchemy2.shape import to_shape
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session, require_idempotency_key
from app.core.errors import AppError
from app.core.notify import notify
from app.core.opa import Action, require_allowed
from app.db.session import get_db_session
from app.domains.group_travel.access import is_trip_owner_or_active_member
from app.domains.group_travel.models import TripMember, TripMemberStatus
from app.domains.identity.models import TrustedContact, UserConsent
from app.domains.location_sharing.models import (
    LocationShare,
    LocationShareAccessToken,
    LocationShareEvent,
    RecipientType,
    SharePrecision,
    ShareStatus,
)
from app.domains.location_sharing.schemas import (
    LocationShareCreateIn,
    LocationShareOut,
    LocationSharePingIn,
    LocationShareRecipientViewOut,
    LocationShareUpdateIn,
)
from app.domains.tourism.schemas import GeoPoint
from app.domains.travel.models import Trip
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/location-sharing", tags=["location-sharing"])

_CONSENT_PURPOSE = "location_sharing"
_APPROX_H3_RESOLUTION = 7  # ~1.2km hex edge — a real neighborhood-level privacy boundary
_MAX_DURATION_HOURS = 72  # a real ceiling on every path, including "custom"/"until stopped"
_MIN_PING_INTERVAL_SECONDS = 10
_STALE_AFTER_SECONDS = 90


def _to_geo_point(wkb_element) -> GeoPoint:
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _is_live(share: LocationShare, now: datetime) -> bool:
    if share.status != ShareStatus.ACTIVE or now >= share.expires_at:
        return False
    if share.last_location_at is None:
        return False
    return (now - share.last_location_at).total_seconds() <= _STALE_AFTER_SECONDS


def _to_share_out(share: LocationShare, *, access_token: str | None = None) -> LocationShareOut:
    now = datetime.now(UTC)
    return LocationShareOut(
        id=share.id,
        user_id=share.user_id,
        recipient_type=share.recipient_type.value,
        trusted_contact_id=share.trusted_contact_id,
        trip_id=share.trip_id,
        purpose=share.purpose,
        precision=share.precision.value,
        status=share.status.value,
        started_at=share.started_at,
        expires_at=share.expires_at,
        last_location_at=share.last_location_at,
        current_location=_to_geo_point(share.current_location) if share.current_location is not None else None,
        is_live=_is_live(share, now),
        created_at=share.created_at,
        updated_at=share.updated_at,
        access_token=access_token,
    )


def _add_event(
    session: AsyncSession,
    share: LocationShare,
    event_type: str,
    actor_user_id: uuid.UUID | None,
    payload: dict | None = None,
) -> None:
    session.add(
        LocationShareEvent(
            location_share_id=share.id,
            event_type=event_type,
            payload=payload or {},
            actor_user_id=actor_user_id,
            occurred_at=datetime.now(UTC),
        )
    )


def _apply_precision(lon: float, lat: float, precision: SharePrecision) -> tuple[float, float]:
    """Snaps to an H3 cell and returns the cell's own centroid — the raw
    coordinate is never persisted for an APPROXIMATE share, a real privacy
    property, not just a display-layer fuzz. Reuses the h3 dependency
    already used for crowd density (app/db/seed.py), not naive rounding."""
    if precision == SharePrecision.PRECISE:
        return lon, lat
    cell = h3.latlng_to_cell(lat, lon, _APPROX_H3_RESOLUTION)
    fuzzed_lat, fuzzed_lon = h3.cell_to_latlng(cell)
    return fuzzed_lon, fuzzed_lat


async def _compute_expires_at(
    session: AsyncSession, *, duration_choice: str, custom_minutes: int | None, trip_id: uuid.UUID | None
) -> datetime:
    now = datetime.now(UTC)
    ceiling = now + timedelta(hours=_MAX_DURATION_HOURS)
    if duration_choice == "15m":
        return now + timedelta(minutes=15)
    if duration_choice == "1h":
        return now + timedelta(hours=1)
    if duration_choice == "4h":
        return now + timedelta(hours=4)
    if duration_choice == "until_trip_end":
        if trip_id is None:
            raise AppError(code="TRIP_REQUIRED", message="until_trip_end requires a trip.", status_code=422)
        trip = await session.get(Trip, trip_id)
        if trip is None or trip.end_date is None or trip.end_date <= now:
            raise AppError(
                code="NO_TRIP_END_DATE",
                message="This trip has no real, future end date to share until.",
                status_code=422,
            )
        return min(trip.end_date, ceiling)
    if duration_choice == "custom":
        if not custom_minutes or custom_minutes <= 0:
            raise AppError(code="INVALID_DURATION", message="custom_minutes must be positive.", status_code=422)
        return min(now + timedelta(minutes=custom_minutes), ceiling)
    # "until_stopped" — never indefinite: always capped at the real ceiling,
    # renewable via PATCH.
    return ceiling


async def _has_location_sharing_consent(session: AsyncSession, user_id: uuid.UUID) -> bool:
    result = await session.execute(
        select(UserConsent.id).where(
            UserConsent.user_id == user_id, UserConsent.purpose == _CONSENT_PURPOSE, UserConsent.status == "GRANTED"
        )
    )
    return result.first() is not None


async def _get_own_share(
    session: AsyncSession, share_id: uuid.UUID, principal: Principal, action: Action
) -> LocationShare:
    share = await session.get(LocationShare, share_id)
    if share is None:
        raise AppError(code="LOCATION_SHARE_NOT_FOUND", message="No such location share.", status_code=404)
    await require_allowed(principal=principal, action=action, resource_type="self", owner_id=str(share.user_id))
    return share


def _apply_lazy_expiry(share: LocationShare) -> bool:
    """No cron/worker exists in this codebase (app/workers/__init__.py is an
    unbuilt placeholder) — expiry is enforced lazily at the points that
    matter (here, and get_recipient_view's own live status computation)
    rather than by a background sweep. Returns True if the row's stored
    status just changed, so callers know whether a commit is needed."""
    if share.status == ShareStatus.ACTIVE and datetime.now(UTC) >= share.expires_at:
        share.status = ShareStatus.EXPIRED
        return True
    return False


@router.post("", response_model=DataResponse[LocationShareOut], status_code=201)
async def create_location_share(
    body: LocationShareCreateIn,
    principal: Principal = Depends(get_current_principal),
    _idempotency_key: str = Depends(require_idempotency_key),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[LocationShareOut]:
    user_id = uuid.UUID(principal.user_id)

    if not await _has_location_sharing_consent(session, user_id):
        raise AppError(
            code="CONSENT_REQUIRED",
            message="Grant the 'Location sharing' consent before starting a share.",
            status_code=403,
        )

    if body.recipient_type == "TRUSTED_CONTACT":
        contact = await session.get(TrustedContact, body.trusted_contact_id)
        if contact is None or contact.user_id != user_id:
            raise AppError(code="TRUSTED_CONTACT_NOT_FOUND", message="No such trusted contact.", status_code=404)
    else:
        trip = await session.get(Trip, body.trip_id)
        if trip is None:
            raise AppError(code="TRIP_NOT_FOUND", message="No such trip.", status_code=404)
        if not await is_trip_owner_or_active_member(session, trip, principal.user_id):
            raise AppError(code="FORBIDDEN", message="You aren't part of this trip.", status_code=403)

    expires_at = await _compute_expires_at(
        session, duration_choice=body.duration_choice, custom_minutes=body.custom_minutes, trip_id=body.trip_id
    )
    now = datetime.now(UTC)

    share = LocationShare(
        user_id=user_id,
        recipient_type=RecipientType(body.recipient_type),
        trusted_contact_id=body.trusted_contact_id,
        trip_id=body.trip_id,
        purpose=body.purpose,
        precision=SharePrecision(body.precision),
        status=ShareStatus.ACTIVE,
        started_at=now,
        expires_at=expires_at,
    )
    session.add(share)
    await session.flush()
    _add_event(session, share, "CREATED", user_id, {"recipient_type": body.recipient_type})

    raw_token: str | None = None
    if share.recipient_type == RecipientType.TRUSTED_CONTACT:
        raw_token = secrets.token_urlsafe(24)
        # location_share_access_tokens' RLS is service-only (mirrors
        # identity.trusted_contact_access_tokens) — issuing it is a
        # system-orchestrated side effect of the owner's own create call,
        # same escape-hatch pattern emergency/router.py's create_sos uses.
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        session.add(
            LocationShareAccessToken(
                location_share_id=share.id,
                token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
                issued_at=now,
                expires_at=expires_at,
            )
        )
    else:
        fellow_members = (
            await session.execute(
                select(TripMember).where(
                    TripMember.trip_id == share.trip_id,
                    TripMember.status == TripMemberStatus.ACTIVE,
                    TripMember.user_id != user_id,
                )
            )
        ).scalars().all()
        for fellow in fellow_members:
            await notify(
                session,
                user_id=fellow.user_id,
                title="Live location sharing started",
                body="A member of your group trip started sharing their live location.",
                notification_type="location_share_started",
                priority="normal",
                related_entity_type="location_share",
                related_entity_id=share.id,
            )

    await session.commit()
    return DataResponse(data=_to_share_out(share, access_token=raw_token))


@router.get("", response_model=ListResponse[LocationShareOut])
async def list_location_shares(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[LocationShareOut]:
    result = await session.execute(
        select(LocationShare)
        .where(LocationShare.user_id == uuid.UUID(principal.user_id))
        .order_by(LocationShare.created_at.desc())
        .limit(50)
    )
    return ListResponse(data=[_to_share_out(row) for row in result.scalars().all()])


@router.get("/{share_id}", response_model=DataResponse[LocationShareOut])
async def get_location_share(
    share_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[LocationShareOut]:
    share = await _get_own_share(session, share_id, principal, "read")
    if _apply_lazy_expiry(share):
        await session.commit()
    return DataResponse(data=_to_share_out(share))


@router.patch("/{share_id}", response_model=DataResponse[LocationShareOut])
async def update_location_share(
    share_id: uuid.UUID,
    body: LocationShareUpdateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[LocationShareOut]:
    share = await _get_own_share(session, share_id, principal, "write")
    _apply_lazy_expiry(share)
    if share.status != ShareStatus.ACTIVE:
        await session.commit()
        raise AppError(code="SHARE_NOT_ACTIVE", message="This share is no longer active.", status_code=409)

    if body.precision is not None:
        share.precision = SharePrecision(body.precision)
    if body.duration_choice is not None:
        share.expires_at = await _compute_expires_at(
            session, duration_choice=body.duration_choice, custom_minutes=body.custom_minutes, trip_id=share.trip_id
        )
        token_result = await session.execute(
            select(LocationShareAccessToken).where(LocationShareAccessToken.location_share_id == share.id)
        )
        token_row = token_result.scalar_one_or_none()
        if token_row is not None:
            await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
            token_row.expires_at = share.expires_at

    await session.commit()
    return DataResponse(data=_to_share_out(share))


@router.delete("/{share_id}", status_code=204)
async def revoke_location_share(
    share_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    share = await _get_own_share(session, share_id, principal, "write")
    if share.status == ShareStatus.ACTIVE:
        share.status = ShareStatus.REVOKED
        share.revoked_at = datetime.now(UTC)
        _add_event(session, share, "REVOKED", uuid.UUID(principal.user_id))
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        token_result = await session.execute(
            select(LocationShareAccessToken).where(LocationShareAccessToken.location_share_id == share.id)
        )
        token_row = token_result.scalar_one_or_none()
        if token_row is not None:
            token_row.revoked_at = share.revoked_at
    await session.commit()


@router.post("/stop-all", status_code=204)
async def stop_all_location_shares(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    user_id = uuid.UUID(principal.user_id)
    result = await session.execute(
        select(LocationShare).where(LocationShare.user_id == user_id, LocationShare.status == ShareStatus.ACTIVE)
    )
    shares = result.scalars().all()
    now = datetime.now(UTC)
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
    for share in shares:
        share.status = ShareStatus.REVOKED
        share.revoked_at = now
        _add_event(session, share, "REVOKED", user_id, {"via": "stop_all"})
        token_result = await session.execute(
            select(LocationShareAccessToken).where(LocationShareAccessToken.location_share_id == share.id)
        )
        token_row = token_result.scalar_one_or_none()
        if token_row is not None:
            token_row.revoked_at = now
    await session.commit()


@router.post("/{share_id}/ping", response_model=DataResponse[LocationShareOut])
async def ping_location_share(
    share_id: uuid.UUID,
    body: LocationSharePingIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[LocationShareOut]:
    share = await _get_own_share(session, share_id, principal, "write")
    if share.recipient_type != RecipientType.TRUSTED_CONTACT:
        raise AppError(
            code="USE_GROUP_TRAVEL_ENDPOINT",
            message="GROUP shares use the existing /group-travel/trips/{trip_id}/location endpoint.",
            status_code=409,
        )
    _apply_lazy_expiry(share)
    if share.status != ShareStatus.ACTIVE:
        await session.commit()
        raise AppError(code="SHARE_NOT_ACTIVE", message="This share is no longer active.", status_code=409)

    now = datetime.now(UTC)
    if share.last_location_at is not None and (now - share.last_location_at).total_seconds() < _MIN_PING_INTERVAL_SECONDS:
        raise AppError(
            code="PING_RATE_LIMITED",
            message="Location pings are limited to once every "
            f"{_MIN_PING_INTERVAL_SECONDS} seconds.",
            status_code=429,
            retryable=True,
        )

    lon, lat = _apply_precision(body.lon, body.lat, share.precision)
    share.current_location = f"SRID=4326;POINT({lon} {lat})"
    share.last_location_at = now
    await session.flush()
    # Refresh *before* commit, while get_rls_session's SET LOCAL GUCs are
    # still valid for this transaction — current_location was assigned as
    # a plain WKT string and needs a real reload to become the WKBElement
    # _to_geo_point expects. A post-commit refresh would start a new
    # transaction with those GUCs reset (same reasoning as
    # emergency/router.py's create_sos).
    await session.refresh(share)
    await session.commit()
    return DataResponse(data=_to_share_out(share))


@router.get("/{share_id}/recipient-view", response_model=DataResponse[LocationShareRecipientViewOut])
async def get_recipient_view(
    share_id: uuid.UUID,
    token: str = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[LocationShareRecipientViewOut]:
    """Public, unauthenticated — a trusted contact never has a platform
    account (see identity/models.py's TrustedContact docstring). Mirrors
    emergency/router.py's /sos/{id}/trusted-contact/verify token lookup
    exactly. Status/is_live/current_location are computed live at read
    time, never trusting a possibly-stale stored `status` column, so a
    stale location is never served as current."""
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await session.execute(
        select(LocationShareAccessToken).where(LocationShareAccessToken.token_hash == token_hash)
    )
    token_row = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if token_row is None or token_row.location_share_id != share_id or token_row.revoked_at is not None or token_row.expires_at < now:
        raise AppError(code="INVALID_TOKEN", message="This access link is invalid or has expired.", status_code=403)

    share = await session.get(LocationShare, share_id)
    if share is None:
        raise AppError(code="LOCATION_SHARE_NOT_FOUND", message="No such location share.", status_code=404)

    is_active = share.status == ShareStatus.ACTIVE and now < share.expires_at
    reason = None
    if not is_active:
        reason = "revoked" if share.status == ShareStatus.REVOKED else "expired"
        _add_event(session, share, "ACCESS_DENIED", None, {"reason": reason})
    else:
        _add_event(session, share, "ACCESS_GRANTED", None)
    await session.commit()

    current_location = (
        _to_geo_point(share.current_location) if is_active and share.current_location is not None else None
    )
    return DataResponse(
        data=LocationShareRecipientViewOut(
            recipient_type=share.recipient_type.value,
            precision=share.precision.value,
            status="ACTIVE" if is_active else ("REVOKED" if share.status == ShareStatus.REVOKED else "EXPIRED"),
            current_location=current_location,
            last_location_at=share.last_location_at if is_active else None,
            is_live=is_active and _is_live(share, now),
            expires_at=share.expires_at,
            purpose=share.purpose,
            reason=reason,
        )
    )
