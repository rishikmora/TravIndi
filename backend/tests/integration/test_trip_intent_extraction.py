"""Integration tests for free-text trip-intent extraction
(app/domains/travel/intent.py) — real Anthropic calls, real destination
resolution against seeded data. Same requirements/conventions as
tests/integration/test_ai_planner.py (ASGITransport client, real API key).

Destinations referenced here are real seeded rows (app/db/seed.py):
- "India Gate" / "Taj Mahal": unique name, one of the 10 originals with
  seeded attractions.
- "Jaipur": three real destinations share this exact city string (Amber
  Fort, City Palace Jaipur, Hawa Mahal) — a genuine ambiguous-city case.
- "Ooty": a real destination from the later 50-destination expansion with
  NO seeded attractions/facilities/crowd/safety rows — resolved as a real
  row, but not a plannable one.
- "Atlantis": not a real place, guaranteed to match nothing.
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


async def _extract(client: AsyncClient, token: str, prompt: str) -> dict:
    response = await client.post("/api/v1/ai/trip-intent/extract", json={"prompt": prompt}, headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_extract_resolves_a_real_known_destination_by_exact_name(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    result = await _extract(client, tourist["access_token"], "I want to visit India Gate for a day.")

    assert result["destination_id"] is not None
    assert result["destination_candidates"] == []

    real = (await client.get("/api/v1/destinations?limit=100")).json()["data"]
    india_gate = next(d for d in real if d["name"] == "India Gate")
    assert result["destination_id"] == india_gate["id"]


async def test_extract_ambiguous_city_returns_real_candidates_never_a_fabricated_id(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    result = await _extract(client, tourist["access_token"], "I'm planning a 3 day trip to Jaipur.")

    assert result["destination_id"] is None
    assert len(result["destination_candidates"]) >= 2
    assert "destination" in result["missing_required"]

    real_ids = {d["id"] for d in (await client.get("/api/v1/destinations?limit=100")).json()["data"]}
    for candidate in result["destination_candidates"]:
        assert candidate["id"] in real_ids


async def test_extract_unknown_destination_fails_closed_not_silently(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    result = await _extract(client, tourist["access_token"], "I want to visit Atlantis next month.")

    assert result["destination_id"] is None
    assert result["destination_candidates"] == []
    assert "destination" in result["missing_required"]


async def test_extract_resolved_destination_with_no_attractions_is_not_silently_confirmed(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    result = await _extract(client, tourist["access_token"], "I'm going to Ooty for a relaxing weekend.")

    assert result["destination_id"] is None
    assert len(result["destination_candidates"]) == 1
    assert result["destination_candidates"][0]["name"] == "Ooty"
    assert result["destination_candidates"][0]["has_attractions"] is False
    assert "destination" in result["missing_required"]


async def test_extract_computes_missing_required_deterministically_for_absent_duration(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    result = await _extract(client, tourist["access_token"], "I want to visit the Taj Mahal.")

    assert result["destination_id"] is not None
    assert "duration" in result["missing_required"]
    assert result["days"] is None
    assert result["nights"] is None
