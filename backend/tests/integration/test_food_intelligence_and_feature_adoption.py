"""Integration tests for two Round 3 additions that had no coverage yet:

1. Food Intelligence (Feature Blueprint P2) — self-declared cuisines/
   dietary options/price range on a business profile, and the matching
   `dietary_option`/`cuisine` search filters on `GET /businesses`
   (app/domains/business/router.py, app/domains/business/schemas.py).
2. `GET /analytics/feature-adoption` (app/api/v1/analytics.py) — the single
   real usage-count view across every P2 domain (gamification, lost&found,
   financial, group travel, social, sustainability), gated to tourism
   authority same as `/analytics/overview`.

Same ASGITransport `client` fixture convention as tests/integration/
test_ai_planner.py. No ANTHROPIC_API_KEY needed — neither path calls Claude.
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


async def _login_admin(client: AsyncClient) -> dict:
    login = await client.post(
        "/api/v1/auth/login", json={"email": "test-admin@example.com", "password": "Test1234!"}
    )
    assert login.status_code == 200, login.text
    return login.json()["data"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_food_profile_save_and_dietary_and_cuisine_filters(client: AsyncClient) -> None:
    owner = await _register_and_login(client, "business")
    headers = _auth(owner["access_token"])

    veg_restaurant = await client.post(
        "/api/v1/businesses",
        json={"name": f"Veg Place {uuid.uuid4().hex[:6]}", "category": "RESTAURANT"},
        headers=headers,
    )
    assert veg_restaurant.status_code == 201, veg_restaurant.text
    veg_id = veg_restaurant.json()["data"]["id"]

    other_restaurant = await client.post(
        "/api/v1/businesses",
        json={"name": f"Other Place {uuid.uuid4().hex[:6]}", "category": "RESTAURANT"},
        headers=headers,
    )
    assert other_restaurant.status_code == 201, other_restaurant.text
    other_id = other_restaurant.json()["data"]["id"]

    saved = await client.put(
        f"/api/v1/businesses/{veg_id}/profile",
        json={
            "cuisines": ["South Indian", "North Indian"],
            "dietary_options": ["VEGETARIAN", "JAIN"],
            "price_range": "BUDGET",
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    profile = saved.json()["data"]["profile"]
    assert profile["cuisines"] == ["South Indian", "North Indian"]
    assert profile["dietary_options"] == ["VEGETARIAN", "JAIN"]
    assert profile["price_range"] == "BUDGET"

    by_dietary = await client.get("/api/v1/businesses", params={"dietary_option": "VEGETARIAN"})
    assert by_dietary.status_code == 200, by_dietary.text
    dietary_ids = {b["id"] for b in by_dietary.json()["data"]}
    assert veg_id in dietary_ids
    assert other_id not in dietary_ids

    by_cuisine = await client.get("/api/v1/businesses", params={"cuisine": "South Indian"})
    assert by_cuisine.status_code == 200, by_cuisine.text
    cuisine_ids = {b["id"] for b in by_cuisine.json()["data"]}
    assert veg_id in cuisine_ids
    assert other_id not in cuisine_ids


async def test_food_profile_save_does_not_clobber_accessibility_features(
    client: AsyncClient,
) -> None:
    """PUT /businesses/{id}/profile replaces the whole profile row — the
    frontend's FoodProfileSection and AccessibilityProfileSection each carry
    through the fields they don't own (see project memory on this exact
    upsert-not-patch clobber risk). This pins that contract at the API
    level: saving accessibility first, then food, must not silently wipe the
    accessibility flag if the caller carries it through."""
    owner = await _register_and_login(client, "business")
    headers = _auth(owner["access_token"])

    business = await client.post(
        "/api/v1/businesses",
        json={"name": f"Accessible Cafe {uuid.uuid4().hex[:6]}", "category": "RESTAURANT"},
        headers=headers,
    )
    business_id = business.json()["data"]["id"]

    first_save = await client.put(
        f"/api/v1/businesses/{business_id}/profile",
        json={"accessibility_features": {"wheelchair_accessible": True}},
        headers=headers,
    )
    assert first_save.status_code == 200, first_save.text

    current_profile = first_save.json()["data"]["profile"]
    second_save = await client.put(
        f"/api/v1/businesses/{business_id}/profile",
        json={
            "accessibility_features": current_profile["accessibility_features"],
            "cuisines": ["Cafe"],
            "dietary_options": ["VEGAN"],
        },
        headers=headers,
    )
    assert second_save.status_code == 200, second_save.text
    final_profile = second_save.json()["data"]["profile"]
    assert final_profile["accessibility_features"]["wheelchair_accessible"] is True
    assert final_profile["cuisines"] == ["Cafe"]


async def test_feature_adoption_is_gated_and_reflects_a_real_check_in(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    admin = await _login_admin(client)

    forbidden = await client.get(
        "/api/v1/analytics/feature-adoption", headers=_auth(tourist["access_token"])
    )
    assert forbidden.status_code == 403

    baseline = await client.get(
        "/api/v1/analytics/feature-adoption", headers=_auth(admin["access_token"])
    )
    assert baseline.status_code == 200, baseline.text
    baseline_data = baseline.json()["data"]

    destinations = (await client.get("/api/v1/destinations?limit=100")).json()["data"]
    india_gate = next(d for d in destinations if d["name"] == "India Gate")
    check_in = await client.post(
        "/api/v1/gamification/check-ins",
        json={
            "destination_id": india_gate["id"],
            "lon": india_gate["location"]["lon"],
            "lat": india_gate["location"]["lat"],
        },
        headers=_auth(tourist["access_token"]),
    )
    assert check_in.status_code == 201, check_in.text

    after = await client.get(
        "/api/v1/analytics/feature-adoption", headers=_auth(admin["access_token"])
    )
    assert after.status_code == 200, after.text
    after_data = after.json()["data"]
    assert after_data["total_check_ins"] == baseline_data["total_check_ins"] + 1
    assert after_data["total_points_awarded"] > baseline_data["total_points_awarded"]
