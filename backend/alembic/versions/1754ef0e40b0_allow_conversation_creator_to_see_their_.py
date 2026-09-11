"""allow conversation creator to see their own row before membership exists

`chat.conversations`'s `USING` clause only allowed
`chat.is_active_conversation_member(id, current_user)` — but at
`INSERT ... RETURNING` time (SQLAlchemy adds `RETURNING` automatically
because `Conversation` has `TimestampMixin`'s server-computed
`created_at`/`updated_at`), Postgres re-checks the SELECT policy against
the just-inserted row *before* the creator's own `conversation_members`
row exists (that INSERT happens moments later, in the same transaction,
via the app's own code — see `app/domains/chat/router.py::
create_conversation`). `InsufficientPrivilegeError('new row violates row-
level security policy for table "conversations"')`, confirmed by a direct
INSERT...RETURNING reproduction outside the app. `WITH CHECK` already had
a `creator_id = current_user` fallback for exactly this bootstrap
scenario; `USING` needs the identical fallback.

Revision ID: 1754ef0e40b0
Revises: de049959a1e6
Create Date: 2026-09-11 15:05:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1754ef0e40b0'
down_revision: str | None = 'de049959a1e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("DROP POLICY conversations_member_or_service ON chat.conversations")
    op.execute(f"""
        CREATE POLICY conversations_member_or_service ON chat.conversations
        USING (
            {_SERVICE_BYPASS}
            OR creator_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(id, {_CURRENT_USER})
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR creator_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(id, {_CURRENT_USER})
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY conversations_member_or_service ON chat.conversations")
    op.execute(f"""
        CREATE POLICY conversations_member_or_service ON chat.conversations
        USING ({_SERVICE_BYPASS} OR chat.is_active_conversation_member(id, {_CURRENT_USER}))
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR creator_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(id, {_CURRENT_USER})
        )
    """)
