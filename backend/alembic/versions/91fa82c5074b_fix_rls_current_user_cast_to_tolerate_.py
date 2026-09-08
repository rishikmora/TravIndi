"""fix rls current_user cast to tolerate empty-string guc after pooled connection reuse

Revision ID: 91fa82c5074b
Revises: 21a117722d9d
Create Date: 2026-09-07 22:59:18.006362

Real bug found while building the Phase 16 authority dashboard: Phase 7's
RLS policies (b797776b9c1d) cast `current_setting('app.current_user_id',
true)::uuid` directly, on the documented assumption that an unset GUC
reads back as NULL. That assumption only holds for a connection that has
*never* had the GUC touched. `get_rls_session` sets it via `set_config(...,
true)` — transaction-local — and once a pooled connection has done that
even once, PostgreSQL reverts the GUC to the empty string `''` (not NULL)
after that transaction ends, for the remaining lifetime of that physical
connection. Verified directly:

    SELECT set_config('app.current_user_id', 'abc', true); COMMIT;
    -- next transaction on the same connection:
    SELECT current_setting('app.current_user_id', true);  --> '' , not NULL

Casting `''::uuid` raises `invalid input syntax for type uuid`, so any
plain (non-RLS) query against an RLS-protected table — e.g. the authority
dashboard's aggregate counts, which intentionally use no principal-scoped
session — could hit a connection previously "tainted" by an RLS-aware
request and crash instead of correctly seeing zero owned rows. Every prior
RLS-touching code path happened to always call `get_rls_session` first
(re-setting both GUCs every request), which is exactly why this stayed
latent since Phase 7.

Fix: wrap the read in `NULLIF(..., '')` before casting, so an empty string
maps to a real NULL and the cast never fails — NULL still correctly fails
every equality check in these policies (fail-closed is preserved, nothing
about the actual authorization logic changes).
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '91fa82c5074b'
down_revision: str | None = '21a117722d9d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_CURRENT_USER = "current_setting('app.current_user_id', true)::uuid"
_NEW_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"
_CURRENT_ROLE = "current_setting('app.user_role', true)"
_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"


def upgrade() -> None:
    op.execute(f"""
        ALTER POLICY users_self_or_service ON identity.users
        USING ({_SERVICE_BYPASS} OR id = {_NEW_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR id = {_NEW_CURRENT_USER})
    """)
    op.execute(f"""
        ALTER POLICY user_profiles_self_or_service ON identity.user_profiles
        USING ({_SERVICE_BYPASS} OR user_id = {_NEW_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_NEW_CURRENT_USER})
    """)
    op.execute(f"""
        ALTER POLICY incidents_read ON safety.incidents
        USING (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_NEW_CURRENT_USER}
            OR assigned_to_user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder', 'authority_tourism_dept')
        )
    """)
    op.execute(f"""
        ALTER POLICY incidents_write ON safety.incidents
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)
    op.execute(f"""
        ALTER POLICY incidents_update ON safety.incidents
        USING (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_NEW_CURRENT_USER}
            OR assigned_to_user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_NEW_CURRENT_USER}
            OR assigned_to_user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)
    op.execute(f"""
        ALTER POLICY sos_requests_read ON emergency.sos_requests
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder', 'authority_tourism_dept')
        )
    """)
    op.execute(f"""
        ALTER POLICY sos_requests_write ON emergency.sos_requests
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_NEW_CURRENT_USER})
    """)
    op.execute(f"""
        ALTER POLICY sos_requests_update ON emergency.sos_requests
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR user_id = {_NEW_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)


def downgrade() -> None:
    op.execute(f"""
        ALTER POLICY users_self_or_service ON identity.users
        USING ({_SERVICE_BYPASS} OR id = {_OLD_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR id = {_OLD_CURRENT_USER})
    """)
    op.execute(f"""
        ALTER POLICY user_profiles_self_or_service ON identity.user_profiles
        USING ({_SERVICE_BYPASS} OR user_id = {_OLD_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_OLD_CURRENT_USER})
    """)
    op.execute(f"""
        ALTER POLICY incidents_read ON safety.incidents
        USING (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_OLD_CURRENT_USER}
            OR assigned_to_user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder', 'authority_tourism_dept')
        )
    """)
    op.execute(f"""
        ALTER POLICY incidents_write ON safety.incidents
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)
    op.execute(f"""
        ALTER POLICY incidents_update ON safety.incidents
        USING (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_OLD_CURRENT_USER}
            OR assigned_to_user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_OLD_CURRENT_USER}
            OR assigned_to_user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)
    op.execute(f"""
        ALTER POLICY sos_requests_read ON emergency.sos_requests
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder', 'authority_tourism_dept')
        )
    """)
    op.execute(f"""
        ALTER POLICY sos_requests_write ON emergency.sos_requests
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_OLD_CURRENT_USER})
    """)
    op.execute(f"""
        ALTER POLICY sos_requests_update ON emergency.sos_requests
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR user_id = {_OLD_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)
