"""add adaptation jobs table for durable background work

Adds `adaptation.adaptation_jobs` — a durable, DB-backed job queue that
replaces FastAPI `BackgroundTasks` for `detect_incident_impact`
(`app/domains/safety/router.py`'s `create_incident` used to hand it
straight to `BackgroundTasks`, which only lives in process memory and is
silently lost on a crash/restart between commit and task execution). A
row here is committed in the same transaction as the incident it reacts
to, and is picked up by a single in-process poll loop
(`app/domains/adaptation/worker.py`) using Postgres `FOR UPDATE SKIP
LOCKED` to claim it — real durability and restart-survival without
Redis/Kafka or a separate worker service, matching this pass's agreed
scope.

No RLS: an internal system table, never queried per-user, following the
same `adaptation` schema precedent as `adaptation_events`/
`adaptation_proposals` (see 9758520ed982's docstring).

Revision ID: 1d2fb51e6b30
Revises: 4eaa9b914f0f
Create Date: 2026-09-11 19:36:15.299258
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1d2fb51e6b30'
down_revision: str | None = '4eaa9b914f0f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'adaptation_jobs',
        sa.Column('job_type', sa.String(length=64), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'CLAIMED', 'DONE', 'FAILED', name='adaptation_job_status', schema='adaptation'),
            nullable=False,
        ),
        sa.Column('attempt_count', sa.Integer(), nullable=False),
        sa.Column('max_attempts', sa.Integer(), nullable=False),
        sa.Column('run_after', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('locked_by', sa.String(length=64), nullable=True),
        sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.String(length=1024), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='adaptation',
    )
    op.create_index(
        'ix_adaptation_jobs_status_run_after', 'adaptation_jobs', ['status', 'run_after'], schema='adaptation'
    )


def downgrade() -> None:
    op.drop_index('ix_adaptation_jobs_status_run_after', table_name='adaptation_jobs', schema='adaptation')
    op.drop_table('adaptation_jobs', schema='adaptation')
    sa.Enum(name='adaptation_job_status', schema='adaptation').drop(op.get_bind(), checkfirst=True)
