"""let a blocked user see blocks against them

`user_blocks_owner_or_service`'s original `USING` clause only let the
*blocker* see their own block rows (`blocker_user_id = current_user`).
That's wrong for the actual use this table serves: `_is_blocked_between`
(app/domains/chat/router.py) checks both directions so a DM is blocked
symmetrically, but under the original policy the *blocked* party's own
`GET`/query never sees the row at all (RLS filters it out before the
symmetric OR in the WHERE clause even runs) — so a blocked user could
still create a DIRECT conversation with the person who blocked them,
confirmed by a real, failing test
(`test_blocked_user_cannot_start_or_send_direct_message`'s reverse-
direction assertion). `WITH CHECK` stays blocker-only (only the blocker
may create/delete a block); `USING` now also allows the blocked party to
see that a row naming them exists.

Revision ID: aad140e85f39
Revises: 17b5366b74d1
Create Date: 2026-09-11 15:35:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'aad140e85f39'
down_revision: str | None = '17b5366b74d1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SERVICE_BYPASS = "current_setting('app.user_role', true) IN ('service', 'authority_platform_admin')"
_CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("DROP POLICY user_blocks_owner_or_service ON chat.user_blocks")
    op.execute(f"""
        CREATE POLICY user_blocks_owner_or_service ON chat.user_blocks
        USING ({_SERVICE_BYPASS} OR blocker_user_id = {_CURRENT_USER} OR blocked_user_id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR blocker_user_id = {_CURRENT_USER})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY user_blocks_owner_or_service ON chat.user_blocks")
    op.execute(f"""
        CREATE POLICY user_blocks_owner_or_service ON chat.user_blocks
        USING ({_SERVICE_BYPASS} OR blocker_user_id = {_CURRENT_USER})
        WITH CHECK ({_SERVICE_BYPASS} OR blocker_user_id = {_CURRENT_USER})
    """)
