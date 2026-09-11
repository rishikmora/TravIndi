"""Phase 12 integration tests — real Anthropic (planner) calls, real local
`sentence-transformers` embeddings, real RAG retrieval against the seeded
knowledge base, real DB writes. Requires:

- `docker compose --profile full up -d` from infra/ (Keycloak + OPA + DB)
- `python -m app.db.seed` (destinations + attractions)
- `python -m app.db.seed_knowledge` (knowledge chunks — local embeddings,
  no API key, but the first run downloads the model's weights)
- ANTHROPIC_API_KEY set in backend/.env

Like tests/integration/test_registration_and_trips.py, these make real
outbound calls from inside a route handler, hence the ASGITransport client
fixture (tests/conftest.py) rather than Starlette's TestClient.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy import select

from app.core.ai.rag import embed_text, retrieve_knowledge
from app.db.session import get_session_factory
from app.domains.tourism.models import Destination


async def test_rag_retrieval_finds_the_seeded_india_gate_chunk() -> None:
    """docs/00-planning/05-traceability-matrix-mvp.md §2's explicit
    "Integration: RAG retrieval against seeded knowledge base" test case.
    Needs `python -m app.db.seed_knowledge` to have been run."""
    async with get_session_factory()() as session:
        destination = (
            await session.execute(select(Destination).where(Destination.name == "India Gate"))
        ).scalar_one()
        embedding = await embed_text("What war memorials are near India Gate?")
        chunks = await retrieve_knowledge(session, embedding, destination_id=str(destination.id), top_k=3)
        assert len(chunks) >= 1
        assert "War Memorial" in chunks[0].content or "India Gate" in chunks[0].content


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


async def _india_gate_id(client: AsyncClient) -> str:
    listing = (await client.get("/api/v1/destinations?limit=100")).json()
    return next(d for d in listing["data"] if d["name"] == "India Gate")["id"]


async def test_trip_plan_creates_a_grounded_itinerary(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "I have one day in Delhi and want to see the main historical sights.",
            "start_date": "2027-01-10T00:00:00Z",
            "budget": 5000,
            "currency": "INR",
        },
        headers={"Authorization": f"Bearer {session['access_token']}"},
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert itinerary["generated_by"] == "AI"
    assert itinerary["version"] == 1
    assert len(itinerary["items"]) >= 1

    # Every returned attraction must be a real one near India Gate — never
    # an id the model invented (the core guardrail this endpoint enforces).
    real_attractions = (await client.get(f"/api/v1/destinations/{destination_id}/attractions")).json()["data"]
    real_names_by_id = {a["id"]: a["name"] for a in real_attractions}
    for item in itinerary["items"]:
        assert item["attraction_id"] in real_names_by_id
        assert item["attraction_name"] == real_names_by_id[item["attraction_id"]]
        assert item["explanation"]

    # The itinerary must be independently re-fetchable later — trip-plan's
    # response isn't the only way to see it.
    fetched = await client.get(
        f"/api/v1/trips/{itinerary['trip_id']}/itinerary", headers={"Authorization": f"Bearer {session['access_token']}"}
    )
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["data"]["id"] == itinerary["id"]


async def test_itinerary_generate_then_replan_creates_a_new_version(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    destination_id = await _india_gate_id(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    trip = await client.post("/api/v1/trips", json={"title": "Delhi trip"}, headers=headers)
    assert trip.status_code == 201, trip.text
    trip_id = trip.json()["data"]["id"]

    generated = await client.post(
        "/api/v1/ai/itinerary/generate",
        json={"trip_id": trip_id, "destination_id": destination_id, "prompt": "A relaxed half-day visit."},
        headers=headers,
    )
    assert generated.status_code == 201, generated.text
    itinerary = generated.json()["data"]
    assert itinerary["trip_id"] == trip_id
    assert itinerary["version"] == 1

    replanned = await client.post(
        f"/api/v1/ai/itinerary/{itinerary['id']}/replan",
        json={"reason": "It's raining, prefer indoor/covered sights.", "context": {}},
        headers=headers,
    )
    assert replanned.status_code == 200, replanned.text
    new_itinerary = replanned.json()["data"]
    assert new_itinerary["trip_id"] == trip_id
    assert new_itinerary["version"] == 2


async def test_trip_plan_without_a_destination_fails_closed_not_silently(client: AsyncClient) -> None:
    """No destination-inference-from-free-text exists (see
    app/domains/travel/planner.py's module docstring) — this must be a
    clear 422, never a 200 with a guessed/empty plan."""
    session = await _register_and_login(client)
    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={"prompt": "Plan me something fun."},
        headers={"Authorization": f"Bearer {session['access_token']}"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_CANDIDATE_ATTRACTIONS"


async def test_trip_itinerary_404s_before_any_plan_exists(client: AsyncClient) -> None:
    session = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}
    trip = await client.post("/api/v1/trips", json={"title": "No plan yet"}, headers=headers)
    trip_id = trip.json()["data"]["id"]

    response = await client.get(f"/api/v1/trips/{trip_id}/itinerary", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ITINERARY_NOT_FOUND"


async def test_cannot_generate_itinerary_for_another_users_trip(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    trip = await client.post(
        "/api/v1/trips",
        json={"title": "Owner's trip"},
        headers={"Authorization": f"Bearer {owner['access_token']}"},
    )
    trip_id = trip.json()["data"]["id"]

    response = await client.post(
        "/api/v1/ai/itinerary/generate",
        json={"trip_id": trip_id, "destination_id": destination_id, "prompt": "Anything."},
        headers={"Authorization": f"Bearer {stranger['access_token']}"},
    )
    assert response.status_code == 403
