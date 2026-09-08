"""row level security on high sensitivity tables

Enables PostgreSQL RLS on the 5 tables confirmed in
docs/00-planning/09-database-schema-plan.md §5: identity.users,
identity.user_profiles, identity.trusted_contact_access_tokens,
safety.incidents, emergency.sos_requests — as a defense-in-depth backstop
behind the OPA/application-layer authorization that does the primary work
(docs/00-planning/08-role-permission-matrix.md).

Session contract (to be set per-request by Phase 9's auth middleware, e.g.
via `SET LOCAL app.current_user_id = ...` inside the request's transaction):
  app.current_user_id — UUID of the authenticated principal, or unset
  app.user_role     — one of: tourist | guide | business |
                          authority_police | authority_emergency_responder |
                          authority_tourism_dept | authority_municipality |
                          authority_verifier | authority_platform_admin |
                          service (background workers / trusted internal jobs)

Fails closed: `current_setting(..., true)` returns NULL when the app hasn't
set a session variable yet (e.g. Phase 7/8 code with no auth wired up), and
every policy below evaluates to NULL/false in that case — no rows are
visible until Phase 9 actually sets these variables. FORCE ROW LEVEL
SECURITY is applied so this holds even for the table-owning DB role that the
application connects as (Postgres exempts owners from RLS by default).

Revision ID: b797776b9c1d
Revises: 3c27907ea6bb
Create Date: 2026-09-07 06:29:10.987038
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b797776b9c1d'
down_revision: str | None = '3c27907ea6bb'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "current_setting('app.current_user_id', true)::uuid"
_CURRENT_ROLE = "current_setting('app.user_role', true)"


def upgrade() -> None:
    # --- identity.users ---
    op.execute("ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.users FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY users_self_or_service ON identity.users
        USING ({_SERVICE_BYPASS} OR id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR id = {_CURRENT_USER})
    """)

    # --- identity.user_profiles ---
    op.execute("ALTER TABLE identity.user_profiles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.user_profiles FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY user_profiles_self_or_service ON identity.user_profiles
        USING ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
    """)

    # --- identity.trusted_contact_access_tokens ---
    # No ordinary tourist/authority session has a legitimate reason to read
    # raw token rows directly; verification happens through a dedicated
    # service-role code path that looks up by token_hash
    # (docs/00-planning/08-role-permission-matrix.md §1). Service/admin only.
    op.execute("ALTER TABLE identity.trusted_contact_access_tokens ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.trusted_contact_access_tokens FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY trusted_contact_tokens_service_only ON identity.trusted_contact_access_tokens
        USING ({_SERVICE_BYPASS})
        WITH CHECK ({_SERVICE_BYPASS})
    """)

    # --- safety.incidents ---
    # Read: reporter, the assigned operator, police/emergency responders, and
    # tourism_dept (read-only analytics per the confirmed role matrix).
    # Write: reporter (their own report), assigned operator, police/emergency
    # responders, and service/admin — tourism_dept is deliberately excluded
    # from the write policy (matrix: "R (analytics only)", no dispatch rights).
    # No DELETE policy is defined for this table (or sos_requests below) —
    # under RLS, a command with zero matching policies is denied outright,
    # so travindi_app can never hard-delete an incident/SOS row. This is
    # deliberate: these are audit/emergency records that must be retained
    # (docs/00-planning/09-database-schema-plan.md §4 "never hard-delete
    # audit/emergency records"). A genuine data-retention purge, if ever
    # needed, runs as the DB owner role outside the app's normal path.
    op.execute("ALTER TABLE safety.incidents ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE safety.incidents FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY incidents_read ON safety.incidents FOR SELECT
        USING (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_CURRENT_USER}
            OR assigned_to_user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder', 'authority_tourism_dept')
        )
    """)
    op.execute(f"""
        CREATE POLICY incidents_write ON safety.incidents FOR INSERT
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)
    op.execute(f"""
        CREATE POLICY incidents_update ON safety.incidents FOR UPDATE
        USING (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_CURRENT_USER}
            OR assigned_to_user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR reporter_user_id = {_CURRENT_USER}
            OR assigned_to_user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)

    # --- emergency.sos_requests ---
    # Read: the tourist who created it, plus police/emergency_responder (any,
    # per the matrix's broad "RU + dispatch" grant) and tourism_dept
    # (analytics only). Trusted-contact access does NOT go through this
    # table's RLS at all — it's mediated entirely by the token-verification
    # endpoint (service role), never a direct session on this table.
    op.execute("ALTER TABLE emergency.sos_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE emergency.sos_requests FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY sos_requests_read ON emergency.sos_requests FOR SELECT
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder', 'authority_tourism_dept')
        )
    """)
    op.execute(f"""
        CREATE POLICY sos_requests_write ON emergency.sos_requests FOR INSERT
        WITH CHECK ({_SERVICE_BYPASS} OR user_id = {_CURRENT_USER})
    """)
    op.execute(f"""
        CREATE POLICY sos_requests_update ON emergency.sos_requests FOR UPDATE
        USING (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
        WITH CHECK (
            {_SERVICE_BYPASS}
            OR user_id = {_CURRENT_USER}
            OR {_CURRENT_ROLE} IN ('authority_police', 'authority_emergency_responder')
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS sos_requests_update ON emergency.sos_requests")
    op.execute("DROP POLICY IF EXISTS sos_requests_write ON emergency.sos_requests")
    op.execute("DROP POLICY IF EXISTS sos_requests_read ON emergency.sos_requests")
    op.execute("ALTER TABLE emergency.sos_requests NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE emergency.sos_requests DISABLE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS incidents_update ON safety.incidents")
    op.execute("DROP POLICY IF EXISTS incidents_write ON safety.incidents")
    op.execute("DROP POLICY IF EXISTS incidents_read ON safety.incidents")
    op.execute("ALTER TABLE safety.incidents NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE safety.incidents DISABLE ROW LEVEL SECURITY")

    op.execute(
        "DROP POLICY IF EXISTS trusted_contact_tokens_service_only ON identity.trusted_contact_access_tokens"
    )
    op.execute("ALTER TABLE identity.trusted_contact_access_tokens NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.trusted_contact_access_tokens DISABLE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS user_profiles_self_or_service ON identity.user_profiles")
    op.execute("ALTER TABLE identity.user_profiles NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.user_profiles DISABLE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS users_self_or_service ON identity.users")
    op.execute("ALTER TABLE identity.users NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.users DISABLE ROW LEVEL SECURITY")
