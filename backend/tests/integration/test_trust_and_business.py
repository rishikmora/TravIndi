"""Integration tests for the P1 business directory + trust (verification,
reviews, fraud cases) feature-gap pass — real Postgres, real OPA server,
real Claude calls for the AI enrichment paths (review authenticity, fraud
triage), same philosophy as tests/integration/test_ai_planner.py. Requires
`docker compose --profile full up -d` from infra/ and ANTHROPIC_API_KEY set
in backend/.env.

Approvals/rejections/dispatches are exercised via `test-admin`
(authority_platform_admin) rather than a dedicated authority_verifier
fixture — infra/keycloak/realm-export.json has no pre-seeded verifier user,
and the platform admin role already bypasses every OPA rule (the
`service_roles` clause at the top of infra/opa/policies/travindi/authz.rego),
so it exercises the same code path without needing new Keycloak fixture data
and a realm re-import.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import get_session_factory
from tests.integration.test_sos_and_incidents import _decode_sub, _login_police


async def _register_and_login(client: AsyncClient, account_type: str = "tourist") -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"
    register = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password, "account_type": account_type}
    )
    assert register.status_code == 201, register.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


async def _login_admin(client: AsyncClient) -> dict:
    """Same `_ensure_local_user`-style pattern as
    tests/integration/test_sos_and_incidents.py's `_login_police` — the
    pre-seeded Keycloak fixture user has no local `identity.users` row, but
    `approve_verification`/`reject_verification` write `reviewed_by_user_id`
    as a real FK into that table."""
    login = await client.post("/api/v1/auth/login", json={"email": "test-admin@example.com", "password": "Test1234!"})
    assert login.status_code == 200, login.text
    data = login.json()["data"]
    user_id = _decode_sub(data["access_token"])
    async with get_session_factory()() as session:
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        await session.execute(
            text(
                "INSERT INTO identity.users (id, account_type, status) "
                "VALUES (CAST(:uid AS uuid), 'authority', 'ACTIVE') ON CONFLICT (id) DO NOTHING"
            ).bindparams(uid=user_id)
        )
        await session.commit()
    return {"user_id": user_id, **data}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_business(client: AsyncClient, owner: dict, name: str | None = None) -> dict:
    response = await client.post(
        "/api/v1/businesses",
        json={"name": name or f"Test Hotel {uuid.uuid4().hex[:6]}", "category": "HOTEL"},
        headers=_auth(owner["access_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def test_only_business_role_can_register_a_business(client: AsyncClient) -> None:
    tourist = await _register_and_login(client, "tourist")
    denied = await client.post(
        "/api/v1/businesses", json={"name": "Not Allowed", "category": "HOTEL"}, headers=_auth(tourist["access_token"])
    )
    assert denied.status_code == 403

    owner = await _register_and_login(client, "business")
    business = await _create_business(client, owner)
    assert business["is_verified"] is False
    assert business["owner_user_id"] == _decode_sub(owner["access_token"])


async def test_business_directory_list_and_get(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    business = await _create_business(client, owner)

    fetched = await client.get(f"/api/v1/businesses/{business['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["data"]["name"] == business["name"]

    listing = await client.get("/api/v1/businesses")
    assert listing.status_code == 200
    assert any(b["id"] == business["id"] for b in listing.json()["data"])


async def test_verification_submit_ownership_enforced(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    other_owner = await _register_and_login(client, "business")
    business = await _create_business(client, owner)

    forbidden = await client.post(
        "/api/v1/trust/verifications",
        json={"subject_type": "BUSINESS", "subject_id": business["id"]},
        headers=_auth(other_owner["access_token"]),
    )
    assert forbidden.status_code == 403

    submitted = await client.post(
        "/api/v1/trust/verifications",
        json={"subject_type": "BUSINESS", "subject_id": business["id"]},
        headers=_auth(owner["access_token"]),
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["data"]["status"] == "PENDING"


async def test_verification_approve_flips_business_verified_flag(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    business = await _create_business(client, owner)
    admin = await _login_admin(client)

    submitted = await client.post(
        "/api/v1/trust/verifications",
        json={"subject_type": "BUSINESS", "subject_id": business["id"]},
        headers=_auth(owner["access_token"]),
    )
    verification_id = submitted.json()["data"]["id"]

    approved = await client.post(
        f"/api/v1/trust/verifications/{verification_id}/approve", headers=_auth(admin["access_token"])
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["status"] == "APPROVED"

    fetched = await client.get(f"/api/v1/businesses/{business['id']}")
    assert fetched.json()["data"]["is_verified"] is True

    already_decided = await client.post(
        f"/api/v1/trust/verifications/{verification_id}/approve", headers=_auth(admin["access_token"])
    )
    assert already_decided.status_code == 409


async def test_verification_reject_records_reason(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    business = await _create_business(client, owner)
    admin = await _login_admin(client)

    submitted = await client.post(
        "/api/v1/trust/verifications",
        json={"subject_type": "BUSINESS", "subject_id": business["id"]},
        headers=_auth(owner["access_token"]),
    )
    verification_id = submitted.json()["data"]["id"]

    rejected = await client.post(
        f"/api/v1/trust/verifications/{verification_id}/reject",
        json={"reason": "Documents did not match business name."},
        headers=_auth(admin["access_token"]),
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["data"]["status"] == "REJECTED"
    assert rejected.json()["data"]["rejection_reason"] == "Documents did not match business name."

    fetched = await client.get(f"/api/v1/businesses/{business['id']}")
    assert fetched.json()["data"]["is_verified"] is False


async def test_review_create_and_authenticity_analysis_visible_to_author(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    business = await _create_business(client, owner)
    author = await _register_and_login(client, "tourist")
    stranger = await _register_and_login(client, "tourist")

    created = await client.post(
        "/api/v1/trust/reviews",
        json={"target_type": "BUSINESS", "target_id": business["id"], "rating": 5, "body": "Wonderful stay, very clean rooms and friendly staff."},
        headers=_auth(author["access_token"]),
    )
    assert created.status_code == 201, created.text
    review = created.json()["data"]
    assert review["rating"] == 5
    # A real Claude call was made (ANTHROPIC_API_KEY is configured in this
    # dev environment) — the author should see the resulting signal.
    assert review["analysis"] is not None
    assert 0.0 <= review["analysis"]["authenticity_score"] <= 1.0

    listing_as_stranger = await client.get(
        "/api/v1/trust/reviews",
        params={"target_type": "BUSINESS", "target_id": business["id"]},
        headers=_auth(stranger["access_token"]),
    )
    assert listing_as_stranger.status_code == 200
    fetched_review = next(r for r in listing_as_stranger.json()["data"] if r["id"] == review["id"])
    # A non-author, non-authority viewer must not see the moderation signal.
    assert fetched_review["analysis"] is None


async def test_fraud_case_report_list_scoping_and_resolve(client: AsyncClient) -> None:
    reporter = await _register_and_login(client, "tourist")
    other_tourist = await _register_and_login(client, "tourist")
    police = await _login_police(client)

    reported = await client.post(
        "/api/v1/trust/fraud-cases",
        json={"subject_type": "business", "description": "This taxi driver charged triple the meter rate and refused a receipt."},
        headers=_auth(reporter["access_token"]),
    )
    assert reported.status_code == 201, reported.text
    case = reported.json()["data"]
    assert case["status"] == "OPEN"
    assert len(case["signals"]) >= 1

    # The reporter can see their own case; a different tourist cannot.
    own_get = await client.get(f"/api/v1/trust/fraud-cases/{case['id']}", headers=_auth(reporter["access_token"]))
    assert own_get.status_code == 200
    stranger_get = await client.get(f"/api/v1/trust/fraud-cases/{case['id']}", headers=_auth(other_tourist["access_token"]))
    assert stranger_get.status_code == 403

    # list_fraud_cases scopes to own reports for a plain tourist.
    own_list = await client.get("/api/v1/trust/fraud-cases", headers=_auth(reporter["access_token"]))
    assert any(c["id"] == case["id"] for c in own_list.json()["data"])
    other_list = await client.get("/api/v1/trust/fraud-cases", headers=_auth(other_tourist["access_token"]))
    assert all(c["id"] != case["id"] for c in other_list.json()["data"])

    # A plain tourist cannot resolve; police (dispatch role) can.
    forbidden_resolve = await client.post(
        f"/api/v1/trust/fraud-cases/{case['id']}/resolve",
        json={"outcome": "CONFIRMED"},
        headers=_auth(reporter["access_token"]),
    )
    assert forbidden_resolve.status_code == 403

    resolved = await client.post(
        f"/api/v1/trust/fraud-cases/{case['id']}/resolve",
        json={"outcome": "CONFIRMED"},
        headers=_auth(police["access_token"]),
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["data"]["status"] == "CONFIRMED"

    already_resolved = await client.post(
        f"/api/v1/trust/fraud-cases/{case['id']}/resolve",
        json={"outcome": "DISMISSED"},
        headers=_auth(police["access_token"]),
    )
    assert already_resolved.status_code == 409


async def test_ai_tourist_guide_answers_grounded_question(client: AsyncClient) -> None:
    tourist = await _register_and_login(client, "tourist")
    destinations = (await client.get("/api/v1/destinations")).json()["data"]
    india_gate = next(d for d in destinations if d["name"] == "India Gate")

    response = await client.post(
        "/api/v1/ai/guide/ask",
        json={"question": "What is India Gate known for?", "destination_id": india_gate["id"]},
        headers=_auth(tourist["access_token"]),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["answer"]


async def test_translate_text_returns_non_empty_translation(client: AsyncClient) -> None:
    tourist = await _register_and_login(client, "tourist")
    response = await client.post(
        "/api/v1/ai/translate",
        json={"text": "Where is the nearest hospital?", "target_language": "Hindi"},
        headers=_auth(tourist["access_token"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["translated_text"]
