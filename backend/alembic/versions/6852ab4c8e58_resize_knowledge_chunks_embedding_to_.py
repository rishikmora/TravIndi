"""resize knowledge_chunks embedding to 384 dim for local embeddings

Revision ID: 6852ab4c8e58
Revises: 303878c86348
Create Date: 2026-09-07 22:14:07.452010

Phase 12 switched the embedding provider from a planned OpenAI API call
(1536-dim, no key available) to a local, self-hosted `sentence-transformers`
model (all-MiniLM-L6-v2, 384-dim) — see app/core/config.py's
`embedding_model_name`. Drop+recreate rather than ALTER TYPE because
pgvector's dimension isn't alterable in place and, as importantly, no row
in `knowledge_chunks` has ever held real data yet (Phase 12's knowledge-base
seeding never ran before this pick was made) — there is nothing to migrate.
If this table already holds real embeddings when you read this, do NOT run
this migration as-is; you'd need to re-embed every row with the new model
instead of just resizing the column.
"""
from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6852ab4c8e58'
down_revision: str | None = '303878c86348'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEX_KWARGS = {
    'unique': False,
    'schema': 'knowledge',
    'postgresql_using': 'hnsw',
    'postgresql_with': {'m': 16, 'ef_construction': 64},
    'postgresql_ops': {'embedding': 'vector_cosine_ops'},
}


def upgrade() -> None:
    op.drop_index('ix_knowledge_chunks_embedding', table_name='knowledge_chunks', **_INDEX_KWARGS)
    op.drop_column('knowledge_chunks', 'embedding', schema='knowledge')
    op.add_column(
        'knowledge_chunks',
        sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=384), nullable=False),
        schema='knowledge',
    )
    op.create_index('ix_knowledge_chunks_embedding', 'knowledge_chunks', ['embedding'], **_INDEX_KWARGS)


def downgrade() -> None:
    op.drop_index('ix_knowledge_chunks_embedding', table_name='knowledge_chunks', **_INDEX_KWARGS)
    op.drop_column('knowledge_chunks', 'embedding', schema='knowledge')
    op.add_column(
        'knowledge_chunks',
        sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1536), nullable=False),
        schema='knowledge',
    )
    op.create_index('ix_knowledge_chunks_embedding', 'knowledge_chunks', ['embedding'], **_INDEX_KWARGS)
