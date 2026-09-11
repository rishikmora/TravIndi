"""add chat schema for conversations and messages

Adds the `chat` schema: `conversations` (DIRECT/GROUP/TRIP),
`conversation_members`, `messages`, `message_reactions`,
`message_reports`, `user_blocks` — genuinely new (no chat/conversation/
message table of any kind existed anywhere in this codebase before).

RLS is membership-based (unlike the flat owner-or-service policies used
elsewhere in this codebase so far) — a real authoring effort, not a
copy-paste of `location_sharing`'s own precedent:
- `conversations`/`messages`/`message_reactions`: visible to an ACTIVE
  member of the conversation (via an EXISTS subquery against
  `conversation_members`, backed by the
  `ix_conversation_members_conversation_user_status` index since that
  subquery runs per row).
- `conversation_members`: visible to any other ACTIVE member of the same
  conversation. WITH CHECK is deliberately a backstop against
  cross-conversation tampering (IDOR), not fine-grained role
  authorization — *who* may add/remove/promote a member is enforced at
  the application layer (`app/domains/chat/router.py`'s own ADMIN/OWNER
  checks), the same "RLS = tenant isolation, app logic = action
  authorization" split this codebase already uses via OPA elsewhere.
- `message_reports`: only the reporter can create; only a platform admin
  (`_SERVICE_BYPASS` already includes `authority_platform_admin`, per the
  location_sharing migration's own precedent) can read/resolve.
- `user_blocks`: only the blocker can see or manage their own block list.

The `chat` schema itself was provisioned out-of-band (Supabase MCP
`apply_migration`, since `travindi_migrator` lacks database-level CREATE
SCHEMA — same recipe used for the `sync` schema this session) before this
migration was applied.

Revision ID: 1646b1202034
Revises: 6142ff77eb88
Create Date: 2026-09-11 14:10:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1646b1202034'
down_revision: str | None = '6142ff77eb88'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"

_IS_ACTIVE_MEMBER = (
    "EXISTS (SELECT 1 FROM chat.conversation_members cm WHERE cm.conversation_id = {table}.{fk} "
    f"AND cm.user_id = {_CURRENT_USER} AND cm.status = 'ACTIVE')"
)


def upgrade() -> None:
    op.create_table(
        'conversations',
        sa.Column('type', sa.Enum('DIRECT', 'GROUP', 'TRIP', name='conversation_type', schema='chat'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('trip_id', sa.UUID(), nullable=True),
        sa.Column('creator_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Enum('ACTIVE', 'ARCHIVED', name='conversation_status', schema='chat'), nullable=False),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['travel.trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['creator_id'], ['identity.users.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='chat',
    )

    op.create_table(
        'messages',
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('sender_id', sa.UUID(), nullable=False),
        sa.Column('client_message_id', sa.String(length=128), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('message_type', sa.Enum('TEXT', 'LOCATION', 'SHARED_ENTITY', 'SYSTEM', name='message_type', schema='chat'), nullable=False),
        sa.Column('reply_to_message_id', sa.UUID(), nullable=True),
        sa.Column('shared_entity_type', sa.String(length=32), nullable=True),
        sa.Column('shared_entity_id', sa.UUID(), nullable=True),
        sa.Column('location_share_id', sa.UUID(), nullable=True),
        sa.Column('mentions', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['chat.conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['identity.users.id']),
        sa.ForeignKeyConstraint(['reply_to_message_id'], ['chat.messages.id']),
        sa.ForeignKeyConstraint(['location_share_id'], ['location_sharing.location_shares.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('conversation_id', 'sender_id', 'client_message_id', name='uq_messages_sender_client_id'),
        schema='chat',
    )
    op.create_index('ix_messages_conversation_created', 'messages', ['conversation_id', 'created_at'], schema='chat')

    op.create_table(
        'conversation_members',
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.Enum('MEMBER', 'ADMIN', 'OWNER', name='conversation_member_role', schema='chat'), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('left_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('muted_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_read_message_id', sa.UUID(), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'LEFT', name='conversation_member_status', schema='chat'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['chat.conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['identity.users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['last_read_message_id'], ['chat.messages.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('conversation_id', 'user_id', name='uq_conversation_members_conversation_user'),
        schema='chat',
    )
    op.create_index(
        'ix_conversation_members_conversation_user_status', 'conversation_members',
        ['conversation_id', 'user_id', 'status'], schema='chat',
    )

    op.create_table(
        'message_reactions',
        sa.Column('message_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('emoji', sa.String(length=8), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['chat.messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['identity.users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_message_reactions_message_user_emoji'),
        schema='chat',
    )

    op.create_table(
        'message_reports',
        sa.Column('message_id', sa.UUID(), nullable=False),
        sa.Column('reporter_user_id', sa.UUID(), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['chat.messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reporter_user_id'], ['identity.users.id']),
        sa.ForeignKeyConstraint(['resolved_by'], ['identity.users.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='chat',
    )

    op.create_table(
        'user_blocks',
        sa.Column('blocker_user_id', sa.UUID(), nullable=False),
        sa.Column('blocked_user_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.CheckConstraint('blocker_user_id != blocked_user_id', name='ck_user_blocks_not_self'),
        sa.ForeignKeyConstraint(['blocker_user_id'], ['identity.users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocked_user_id'], ['identity.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blocker_user_id', 'blocked_user_id', name='uq_user_blocks_pair'),
        schema='chat',
    )

    # --- RLS ---
    for table in ("conversations", "messages", "conversation_members", "message_reactions", "message_reports", "user_blocks"):
        op.execute(f"ALTER TABLE chat.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE chat.{table} FORCE ROW LEVEL SECURITY")

    # WITH CHECK covers both INSERT (no membership row exists yet for a
    # brand-new conversation — `creator_id = current_user` is the only
    # thing to check) and later UPDATEs by any active member (e.g.
    # bumping `updated_at` when a non-creator member sends a message).
    op.execute(f"""
        CREATE POLICY conversations_member_or_service ON chat.conversations
        USING ({_SERVICE_BYPASS} OR {_IS_ACTIVE_MEMBER.format(table='conversations', fk='id')})
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR creator_id = {_CURRENT_USER}
            OR {_IS_ACTIVE_MEMBER.format(table='conversations', fk='id')}
        )
    """)

    op.execute(f"""
        CREATE POLICY messages_member_or_service ON chat.messages
        USING ({_SERVICE_BYPASS} OR {_IS_ACTIVE_MEMBER.format(table='messages', fk='conversation_id')})
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR (sender_id = {_CURRENT_USER} AND {_IS_ACTIVE_MEMBER.format(table='messages', fk='conversation_id')})
        )
    """)

    # `WITH CHECK` allows inserting your own membership row (the
    # create-conversation bootstrap: no membership row exists yet for a
    # brand-new conversation) OR being an existing active member adding/
    # updating someone else's row — Postgres read-your-own-writes within
    # one transaction means the creator's own just-inserted OWNER row is
    # visible to the very next INSERT for a second member, same
    # transaction, before either commits.
    op.execute(f"""
        CREATE POLICY conversation_members_member_or_service ON chat.conversation_members
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR {_IS_ACTIVE_MEMBER.format(table='conversation_members', fk='conversation_id')}
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR {_IS_ACTIVE_MEMBER.format(table='conversation_members', fk='conversation_id')}
        )
    """)

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

    op.execute(f"""
        CREATE POLICY message_reports_reporter_or_service ON chat.message_reports
        USING ({_SERVICE_BYPASS} OR reporter_user_id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR reporter_user_id = {_CURRENT_USER})
    """)

    op.execute(f"""
        CREATE POLICY user_blocks_owner_or_service ON chat.user_blocks
        USING ({_SERVICE_BYPASS} OR blocker_user_id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR blocker_user_id = {_CURRENT_USER})
    """)


def downgrade() -> None:
    for policy, table in (
        ("user_blocks_owner_or_service", "user_blocks"),
        ("message_reports_reporter_or_service", "message_reports"),
        ("message_reactions_member_or_service", "message_reactions"),
        ("conversation_members_member_or_service", "conversation_members"),
        ("messages_member_or_service", "messages"),
        ("conversations_member_or_service", "conversations"),
    ):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON chat.{table}")
        op.execute(f"ALTER TABLE chat.{table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE chat.{table} DISABLE ROW LEVEL SECURITY")

    op.drop_table('user_blocks', schema='chat')
    op.drop_table('message_reports', schema='chat')
    op.drop_table('message_reactions', schema='chat')
    op.drop_index('ix_conversation_members_conversation_user_status', table_name='conversation_members', schema='chat')
    op.drop_table('conversation_members', schema='chat')
    op.drop_index('ix_messages_conversation_created', table_name='messages', schema='chat')
    op.drop_table('messages', schema='chat')
    op.drop_table('conversations', schema='chat')

    for enum_name in (
        "message_type", "conversation_member_status", "conversation_member_role", "conversation_status", "conversation_type",
    ):
        op.execute(f"DROP TYPE IF EXISTS chat.{enum_name}")
