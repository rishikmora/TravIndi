"""add adaptation engine schema for event-driven replanning

Adds the `adaptation` schema: `adaptation_events` (a real, validated signal
that something changed near a trip's current itinerary — CROWD_CHANGE or
SAFETY_CHANGE only; no real weather/transport/availability source exists in
this codebase to detect those from) and `adaptation_proposals` (an
AI-assisted candidate change, never auto-applied — a trip owner must
accept before it becomes a new itinerary version).

No RLS here, unlike `chat`/`location_sharing`/`sync`: verified via
`git grep "ENABLE ROW LEVEL SECURITY" alembic/versions/` that `travel.trips`
and `travel.itineraries` have never had RLS applied in this codebase — that
data is authorized entirely at the app layer via OPA's "self" resource
type. `AdaptationEvent`/`AdaptationProposal` are exactly as trip-owner-
scoped as an itinerary, so they follow the same plain-table-plus-OPA
pattern rather than chat's membership-RLS pattern.

Also adds 2 nullable columns to `travel.itineraries` — `baseline_crowd_
risk_score`/`baseline_crowd_observed_at` — captured once at generation time
so the adaptation engine's CROWD_CHANGE detector has a real number to diff
a fresh reading against (see app/domains/crowd/engine.py's
`latest_risk_score`). Additive, backward-compatible; old rows read as NULL,
meaning "no baseline captured — this itinerary predates the adaptation
engine," which the detector treats as nothing to compare against.

The `adaptation` schema itself was provisioned out-of-band (Supabase MCP
`apply_migration`, since `travindi_migrator` lacks database-level CREATE
SCHEMA — same recipe used for `chat`/`sync`) before this migration runs.

Revision ID: 9758520ed982
Revises: aad140e85f39
Create Date: 2026-09-11 16:54:05.182409
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9758520ed982'
down_revision: str | None = 'aad140e85f39'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'itineraries',
        sa.Column('baseline_crowd_risk_score', sa.Numeric(4, 3), nullable=True),
        schema='travel',
    )
    op.add_column(
        'itineraries',
        sa.Column('baseline_crowd_observed_at', sa.DateTime(timezone=True), nullable=True),
        schema='travel',
    )

    op.create_table(
        'adaptation_events',
        sa.Column('event_type', sa.Enum('CROWD_CHANGE', 'SAFETY_CHANGE', name='adaptation_event_type', schema='adaptation'), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('itinerary_item_id', sa.UUID(), nullable=True),
        sa.Column('destination_id', sa.UUID(), nullable=True),
        sa.Column('source_entity_type', sa.String(length=32), nullable=True),
        sa.Column('source_entity_id', sa.UUID(), nullable=True),
        sa.Column('severity', sa.String(length=16), nullable=False),
        sa.Column('confidence', sa.Numeric(4, 3), nullable=False),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'PROCESSED', 'IGNORED', 'FAILED', name='adaptation_event_status', schema='adaptation'),
            nullable=False,
        ),
        sa.Column('deduplication_key', sa.String(length=128), nullable=False),
        sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['travel.trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['itinerary_item_id'], ['travel.itinerary_items.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['destination_id'], ['tourism.destinations.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('deduplication_key', name='uq_adaptation_events_deduplication_key'),
        schema='adaptation',
    )
    op.create_index(
        'ix_adaptation_events_trip_created', 'adaptation_events', ['trip_id', 'created_at'], schema='adaptation'
    )

    op.create_table(
        'adaptation_proposals',
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('based_on_itinerary_id', sa.UUID(), nullable=False),
        sa.Column('trigger_event_id', sa.UUID(), nullable=False),
        sa.Column(
            'reason_code',
            sa.Enum('CROWD_THRESHOLD', 'SAFETY_THRESHOLD', 'INCIDENT_IMPACT', 'USER_REQUEST', name='adaptation_reason_code', schema='adaptation'),
            nullable=False,
        ),
        sa.Column('changes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('risk_level', sa.String(length=16), nullable=False),
        sa.Column('confidence', sa.Numeric(4, 3), nullable=True),
        sa.Column(
            'status',
            sa.Enum('PROPOSED', 'APPROVED', 'REJECTED', 'EXPIRED', 'APPLIED', 'STALE', name='adaptation_proposal_status', schema='adaptation'),
            nullable=False,
        ),
        sa.Column('applied_itinerary_id', sa.UUID(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['travel.trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['based_on_itinerary_id'], ['travel.itineraries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trigger_event_id'], ['adaptation.adaptation_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['applied_itinerary_id'], ['travel.itineraries.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='adaptation',
    )
    op.create_index(
        'ix_adaptation_proposals_trip_status_created',
        'adaptation_proposals',
        ['trip_id', 'status', 'created_at'],
        schema='adaptation',
    )


def downgrade() -> None:
    op.drop_index('ix_adaptation_proposals_trip_status_created', table_name='adaptation_proposals', schema='adaptation')
    op.drop_table('adaptation_proposals', schema='adaptation')
    op.drop_index('ix_adaptation_events_trip_created', table_name='adaptation_events', schema='adaptation')
    op.drop_table('adaptation_events', schema='adaptation')

    sa.Enum(name='adaptation_proposal_status', schema='adaptation').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='adaptation_reason_code', schema='adaptation').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='adaptation_event_status', schema='adaptation').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='adaptation_event_type', schema='adaptation').drop(op.get_bind(), checkfirst=True)

    op.drop_column('itineraries', 'baseline_crowd_observed_at', schema='travel')
    op.drop_column('itineraries', 'baseline_crowd_risk_score', schema='travel')
