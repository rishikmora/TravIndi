"""Integration tests for Lost & Found (Feature Blueprint P2 #26) — real
local sentence-transformers embeddings drive genuine similarity matching
between lost- and found-item reports (app/domains/lost_found/engine.py); a
match is only ever a SUGGESTED row until the reporter confirms or rejects
it, never auto-resolved. Same ASGITransport `client` fixture convention as
tests/integration/test_ai_planner.py. No ANTHROPIC_API_KEY needed — this
domain's embeddings are local, not a Claude call.
"""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient


async def _register_and_login(client: AsyncClient) -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "account_type": "tourist"},
    )
    assert register.status_code == 201, register.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_matching_lost_and_found_reports_produce_a_real_suggested_match(
    client: AsyncClient,
) -> None:
    loser = await _register_and_login(client)
    finder = await _register_and_login(client)
    now = datetime.now(UTC).isoformat()

    # Same wording on purpose: real local embeddings, not a fabricated
    # score — near-identical text is what should reliably clear the
    # engine's cosine-distance threshold.
    lost = await client.post(
        "/api/v1/lost-found/lost-items",
        json={
            "category": "ELECTRONICS",
            "title": "Black Sony noise-cancelling headphones",
            "description": "Lost my black Sony WH-1000XM4 noise-cancelling headphones near the entrance.",
            "lost_at": now,
        },
        headers=_auth(loser["access_token"]),
    )
    assert lost.status_code == 201, lost.text
    lost_item = lost.json()["data"]
    assert lost_item["status"] == "OPEN"

    found = await client.post(
        "/api/v1/lost-found/found-items",
        json={
            "category": "ELECTRONICS",
            "title": "Black Sony noise-cancelling headphones",
            "description": "Found black Sony WH-1000XM4 noise-cancelling headphones near the entrance.",
            "found_at": now,
            "storage_location": "Lost property desk",
        },
        headers=_auth(finder["access_token"]),
    )
    assert found.status_code == 201, found.text
    found_item = found.json()["data"]

    matches = await client.get(
        f"/api/v1/lost-found/lost-items/{lost_item['id']}/matches",
        headers=_auth(loser["access_token"]),
    )
    assert matches.status_code == 200, matches.text
    match_rows = matches.json()["data"]
    assert len(match_rows) >= 1
    match = next(m for m in match_rows if m["found_item"]["id"] == found_item["id"])
    assert match["status"] == "SUGGESTED"
    assert match["similarity_score"] > 0.5

    lost_refetched = await client.get(
        "/api/v1/lost-found/lost-items", headers=_auth(loser["access_token"])
    )
    assert (
        next(i for i in lost_refetched.json()["data"] if i["id"] == lost_item["id"])["status"]
        == "MATCHED"
    )

    confirmed = await client.post(
        f"/api/v1/lost-found/matches/{match['id']}/confirm", headers=_auth(loser["access_token"])
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["status"] == "CONFIRMED"
    assert confirmed.json()["data"]["lost_item"]["status"] == "RESOLVED"
    assert confirmed.json()["data"]["found_item"]["status"] == "CLAIMED"

    already_decided = await client.post(
        f"/api/v1/lost-found/matches/{match['id']}/confirm", headers=_auth(loser["access_token"])
    )
    assert already_decided.status_code == 409

    returned = await client.post(
        f"/api/v1/lost-found/found-items/{found_item['id']}/mark-returned",
        headers=_auth(finder["access_token"]),
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["data"]["status"] == "RETURNED"


async def test_lost_items_list_is_scoped_to_reporter(client: AsyncClient) -> None:
    reporter = await _register_and_login(client)
    stranger = await _register_and_login(client)
    now = datetime.now(UTC).isoformat()

    report = await client.post(
        "/api/v1/lost-found/lost-items",
        json={
            "category": "DOCUMENTS",
            "title": "Blue passport",
            "description": "Lost my blue passport somewhere near the ticket counter.",
            "lost_at": now,
        },
        headers=_auth(reporter["access_token"]),
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["data"]["id"]

    own_list = await client.get(
        "/api/v1/lost-found/lost-items", headers=_auth(reporter["access_token"])
    )
    assert any(i["id"] == report_id for i in own_list.json()["data"])

    stranger_list = await client.get(
        "/api/v1/lost-found/lost-items", headers=_auth(stranger["access_token"])
    )
    assert all(i["id"] != report_id for i in stranger_list.json()["data"])

    stranger_matches = await client.get(
        f"/api/v1/lost-found/lost-items/{report_id}/matches",
        headers=_auth(stranger["access_token"]),
    )
    assert stranger_matches.status_code == 403


async def test_found_item_in_a_different_category_is_never_offered_as_a_match(
    client: AsyncClient,
) -> None:
    """The engine scopes candidates to the same category before it ever
    scores text similarity (app/domains/lost_found/engine.py's `.where(
    FoundItemReport.category == lost_item.category, ...)`) — a deterministic
    guarantee, unlike "these two descriptions are dissimilar enough," which
    a real embedding model can surprise you on (near-synonymous jewellery
    descriptions scored above the threshold during this test's own
    development)."""
    loser = await _register_and_login(client)
    finder = await _register_and_login(client)
    now = datetime.now(UTC).isoformat()

    lost = await client.post(
        "/api/v1/lost-found/lost-items",
        json={
            "category": "ELECTRONICS",
            "title": "Gold wedding ring",
            "description": "Lost a gold wedding ring, engraved with initials, while at the market.",
            "lost_at": now,
        },
        headers=_auth(loser["access_token"]),
    )
    assert lost.status_code == 201, lost.text
    lost_item = lost.json()["data"]

    # Same title/description text as the lost item above (so a real
    # similarity score would be ~1.0), but a different category — must
    # still never surface as a match.
    different_category_found = await client.post(
        "/api/v1/lost-found/found-items",
        json={
            "category": "JEWELRY",
            "title": "Gold wedding ring",
            "description": "Lost a gold wedding ring, engraved with initials, while at the market.",
            "found_at": now,
        },
        headers=_auth(finder["access_token"]),
    )
    assert different_category_found.status_code == 201, different_category_found.text

    matches = await client.get(
        f"/api/v1/lost-found/lost-items/{lost_item['id']}/matches",
        headers=_auth(loser["access_token"]),
    )
    assert matches.status_code == 200, matches.text
    assert matches.json()["data"] == []
