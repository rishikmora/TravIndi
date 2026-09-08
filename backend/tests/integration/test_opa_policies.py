"""Verifies infra/opa/policies/travindi/authz.rego against the confirmed
role-permission matrix (docs/00-planning/08-role-permission-matrix.md §3),
through our own client (app/core/opa.py) against the real running OPA
server — not just reading the Rego and assuming it's correct.
"""

import pytest

from app.api.deps import Principal
from app.core.opa import is_allowed

TOURIST = Principal(user_id="11111111-1111-1111-1111-111111111111", role="tourist")
OTHER_TOURIST = Principal(user_id="22222222-2222-2222-2222-222222222222", role="tourist")
POLICE = Principal(user_id="33333333-3333-3333-3333-333333333333", role="authority_police")
TOURISM_DEPT = Principal(user_id="44444444-4444-4444-4444-444444444444", role="authority_tourism_dept")
VERIFIER = Principal(user_id="55555555-5555-5555-5555-555555555555", role="authority_verifier")
PLATFORM_ADMIN = Principal(user_id="99999999-9999-9999-9999-999999999999", role="authority_platform_admin")


@pytest.mark.parametrize(
    ("principal", "action", "resource_type", "owner_id", "assigned_to", "expected"),
    [
        # Tourist can read/write their own SOS, not someone else's.
        (TOURIST, "read", "sos", TOURIST.user_id, None, True),
        (TOURIST, "write", "sos", TOURIST.user_id, None, True),
        (TOURIST, "read", "sos", OTHER_TOURIST.user_id, None, False),
        (TOURIST, "dispatch", "sos", TOURIST.user_id, None, False),
        # Police/emergency responders get broad read+dispatch on SOS.
        (POLICE, "read", "sos", OTHER_TOURIST.user_id, None, True),
        (POLICE, "dispatch", "sos", OTHER_TOURIST.user_id, None, True),
        # Tourism dept: read-only, no dispatch rights (matrix: "R (analytics only)").
        (TOURISM_DEPT, "read", "sos", OTHER_TOURIST.user_id, None, True),
        (TOURISM_DEPT, "dispatch", "sos", OTHER_TOURIST.user_id, None, False),
        # Incidents: reporter and assignee can read; tourism dept read-only.
        (TOURIST, "read", "incident", TOURIST.user_id, None, True),
        (TOURIST, "read", "incident", OTHER_TOURIST.user_id, POLICE.user_id, False),
        (POLICE, "read", "incident", OTHER_TOURIST.user_id, POLICE.user_id, True),
        (TOURISM_DEPT, "dispatch", "incident", OTHER_TOURIST.user_id, POLICE.user_id, False),
        # Verification: only authority_verifier approves/rejects; owner can submit.
        (VERIFIER, "approve", "verification", OTHER_TOURIST.user_id, None, True),
        (TOURISM_DEPT, "approve", "verification", OTHER_TOURIST.user_id, None, False),
        (TOURIST, "write", "verification", TOURIST.user_id, None, True),
        # Self-owned resources (profile, consents, notification prefs).
        (TOURIST, "read", "self", TOURIST.user_id, None, True),
        (TOURIST, "read", "self", OTHER_TOURIST.user_id, None, False),
        # Reviews: read is open to anyone; only the author can write their own.
        (TOURIST, "read", "review", None, None, True),
        (TOURIST, "write", "review", TOURIST.user_id, None, True),
        (TOURIST, "write", "review", OTHER_TOURIST.user_id, None, False),
        # Fraud cases: reporter RW (own); police/tourism_dept/admin read+dispatch on any.
        (TOURIST, "read", "fraud_case", TOURIST.user_id, None, True),
        (TOURIST, "read", "fraud_case", OTHER_TOURIST.user_id, None, False),
        (TOURIST, "dispatch", "fraud_case", OTHER_TOURIST.user_id, None, False),
        (POLICE, "read", "fraud_case", OTHER_TOURIST.user_id, None, True),
        (POLICE, "dispatch", "fraud_case", OTHER_TOURIST.user_id, None, True),
        (TOURISM_DEPT, "dispatch", "fraud_case", OTHER_TOURIST.user_id, None, True),
        (VERIFIER, "dispatch", "fraud_case", OTHER_TOURIST.user_id, None, False),
        # Service/platform_admin bypass everything.
        (PLATFORM_ADMIN, "dispatch", "sos", OTHER_TOURIST.user_id, None, True),
        (PLATFORM_ADMIN, "read", "self", OTHER_TOURIST.user_id, None, True),
    ],
)
async def test_authz_matches_confirmed_role_matrix(
    principal: Principal, action: str, resource_type: str, owner_id: str, assigned_to: str | None, expected: bool
) -> None:
    result = await is_allowed(
        principal=principal,
        action=action,
        resource_type=resource_type,
        owner_id=owner_id,
        assigned_to=assigned_to,
    )
    assert result is expected
