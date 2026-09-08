"""Proves `app.api.deps.get_rls_session` — not just the raw SQL pattern
(already verified manually in Phase 7) — actually sets the RLS session
variables PostgreSQL enforces against (Phase 7's `travindi_app` role +
policies). Drives the dependency's async generator directly, the same way
FastAPI would.
"""

from sqlalchemy import text

from app.api.deps import Principal, get_rls_session
from app.db.session import get_db_session

# Fixed IDs so re-running this suite is idempotent (ON CONFLICT DO NOTHING)
# rather than accumulating a new row per run — travindi_app has no DELETE
# policy on sos_requests at all (Phase 7's deliberate never-hard-delete
# design), so there's nothing to clean up after, by design.
_TEST_SOS_ID = "00000000-0000-0000-0000-0000000000f1"
_OWNER = Principal(user_id="77777777-7777-7777-7777-777777777777", role="tourist")
_STRANGER = Principal(user_id="88888888-8888-8888-8888-888888888888", role="tourist")


async def test_get_rls_session_sets_current_user_and_role() -> None:
    principal = Principal(user_id="66666666-6666-6666-6666-666666666666", role="tourist")

    db_gen = get_db_session()
    session = await anext(db_gen)
    try:
        rls_gen = get_rls_session(principal=principal, session=session)
        rls_session = await anext(rls_gen)

        result = await rls_session.execute(
            text("SELECT current_setting('app.current_user_id', true), current_setting('app.user_role', true)")
        )
        user_id, role = result.one()
        assert user_id == principal.user_id
        assert role == principal.role
    finally:
        await db_gen.aclose()


async def _count_visible_sos(principal: Principal, owner_id: str) -> int:
    db_gen = get_db_session()
    session = await anext(db_gen)
    try:
        rls_gen = get_rls_session(principal=principal, session=session)
        rls_session = await anext(rls_gen)
        result = await rls_session.execute(
            text("SELECT count(*) FROM emergency.sos_requests WHERE user_id = CAST(:uid AS uuid)").bindparams(
                uid=owner_id
            )
        )
        return result.scalar_one()
    finally:
        await db_gen.aclose()


async def test_get_rls_session_actually_gates_sos_requests_table() -> None:
    """End-to-end: real Principals, run through the real dependency,
    against the real RLS policy from Phase 7 — a tourist session can only
    see their own SOS rows, never a stranger's."""
    db_gen = get_db_session()
    session = await anext(db_gen)
    try:
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        # sos_requests.user_id FKs to identity.users — seed the owner first.
        await session.execute(
            text(
                "INSERT INTO identity.users (id, account_type, status) "
                "VALUES (CAST(:uid AS uuid), 'tourist', 'ACTIVE') ON CONFLICT (id) DO NOTHING"
            ).bindparams(uid=_OWNER.user_id)
        )
        # CAST(... AS uuid), not `:id::uuid` — SQLAlchemy's text() treats a
        # doubled colon as an escaped literal colon, which swallows the
        # `::uuid` Postgres cast shorthand and the preceding bind marker
        # along with it.
        await session.execute(
            text(
                "INSERT INTO emergency.sos_requests (id, user_id, status, location) "
                "VALUES (CAST(:id AS uuid), CAST(:uid AS uuid), 'CREATED', ST_GeogFromText('POINT(77.2 28.6)')) "
                "ON CONFLICT (id) DO NOTHING"
            ).bindparams(id=_TEST_SOS_ID, uid=_OWNER.user_id)
        )
        await session.commit()
    finally:
        await db_gen.aclose()

    assert await _count_visible_sos(_OWNER, _OWNER.user_id) >= 1
    assert await _count_visible_sos(_STRANGER, _OWNER.user_id) == 0
