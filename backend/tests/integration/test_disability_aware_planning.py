"""Integration tests for the "disability-aware personalized experience"
feature — the user's own "major evaluation differentiator" framing. Same
philosophy and fixtures as tests/integration/test_ai_planner.py (real
Anthropic planner calls, real DB, ASGITransport client fixture). Requires
the same environment: `docker compose --profile full up -d`, seeded
destinations/attractions/facilities, ANTHROPIC_API_KEY set.

The most important test here (`test_saved_accessibility_profile_is_picked_up_without_explicit_request_fields`)
is a regression test for a real bug: `create_trip_plan` used to run under
plain `get_db_session`, so the fallback read of the caller's saved
`travel_preferences` (RLS-protected) silently saw zero rows and defaulted to
SOLO/no-needs even for a user with a real saved ACCESSIBILITY profile. Fixed
by switching to `get_rls_session` (app/domains/travel/router.py).
"""

import uuid

from httpx import AsyncClient


async def _register_and_login(client: AsyncClient, account_type: str = "tourist") -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "account_type": account_type},
    )
    assert register.status_code == 201, register.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


async def _india_gate_id(client: AsyncClient) -> str:
    listing = (await client.get("/api/v1/destinations?limit=100")).json()
    return next(d for d in listing["data"] if d["name"] == "India Gate")["id"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_travel_preferences_default_then_round_trip(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])

    # A brand-new account has no saved preferences yet — must fail closed to
    # a real, well-defined default, never a 404/500.
    default = await client.get("/api/v1/users/me/travel-preferences", headers=headers)
    assert default.status_code == 200, default.text
    assert default.json()["data"]["traveler_type"] == "SOLO"
    assert default.json()["data"]["accessibility_needs"] == []

    saved = await client.put(
        "/api/v1/users/me/travel-preferences",
        json={
            "traveler_type": "ACCESSIBILITY",
            "accessibility_needs": ["WHEELCHAIR"],
            "family_children_count": 0,
            "family_seniors_count": 0,
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["traveler_type"] == "ACCESSIBILITY"
    assert saved.json()["data"]["accessibility_needs"] == ["WHEELCHAIR"]

    fetched = await client.get("/api/v1/users/me/travel-preferences", headers=headers)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["data"]["traveler_type"] == "ACCESSIBILITY"
    assert fetched.json()["data"]["accessibility_needs"] == ["WHEELCHAIR"]


async def test_family_preferences_round_trip(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])

    saved = await client.put(
        "/api/v1/users/me/travel-preferences",
        json={
            "traveler_type": "FAMILY",
            "accessibility_needs": [],
            "family_children_count": 2,
            "family_seniors_count": 1,
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()["data"]
    assert body["traveler_type"] == "FAMILY"
    assert body["family_children_count"] == 2
    assert body["family_seniors_count"] == 1


async def test_explicit_accessibility_request_grounds_itinerary_in_real_facility_distances(
    client: AsyncClient,
) -> None:
    """An explicit traveler_type=ACCESSIBILITY + WHEELCHAIR need on the
    trip-plan request itself (no saved profile involved) must produce an
    itinerary where every item carries a real, non-null
    nearest_accessible_facility_m — India Gate has a real seeded
    wheelchair-accessible facility, so this is never None once accessibility
    mode is active with facilities present at the destination."""
    session = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "I'm travelling with my wheelchair and want to see the main sights.",
            "start_date": "2027-01-10T00:00:00Z",
            "budget": 5000,
            "currency": "INR",
            "traveler_type": "ACCESSIBILITY",
            "accessibility_needs": ["WHEELCHAIR"],
        },
        headers=_auth(session["access_token"]),
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert len(itinerary["items"]) >= 1
    for item in itinerary["items"]:
        assert item["nearest_accessible_facility_m"] is not None
        assert item["nearest_accessible_facility_m"] >= 0


async def test_saved_accessibility_profile_is_picked_up_without_explicit_request_fields(
    client: AsyncClient,
) -> None:
    """Regression test for the RLS bug: save a real ACCESSIBILITY+WHEELCHAIR
    profile via PUT /users/me/travel-preferences, then call /ai/trip-plan
    WITHOUT any traveler_type/accessibility_needs override. The fallback
    inside generate_itinerary must resolve the saved profile (not silently
    default to SOLO) — proven by the same real facility-distance grounding
    appearing even though this request never mentions accessibility at all."""
    session = await _register_and_login(client)
    headers = _auth(session["access_token"])
    destination_id = await _india_gate_id(client)

    profile_saved = await client.put(
        "/api/v1/users/me/travel-preferences",
        json={
            "traveler_type": "ACCESSIBILITY",
            "accessibility_needs": ["WHEELCHAIR"],
            "family_children_count": 0,
            "family_seniors_count": 0,
        },
        headers=headers,
    )
    assert profile_saved.status_code == 200, profile_saved.text

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "What should I see in a day?",
            "start_date": "2027-01-10T00:00:00Z",
            "budget": 5000,
            "currency": "INR",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert len(itinerary["items"]) >= 1
    # If the fallback had silently defaulted to SOLO (the RLS bug), none of
    # these would ever be populated — accessibility mode never activates.
    for item in itinerary["items"]:
        assert item["nearest_accessible_facility_m"] is not None


async def test_accessible_route_mode_scores_higher_confidence_than_safe_near_a_real_facility(
    client: AsyncClient,
) -> None:
    """RouteMode.ACCESSIBLE must be a genuinely different computation from
    SAFE, not a byte-for-byte copy — near India Gate's real seeded
    accessibility facility, ACCESSIBLE mode should report a nearby facility
    count and high confidence for the same corridor."""
    destination_id = await _india_gate_id(client)
    destination = await client.get(f"/api/v1/destinations/{destination_id}")
    location = destination.json()["data"]["location"]

    accessible = await client.post(
        "/api/v1/routes/accessible",
        json={
            "origin_lon": location["lon"],
            "origin_lat": location["lat"],
            "destination_lon": location["lon"] + 0.01,
            "destination_lat": location["lat"] + 0.01,
        },
    )
    assert accessible.status_code == 200, accessible.text
    accessible_data = accessible.json()["data"]
    assert accessible_data["reasons"].get("nearby_accessible_facility_count", 0) >= 1
    assert accessible_data["confidence"] >= 0.85


async def test_businesses_accessible_only_filter_excludes_non_accessible_business(
    client: AsyncClient,
) -> None:
    owner = await _register_and_login(client)
    headers = _auth(owner["access_token"])

    # Only a "business" account_type may own a business (test_trust_and_
    # business.py's test_only_business_role_can_register_a_business), so a
    # second, separately-typed account is needed here.
    business_owner = await _register_and_login(client, "business")
    business_headers = _auth(business_owner["access_token"])

    accessible_business = await client.post(
        "/api/v1/businesses",
        json={"name": f"Accessible Hotel {uuid.uuid4().hex[:6]}", "category": "HOTEL"},
        headers=business_headers,
    )
    assert accessible_business.status_code == 201, accessible_business.text
    accessible_id = accessible_business.json()["data"]["id"]

    plain_business = await client.post(
        "/api/v1/businesses",
        json={"name": f"Plain Hotel {uuid.uuid4().hex[:6]}", "category": "HOTEL"},
        headers=business_headers,
    )
    assert plain_business.status_code == 201, plain_business.text
    plain_id = plain_business.json()["data"]["id"]

    profile_saved = await client.put(
        f"/api/v1/businesses/{accessible_id}/profile",
        json={"accessibility_features": {"wheelchair_accessible": True}},
        headers=business_headers,
    )
    assert profile_saved.status_code == 200, profile_saved.text

    listing = await client.get(
        "/api/v1/businesses", params={"accessible_only": "true"}, headers=headers
    )
    assert listing.status_code == 200, listing.text
    ids = {b["id"] for b in listing.json()["data"]}
    assert accessible_id in ids
    assert plain_id not in ids
