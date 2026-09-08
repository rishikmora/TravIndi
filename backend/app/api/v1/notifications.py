"""Notifications — FR-36. Real as of this build: in-app list + read/unread
+ preferences (stored in the existing `identity.user_profiles.
notification_preferences` JSONB column, Phase 7). Real push/SMS delivery
(FCM/APNs/SMS — Assumption C6) is not built; rows here are created as a
side effect of SOS/incident state changes (app/core/notify.py) plus
whatever future domains call it — there's no separate delivery worker.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_pagination
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.identity.models import Notification, UserProfile
from app.domains.identity.schemas import NotificationOut, NotificationPreferencesIn
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_notification_out(row: Notification) -> NotificationOut:
    return NotificationOut(
        id=row.id,
        priority=row.priority,
        notification_type=row.notification_type,
        title=row.title,
        body=row.body,
        related_entity_type=row.related_entity_type,
        related_entity_id=row.related_entity_id,
        read_at=row.read_at,
        created_at=row.created_at,
    )


@router.get("", response_model=ListResponse[NotificationOut])
async def list_notifications(
    pagination: Pagination = Depends(get_pagination),
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[NotificationOut]:
    result = await session.execute(
        select(Notification)
        .where(Notification.user_id == uuid.UUID(principal.user_id))
        .order_by(Notification.created_at.desc())
        .limit(pagination.limit)
    )
    return ListResponse(data=[_to_notification_out(row) for row in result.scalars().all()])


@router.post("/{notification_id}/read", response_model=DataResponse[NotificationOut])
async def mark_notification_read(
    notification_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[NotificationOut]:
    result = await session.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == uuid.UUID(principal.user_id)
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise AppError(code="NOTIFICATION_NOT_FOUND", message="No such notification.", status_code=404)
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        await session.commit()
    return DataResponse(data=_to_notification_out(row))


@router.get("/preferences", response_model=DataResponse[NotificationPreferencesIn])
async def get_preferences(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[NotificationPreferencesIn]:
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == uuid.UUID(principal.user_id))
    )
    profile = result.scalar_one_or_none()
    return DataResponse(data=NotificationPreferencesIn(preferences=profile.notification_preferences if profile else {}))


@router.put("/preferences", response_model=DataResponse[NotificationPreferencesIn])
async def set_preferences(
    body: NotificationPreferencesIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[NotificationPreferencesIn]:
    result = await session.execute(
        update(UserProfile)
        .where(UserProfile.user_id == uuid.UUID(principal.user_id))
        .values(notification_preferences=body.preferences)
    )
    if result.rowcount == 0:
        raise AppError(code="PROFILE_NOT_FOUND", message="No profile for this account.", status_code=404)
    await session.commit()
    return DataResponse(data=body)
