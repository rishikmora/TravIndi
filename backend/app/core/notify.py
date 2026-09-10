"""In-app notification creation — a side effect of SOS/incident state
transitions (see app/domains/emergency/router.py, app/domains/safety/router.py),
not a delivery subsystem. Real push/SMS delivery (FCM/APNs/SMS — Assumption
C6) is not built; this only makes the "authority responded" step of the
demo journey visible to the tourist inside the app itself.

Honors `identity.user_profiles.notification_preferences` (GET/PUT
/notifications/preferences) — a real opt-out, not a stored-but-unused
setting: absence of a key means enabled (only an explicit `false` suppresses
a type), so existing users who never touched the preferences endpoint keep
getting every notification they always got.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.identity.models import Notification, UserProfile


async def notify(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str,
    body: str,
    notification_type: str = "general",
    priority: str = "normal",
    related_entity_type: str | None = None,
    related_entity_id: uuid.UUID | None = None,
) -> Notification | None:
    # identity.user_profiles has RLS, and the caller here is very often an
    # authority principal acting on someone ELSE's SOS/incident (e.g. a
    # police officer acknowledging a tourist's SOS) — reading the
    # *recipient's* own preferences is a system-orchestrated side effect of
    # that action, not a query the recipient ran themselves, so this uses
    # the same service-role escape hatch already established elsewhere in
    # this codebase (e.g. create_sos's trusted-contact token issuance)
    # rather than the acting principal's own (often unrelated) role.
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
    profile = (
        await session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    ).scalar_one_or_none()
    preferences = profile.notification_preferences if profile else {}
    if preferences.get(notification_type) is False:
        return None

    row = Notification(
        user_id=user_id,
        priority=priority,
        notification_type=notification_type,
        title=title,
        body=body,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        created_at=datetime.now(UTC),
    )
    session.add(row)
    return row
