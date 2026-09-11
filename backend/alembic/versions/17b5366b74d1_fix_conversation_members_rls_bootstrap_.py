"""fix conversation_members rls bootstrap for multi row inserts

`create_conversation`'s GROUP branch (and `_sync_trip_conversation_
membership`) adds the creator's own `ConversationMember` row *and* one or
more other members' rows via separate `session.add()` calls, but
SQLAlchemy's ORM collapses multiple pending inserts of the same mapped
class into a single multi-row `INSERT ... VALUES (...), (...)` statement
("insertmany") wherever possible — confirmed from the real failing SQL,
18 bind parameters for 2 rows in one statement. Postgres evaluates each
row's `WITH CHECK` independently *within* that one statement; a sibling
row in the same multi-row INSERT is never visible to another row's policy
check, regardless of what order they were added in Python (the earlier
`caller_user_id`-first ordering fix in `_sync_trip_conversation_
membership` helps across *separate* statements/transactions, but cannot
help within one batched statement). So the second (or later) row in the
batch — the invited member, not the creator — fails `is_active_
conversation_member`, which requires the creator's row to already exist.

Fix: a second `SECURITY DEFINER` helper, `chat.is_conversation_creator`,
checked against `chat.conversations.creator_id` — a *different*,
already-flushed table (the conversation itself is always created and
flushed before any membership rows are added), so this check is
independent of batching/ordering within the membership insert entirely.

Revision ID: 17b5366b74d1
Revises: 1754ef0e40b0
Create Date: 2026-09-11 15:20:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '17b5366b74d1'
down_revision: str | None = '1754ef0e40b0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("""
        CREATE FUNCTION chat.is_conversation_creator(p_conversation_id uuid, p_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        SET search_path = pg_catalog
        AS $$
            SELECT EXISTS (
                SELECT 1 FROM chat.conversations c
                WHERE c.id = p_conversation_id AND c.creator_id = p_user_id
            );
        $$;
    """)
    op.execute("GRANT EXECUTE ON FUNCTION chat.is_conversation_creator(uuid, uuid) TO travindi_app")

    op.execute("DROP POLICY conversation_members_member_or_service ON chat.conversation_members")
    op.execute(f"""
        CREATE POLICY conversation_members_member_or_service ON chat.conversation_members
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(conversation_id, {_CURRENT_USER})
            OR chat.is_conversation_creator(conversation_id, {_CURRENT_USER})
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(conversation_id, {_CURRENT_USER})
            OR chat.is_conversation_creator(conversation_id, {_CURRENT_USER})
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY conversation_members_member_or_service ON chat.conversation_members")
    op.execute(f"""
        CREATE POLICY conversation_members_member_or_service ON chat.conversation_members
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(conversation_id, {_CURRENT_USER})
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR chat.is_active_conversation_member(conversation_id, {_CURRENT_USER})
        )
    """)
    op.execute("DROP FUNCTION IF EXISTS chat.is_conversation_creator(uuid, uuid)")
