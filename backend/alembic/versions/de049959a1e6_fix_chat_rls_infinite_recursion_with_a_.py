"""fix chat rls infinite recursion with a security definer helper

The previous migration's `conversation_members_member_or_service` policy
queried `chat.conversation_members` from *within its own policy
expression* (an EXISTS subquery against the same table, aliased `cm`) —
Postgres re-evaluates a table's RLS policy for every row that policy's
own expression reads, so a self-referential EXISTS on the same table
recurses forever: `InvalidObjectDefinitionError: infinite recursion
detected in policy for relation "conversation_members"`, confirmed by a
real `POST /conversations` call failing at the very first membership
insert. The other 3 policies that queried `conversation_members` as a
*different* table (`conversations`, `messages`, `message_reactions`)
would have hit the same recursion transitively, since any read of
`conversation_members` — including from inside another table's policy —
re-triggers its own (recursive) policy.

Fix: a `SECURITY DEFINER` SQL function, owned by `travindi_migrator`
(confirmed `rolbypassrls = true`). A `SECURITY DEFINER` function's body
runs as its owner, and a role with `BYPASSRLS` skips RLS evaluation
entirely for any table it touches — including `chat.conversation_members`
itself — even though these tables use `FORCE ROW LEVEL SECURITY` (`FORCE`
only removes the owner's *normal* RLS exemption; it does not, and cannot,
override a role's `BYPASSRLS` attribute, which is a separate, stronger
mechanism per Postgres's own docs). So the membership check inside the
function never re-enters any policy, and the recursion is gone. Every
policy that previously inlined the EXISTS subquery now calls this
function instead.

Revision ID: de049959a1e6
Revises: 1646b1202034
Create Date: 2026-09-11 14:45:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'de049959a1e6'
down_revision: str | None = '1646b1202034'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("""
        CREATE FUNCTION chat.is_active_conversation_member(p_conversation_id uuid, p_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        SET search_path = pg_catalog
        AS $$
            SELECT EXISTS (
                SELECT 1 FROM chat.conversation_members cm
                WHERE cm.conversation_id = p_conversation_id
                  AND cm.user_id = p_user_id
                  AND cm.status = 'ACTIVE'
            );
        $$;
    """)
    op.execute("GRANT EXECUTE ON FUNCTION chat.is_active_conversation_member(uuid, uuid) TO travindi_app")

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

    op.execute("DROP POLICY messages_member_or_service ON chat.messages")
    op.execute(f"""
        CREATE POLICY messages_member_or_service ON chat.messages
        USING ({_SERVICE_BYPASS} OR chat.is_active_conversation_member(conversation_id, {_CURRENT_USER}))
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR (sender_id = {_CURRENT_USER} AND chat.is_active_conversation_member(conversation_id, {_CURRENT_USER}))
        )
    """)

    op.execute("DROP POLICY message_reactions_member_or_service ON chat.message_reactions")
    op.execute(f"""
        CREATE POLICY message_reactions_member_or_service ON chat.message_reactions
        USING (
            {_SERVICE_BYPASS}
            OR EXISTS (
                SELECT 1 FROM chat.messages m
                WHERE m.id = message_reactions.message_id
                  AND chat.is_active_conversation_member(m.conversation_id, {_CURRENT_USER})
            )
        )
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY message_reactions_member_or_service ON chat.message_reactions")
    op.execute(f"""
        CREATE POLICY message_reactions_member_or_service ON chat.message_reactions
        USING (
            {_SERVICE_BYPASS}
            OR EXISTS (
                SELECT 1 FROM chat.messages m
                JOIN chat.conversation_members cm ON cm.conversation_id = m.conversation_id
                WHERE m.id = message_reactions.message_id AND cm.user_id = {_CURRENT_USER} AND cm.status = 'ACTIVE'
            )
        )
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
    """)

    op.execute("DROP POLICY messages_member_or_service ON chat.messages")
    op.execute(f"""
        CREATE POLICY messages_member_or_service ON chat.messages
        USING (
            {_SERVICE_BYPASS}
            OR EXISTS (
                SELECT 1 FROM chat.conversation_members cm
                WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = {_CURRENT_USER} AND cm.status = 'ACTIVE'
            )
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR (sender_id = {_CURRENT_USER} AND EXISTS (
                SELECT 1 FROM chat.conversation_members cm
                WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = {_CURRENT_USER} AND cm.status = 'ACTIVE'
            ))
        )
    """)

    op.execute("DROP POLICY conversations_member_or_service ON chat.conversations")
    op.execute(f"""
        CREATE POLICY conversations_member_or_service ON chat.conversations
        USING (
            {_SERVICE_BYPASS}
            OR EXISTS (
                SELECT 1 FROM chat.conversation_members cm
                WHERE cm.conversation_id = conversations.id AND cm.user_id = {_CURRENT_USER} AND cm.status = 'ACTIVE'
            )
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR creator_id = {_CURRENT_USER}
            OR EXISTS (
                SELECT 1 FROM chat.conversation_members cm
                WHERE cm.conversation_id = conversations.id AND cm.user_id = {_CURRENT_USER} AND cm.status = 'ACTIVE'
            )
        )
    """)

    # `conversation_members`'s own policy, and the helper function it
    # depends on, are deliberately NOT reverted here — the pre-fix version
    # of that one policy is the actual infinite-recursion bug this
    # migration exists to fix. Reverting it would restore a broken schema
    # (every conversation-related write instantly 500s), and dropping the
    # function while that policy still references it would break the
    # policy outright. Downgrade leaves both exactly as `upgrade()` left
    # them.
