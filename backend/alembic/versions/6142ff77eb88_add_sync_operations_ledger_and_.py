"""add sync operations ledger and itinerary item offline edit fields

Adds `sync.sync_operations` — the first real, atomic idempotency ledger in
this codebase. Replaces two previously-divergent mechanisms: the non-atomic
JSONB-payload scan `POST /api/v1/sync` used for `sos`/`CREATE` dedup, and
the `Idempotency-Key` header on `POST /sos` / `POST /emergency/incidents`,
which was validated-present but never actually checked against anything
(a retry created a duplicate row — a real, now-fixed bug). Uniqueness is
`(user_id, operation_id)`, not `operation_id` alone, so a client-generated
id colliding across two different users can never resolve to, or block,
another user's entity.

RLS on `sync.sync_operations` copies the `location_sharing` migration's
owner-or-service pattern exactly (`ENABLE`+`FORCE ROW LEVEL SECURITY`, the
`NULLIF(current_setting(...), '')` cast already applied from the start) —
no authority-role branch needed.

Also adds `travel.itinerary_items.note`/`completed`/`item_version` — real
item-level itinerary mutation (a traveler checking off a stop or leaving a
note) independent of the AI's whole-itinerary regeneration path.
`item_version` is a plain integer counter, not a timestamp comparison,
deliberately avoiding a JS `Date` millisecond-truncation trap against a
microsecond-precision `updated_at`.

The `sync` schema itself was provisioned out-of-band (Supabase MCP
`apply_migration`, since `travindi_migrator` lacks database-level CREATE
SCHEMA — same workaround this project's Supabase migration already
established for every other schema) before this migration was applied.

Revision ID: 6142ff77eb88
Revises: 4bb7db0b9fe1
Create Date: 2026-09-11 13:04:20.097856
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6142ff77eb88'
down_revision: str | None = '4bb7db0b9fe1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        'sync_operations',
        sa.Column('operation_id', sa.String(length=128), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=True),
        sa.Column('source', sa.String(length=16), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('operation', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('result_entity_id', sa.UUID(), nullable=True),
        sa.Column('error_code', sa.String(length=64), nullable=True),
        sa.Column('client_timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['identity.users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'operation_id', name='uq_sync_operations_user_operation'),
        schema='sync',
    )

    op.execute("ALTER TABLE sync.sync_operations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sync.sync_operations FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY sync_operations_owner_or_service ON sync.sync_operations
        USING ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
    """)

    op.add_column('itinerary_items', sa.Column('note', sa.String(), nullable=True), schema='travel')
    op.add_column(
        'itinerary_items',
        sa.Column('completed', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        schema='travel',
    )
    op.add_column(
        'itinerary_items',
        sa.Column('item_version', sa.Integer(), server_default=sa.text('1'), nullable=False),
        schema='travel',
    )


def downgrade() -> None:
    op.drop_column('itinerary_items', 'item_version', schema='travel')
    op.drop_column('itinerary_items', 'completed', schema='travel')
    op.drop_column('itinerary_items', 'note', schema='travel')

    op.execute("DROP POLICY IF EXISTS sync_operations_owner_or_service ON sync.sync_operations")
    op.execute("ALTER TABLE sync.sync_operations NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sync.sync_operations DISABLE ROW LEVEL SECURITY")
    op.drop_table('sync_operations', schema='sync')
