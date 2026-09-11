"""add trip intent and explainability fields to travel schema

Adds real structured trip-intent fields to `travel.trips` (interests, avoid,
pace, safety_preference, days, nights) — persisted on Trip rather than only
on the request schema, so a replan (which re-calls generate_itinerary on the
same Trip row) keeps them automatically, the same way it already keeps
budget/currency today. Adds `travel.itineraries.destination_id` (denormalized
at generation time, fixing replan's previous brittle re-derivation from the
first item's attraction), `replan_reason`/`previous_version` (real, queryable
replan history — previously only ever existed inside a transient prompt
string). Adds `travel.itinerary_items.day_offset`/`time_of_day` — the AI's
own PlannedItem already returns both today, they were simply discarded after
computing `scheduled_time`.

Revision ID: 4bb7db0b9fe1
Revises: 1f4979f98d26
Create Date: 2026-09-11 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4bb7db0b9fe1'
down_revision: str | None = '1f4979f98d26'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # travel.trips already has real rows — JSONB columns need a server
    # default so the NOT NULL add succeeds against existing rows (same
    # pattern as fdbc466eb1c4_add_food_intelligence_fields_to_.py).
    op.add_column(
        'trips',
        sa.Column('interests', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        schema='travel',
    )
    op.add_column(
        'trips',
        sa.Column('avoid', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        schema='travel',
    )
    op.add_column('trips', sa.Column('pace', sa.String(length=16), nullable=True), schema='travel')
    op.add_column('trips', sa.Column('safety_preference', sa.String(length=16), nullable=True), schema='travel')
    op.add_column('trips', sa.Column('days', sa.Integer(), nullable=True), schema='travel')
    op.add_column('trips', sa.Column('nights', sa.Integer(), nullable=True), schema='travel')

    op.add_column('itineraries', sa.Column('destination_id', sa.UUID(), nullable=True), schema='travel')
    op.create_foreign_key(
        'itineraries_destination_id_fkey', 'itineraries', 'destinations',
        ['destination_id'], ['id'], source_schema='travel', referent_schema='tourism',
    )
    op.add_column('itineraries', sa.Column('replan_reason', sa.String(), nullable=True), schema='travel')
    op.add_column('itineraries', sa.Column('previous_version', sa.Integer(), nullable=True), schema='travel')

    op.add_column('itinerary_items', sa.Column('day_offset', sa.Integer(), nullable=True), schema='travel')
    op.add_column('itinerary_items', sa.Column('time_of_day', sa.String(length=16), nullable=True), schema='travel')


def downgrade() -> None:
    op.drop_column('itinerary_items', 'time_of_day', schema='travel')
    op.drop_column('itinerary_items', 'day_offset', schema='travel')

    op.drop_column('itineraries', 'previous_version', schema='travel')
    op.drop_column('itineraries', 'replan_reason', schema='travel')
    op.drop_constraint('itineraries_destination_id_fkey', 'itineraries', schema='travel', type_='foreignkey')
    op.drop_column('itineraries', 'destination_id', schema='travel')

    op.drop_column('trips', 'nights', schema='travel')
    op.drop_column('trips', 'days', schema='travel')
    op.drop_column('trips', 'safety_preference', schema='travel')
    op.drop_column('trips', 'pace', schema='travel')
    op.drop_column('trips', 'avoid', schema='travel')
    op.drop_column('trips', 'interests', schema='travel')
