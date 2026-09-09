"""Real audit-log writes — the `governance.audit_logs` table existed since
the initial P0 schema but nothing in the codebase ever wrote to it until
this pass (Feature Blueprint P1 Administration). Wired into the actions
that most need a back-office trail: platform-admin role/status changes and
business/guide verification decisions. Not every write in the system emits
an event yet — that would be a much larger retrofit — so this is a real,
partial audit trail, not the exhaustive one the domain's own docstring
aspires to.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.governance.models import ActorType, AuditLog


async def write_audit_log(
    session: AsyncSession,
    *,
    actor_user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None,
    outcome: str = "SUCCESS",
    metadata: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_user_id=uuid.UUID(actor_user_id) if actor_user_id else None,
            actor_type=ActorType.USER,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            occurred_at=datetime.now(UTC),
            audit_metadata=metadata or {},
        )
    )
