"""add identity notifications table

Revision ID: 21a117722d9d
Revises: 6852ab4c8e58
Create Date: 2026-09-07 22:40:43.311816
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '21a117722d9d'
down_revision: str | None = '6852ab4c8e58'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('priority', sa.String(length=16), nullable=False),
        sa.Column('notification_type', sa.String(length=64), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.String(), nullable=False),
        sa.Column('related_entity_type', sa.String(length=32), nullable=True),
        sa.Column('related_entity_id', sa.UUID(), nullable=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['identity.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='identity',
    )
    op.create_index(
        'ix_notifications_user_created',
        'notifications',
        ['user_id', 'created_at'],
        unique=False,
        schema='identity',
    )


def downgrade() -> None:
    op.drop_index('ix_notifications_user_created', table_name='notifications', schema='identity')
    op.drop_table('notifications', schema='identity')
