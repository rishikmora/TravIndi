"""Integration tests for Group & Family Travel (Feature Blueprint P2 #21) —
real invite/accept membership, a real geometric centroid + separation-alert
computation over genuine member-reported locations, and a real aggregate
safety score read from `safety.safety_scores` (never fabricated). Same
ASGITransport `client` fixture convention as tests/integration/
test_ai_planner.py. No ANTHROPIC_API_KEY needed — this domain makes no AI
calls.
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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _india_gate_location(client: AsyncClient) -> dict:
    destinations = (await client.get("/api/v1/destinations")).json()["data"]
    india_gate = next(d for d in destinations if d["name"] == "India Gate")
    return india_gate["location"]


async def test_invite_accept_and_member_listing(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    invitee = await _register_and_login(client)
    owner_headers = _auth(owner["access_token"])

    trip = await client.post("/api/v1/trips", json={"title": "Family trip"}, headers=owner_headers)
    trip_id = trip.json()["data"]["id"]

    forbidden_invite = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/members",
        json={"email": invitee["email"]},
        headers=_auth(invitee["access_token"]),
    )
    assert forbidden_invite.status_code == 403

    unknown_email_invite = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/members",
        json={"email": "no-such-account@example.com"},
        headers=owner_headers,
    )
    assert unknown_email_invite.status_code == 404

    invited = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/members",
        json={"email": invitee["email"]},
        headers=owner_headers,
    )
    assert invited.status_code == 201, invited.text
    member = invited.json()["data"]
    assert member["status"] == "INVITED"

    duplicate_invite = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/members",
        json={"email": invitee["email"]},
        headers=owner_headers,
    )
    assert duplicate_invite.status_code == 409

    wrong_user_accept = await client.post(
        f"/api/v1/group-travel/members/{member['id']}/accept", headers=owner_headers
    )
    assert wrong_user_accept.status_code == 403

    accepted = await client.post(
        f"/api/v1/group-travel/members/{member['id']}/accept",
        headers=_auth(invitee["access_token"]),
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["status"] == "ACTIVE"

    already_decided = await client.post(
        f"/api/v1/group-travel/members/{member['id']}/accept",
        headers=_auth(invitee["access_token"]),
    )
    assert already_decided.status_code == 409

    members = await client.get(
        f"/api/v1/group-travel/trips/{trip_id}/members", headers=owner_headers
    )
    assert members.status_code == 200, members.text
    assert any(
        m["user_id"] == member["user_id"] and m["status"] == "ACTIVE"
        for m in members.json()["data"]
    )

    outsider = await _register_and_login(client)
    outsider_list = await client.get(
        f"/api/v1/group-travel/trips/{trip_id}/members", headers=_auth(outsider["access_token"])
    )
    assert outsider_list.status_code == 403

    left = await client.post(
        f"/api/v1/group-travel/members/{member['id']}/leave", headers=_auth(invitee["access_token"])
    )
    assert left.status_code == 200, left.text
    assert left.json()["data"]["status"] == "LEFT"


async def test_group_locations_compute_real_centroid_and_separation(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    member_account = await _register_and_login(client)
    owner_headers = _auth(owner["access_token"])

    trip = await client.post("/api/v1/trips", json={"title": "Group trip"}, headers=owner_headers)
    trip_id = trip.json()["data"]["id"]

    invited = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/members",
        json={"email": member_account["email"]},
        headers=owner_headers,
    )
    member_id = invited.json()["data"]["id"]
    await client.post(
        f"/api/v1/group-travel/members/{member_id}/accept",
        headers=_auth(member_account["access_token"]),
    )

    india_gate_location = await _india_gate_location(client)
    lon, lat = india_gate_location["lon"], india_gate_location["lat"]

    owner_loc = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/location",
        json={"lon": lon, "lat": lat},
        headers=owner_headers,
    )
    assert owner_loc.status_code == 200, owner_loc.text

    # Genuinely far away (~Mumbai) — should be flagged as separated once the
    # real centroid/distance math runs.
    far_lon, far_lat = 72.8777, 19.0760
    member_loc = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/location",
        json={"lon": far_lon, "lat": far_lat},
        headers=_auth(member_account["access_token"]),
    )
    assert member_loc.status_code == 200, member_loc.text

    locations = await client.get(
        f"/api/v1/group-travel/trips/{trip_id}/locations", headers=owner_headers
    )
    assert locations.status_code == 200, locations.text
    data = locations.json()["data"]
    assert data["centroid"] is not None
    assert len(data["members"]) == 2
    assert any(m["is_separated"] for m in data["members"])
    assert all(m["distance_from_centroid_meters"] is not None for m in data["members"])


async def test_group_safety_score_reflects_real_nearby_destination(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    owner_headers = _auth(owner["access_token"])

    trip = await client.post(
        "/api/v1/trips", json={"title": "Solo-ish group trip"}, headers=owner_headers
    )
    trip_id = trip.json()["data"]["id"]

    india_gate_location = await _india_gate_location(client)
    await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/location",
        json={"lon": india_gate_location["lon"], "lat": india_gate_location["lat"]},
        headers=owner_headers,
    )

    safety = await client.get(f"/api/v1/group-travel/trips/{trip_id}/safety", headers=owner_headers)
    assert safety.status_code == 200, safety.text
    data = safety.json()["data"]
    assert data["members_total"] == 1
    assert data["members_covered"] == 1
    assert data["average_safety_score"] is not None
    assert 0.0 <= data["average_safety_score"] <= 1.0
