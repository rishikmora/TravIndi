"""Integration tests for the gamification domain (Feature Blueprint P2 #15/
#26 — Tourism Passport, digital stamps, badges, points, challenges,
leaderboard) and the destination "virtual explore" points hook
(app/domains/tourism/router.py). Same ASGITransport `client` fixture
convention as tests/integration/test_ai_planner.py. Requires
`docker compose --profile full up -d` and `python -m app.db.seed`
(destinations/gamification seed data) — no ANTHROPIC_API_KEY needed, this
domain makes no AI calls.
"""

import uuid

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


async def _india_gate(client: AsyncClient) -> dict:
    listing = (await client.get("/api/v1/destinations")).json()
    return next(d for d in listing["data"] if d["name"] == "India Gate")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_check_in_too_far_from_destination_is_rejected(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    india_gate = await _india_gate(client)

    response = await client.post(
        "/api/v1/gamification/check-ins",
        # Roughly Mumbai — genuinely far from Delhi's India Gate, well
        # outside the 5km check-in radius.
        json={"destination_id": india_gate["id"], "lon": 72.8777, "lat": 19.0760},
        headers=_auth(session["access_token"]),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CHECK_IN_TOO_FAR"


async def test_first_check_in_awards_points_and_first_steps_badge_then_repeat_visit_does_not(
    client: AsyncClient,
) -> None:
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])
    india_gate = await _india_gate(client)
    lon, lat = india_gate["location"]["lon"], india_gate["location"]["lat"]

    first = await client.post(
        "/api/v1/gamification/check-ins",
        json={"destination_id": india_gate["id"], "lon": lon, "lat": lat},
        headers=headers,
    )
    assert first.status_code == 201, first.text
    first_data = first.json()["data"]
    assert first_data["points_awarded"] == 20
    first_steps_badge = next(
        (b for b in first_data["new_badges"] if b["code"] == "first_steps"), None
    )
    assert first_steps_badge is not None
    # points_awarded on the check-in response is just the check-in's own
    # constant (20) — the badge itself carries its own points_value, added
    # to the ledger separately (real bug-shaped surprise this test pins).
    expected_total = first_data["points_awarded"] + first_steps_badge["points_value"]

    me = await client.get("/api/v1/gamification/me", headers=headers)
    assert me.status_code == 200, me.text
    assert me.json()["data"]["points"]["total_points"] == expected_total
    assert me.json()["data"]["destinations_visited"] == 1

    repeat = await client.post(
        "/api/v1/gamification/check-ins",
        json={"destination_id": india_gate["id"], "lon": lon, "lat": lat},
        headers=headers,
    )
    assert repeat.status_code == 201, repeat.text
    repeat_data = repeat.json()["data"]
    assert repeat_data["points_awarded"] == 0
    assert repeat_data["new_badges"] == []

    me_after_repeat = await client.get("/api/v1/gamification/me", headers=headers)
    # The repeat visit is recorded (real history) but never double-paid.
    assert me_after_repeat.json()["data"]["points"]["total_points"] == expected_total


async def test_virtual_explore_is_idempotent_per_user_and_destination(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])
    india_gate = await _india_gate(client)

    first = await client.post(f"/api/v1/destinations/{india_gate['id']}/explore", headers=headers)
    assert first.status_code == 200, first.text
    first_data = first.json()["data"]
    assert first_data["points_awarded"] == 5
    assert first_data["already_explored"] is False

    second = await client.post(f"/api/v1/destinations/{india_gate['id']}/explore", headers=headers)
    assert second.status_code == 200, second.text
    second_data = second.json()["data"]
    assert second_data["points_awarded"] == 0
    assert second_data["already_explored"] is True

    me = await client.get("/api/v1/gamification/me", headers=headers)
    assert me.json()["data"]["points"]["total_points"] == 5


async def test_leaderboard_reflects_real_points_and_is_ordered(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])
    india_gate = await _india_gate(client)

    await client.post(f"/api/v1/destinations/{india_gate['id']}/explore", headers=headers)

    leaderboard = await client.get("/api/v1/gamification/leaderboard")
    assert leaderboard.status_code == 200, leaderboard.text
    entries = leaderboard.json()["data"]
    assert len(entries) >= 1
    totals = [e["total_points"] for e in entries]
    assert totals == sorted(totals, reverse=True)
    ranks = [e["rank"] for e in entries]
    assert ranks == list(range(1, len(entries) + 1))


async def test_badges_and_challenges_listings_are_real_seeded_data(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])

    badges = await client.get("/api/v1/gamification/badges")
    assert badges.status_code == 200, badges.text
    badge_codes = {b["code"] for b in badges.json()["data"]}
    assert "first_steps" in badge_codes

    challenges = await client.get("/api/v1/gamification/challenges", headers=headers)
    assert challenges.status_code == 200, challenges.text
    for challenge in challenges.json()["data"]:
        assert challenge["my_progress_count"] == 0
        assert challenge["my_completed_at"] is None
