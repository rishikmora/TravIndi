"""add transport categories and route fields to services

Adds `AIRLINE`/`RAILWAY`/`BUS_OPERATOR` to `business.business_category` and
two nullable route columns (`origin_destination_id`/`destination_
destination_id`, real FKs to `tourism.destinations`) to `business.services`
— flight/train/bus booking reuses the existing `Service`+`Availability`+
`Booking`+`Ticket` machinery unchanged (a scheduled departure is the same
shape as any other time-boxed, capacity-limited bookable slot); this is
the only real schema change needed. See `app/domains/business/models.py`'s
`TRANSPORT_CATEGORIES` for why the two new columns point at destinations
rather than free-text city names.

Both `business` and `booking` schemas already exist (provisioned via
`infra/postgres/init.sql`, confirmed in `backend/alembic/env.py`'s
`OWNED_SCHEMAS`) — no out-of-band Supabase schema-creation step needed
here, unlike a genuinely new schema.

Revision ID: 4eaa9b914f0f
Revises: 9758520ed982
Create Date: 2026-09-11 18:48:49.381818
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4eaa9b914f0f'
down_revision: str | None = '9758520ed982'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE business.business_category ADD VALUE IF NOT EXISTS 'AIRLINE'")
    op.execute("ALTER TYPE business.business_category ADD VALUE IF NOT EXISTS 'RAILWAY'")
    op.execute("ALTER TYPE business.business_category ADD VALUE IF NOT EXISTS 'BUS_OPERATOR'")

    op.add_column('services', sa.Column('origin_destination_id', sa.UUID(), nullable=True), schema='business')
    op.add_column('services', sa.Column('destination_destination_id', sa.UUID(), nullable=True), schema='business')
    op.create_foreign_key(
        'fk_services_origin_destination_id', 'services', 'destinations',
        ['origin_destination_id'], ['id'], source_schema='business', referent_schema='tourism',
    )
    op.create_foreign_key(
        'fk_services_destination_destination_id', 'services', 'destinations',
        ['destination_destination_id'], ['id'], source_schema='business', referent_schema='tourism',
    )


def downgrade() -> None:
    op.drop_constraint('fk_services_destination_destination_id', 'services', schema='business', type_='foreignkey')
    op.drop_constraint('fk_services_origin_destination_id', 'services', schema='business', type_='foreignkey')
    op.drop_column('services', 'destination_destination_id', schema='business')
    op.drop_column('services', 'origin_destination_id', schema='business')
    # Postgres has no `ALTER TYPE ... DROP VALUE` — removing the 3 enum
    # values added in upgrade() would require recreating the whole
    # `business_category` type (and every column/constraint that
    # references it). Left in place on downgrade, documented rather than
    # silently incomplete; harmless if unused.
