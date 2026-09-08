"""In-app notification creation — a side effect of SOS/incident state
transitions (see app/domains/emergency/router.py, app/domains/safety/router.py),
not a delivery subsystem. Real push/SMS delivery (FCM/APNs/SMS — Assumption
C6) is not built; this only makes the "authority responded" step of the
demo journey visible to the tourist inside the app itself.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.identity.models import Notification


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
) -> Notification:
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
