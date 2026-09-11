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
    # Real, structured replan history — previously only ever existed inside
    # a transient prompt string sent to Claude, never persisted anywhere.
    assert "raining" in new_itinerary["replan_reason"]
    assert new_itinerary["previous_version"] == 1


async def test_itinerary_item_update_happy_path_then_stale_version_conflicts(client: AsyncClient) -> None:
    """Real item-level mutation (offline-first upgrade) — independent of
    the AI's whole-itinerary regeneration. A stale `base_item_version`
    (the client's own prior successful edit already advanced it) must be
    rejected, never silently overwritten."""
    session = await _register_and_login(client)
    destination_id = await _india_gate_id(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    generated = await client.post(
        "/api/v1/ai/trip-plan",
        json={"destination_id": destination_id, "prompt": "One day, main sights."},
        headers=headers,
    )
    assert generated.status_code == 201, generated.text
    itinerary = generated.json()["data"]
    item = itinerary["items"][0]
    assert item["item_version"] == 1
    assert item["completed"] is False

    updated = await client.patch(
        f"/api/v1/trips/{itinerary['trip_id']}/itinerary/{itinerary['id']}/items/{item['id']}",
        json={"completed": True, "note": "Visited, loved it", "base_item_version": 1},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    updated_item = updated.json()["data"]
    assert updated_item["completed"] is True
    assert updated_item["note"] == "Visited, loved it"
    assert updated_item["item_version"] == 2

    stale = await client.patch(
        f"/api/v1/trips/{itinerary['trip_id']}/itinerary/{itinerary['id']}/items/{item['id']}",
        json={"completed": False, "base_item_version": 1},
        headers=headers,
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "ITEM_VERSION_CONFLICT"

    # The stale attempt must not have silently applied anyway.
    fetched = await client.get(f"/api/v1/trips/{itinerary['trip_id']}/itinerary", headers=headers)
    fetched_item = next(i for i in fetched.json()["data"]["items"] if i["id"] == item["id"])
    assert fetched_item["completed"] is True
    assert fetched_item["item_version"] == 2


async def test_itinerary_item_update_after_replan_is_superseded(client: AsyncClient) -> None:
    """`replan_itinerary` never mutates old rows in place — it creates a
    brand-new `Itinerary` version. An offline edit queued against the old
    version must be rejected as superseded, not silently applied to a dead
    itinerary nobody will ever see again."""
    session = await _register_and_login(client)
    destination_id = await _india_gate_id(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    generated = await client.post(
        "/api/v1/ai/trip-plan",
        json={"destination_id": destination_id, "prompt": "One day, main sights."},
        headers=headers,
    )
    old_itinerary = generated.json()["data"]
    old_item = old_itinerary["items"][0]

    replanned = await client.post(
        f"/api/v1/ai/itinerary/{old_itinerary['id']}/replan",
        json={"reason": "Prefer a different pace.", "context": {}},
        headers=headers,
    )
    assert replanned.status_code == 200, replanned.text
    assert replanned.json()["data"]["version"] == 2

    superseded = await client.patch(
        f"/api/v1/trips/{old_itinerary['trip_id']}/itinerary/{old_itinerary['id']}/items/{old_item['id']}",
        json={"completed": True, "base_item_version": 1},
        headers=headers,
    )
    assert superseded.status_code == 409
    assert superseded.json()["error"]["code"] == "ITINERARY_SUPERSEDED"


async def test_sync_itinerary_item_update_conflict_is_reported_in_conflicted_bucket(client: AsyncClient) -> None:
    """The same conflict check, exercised through `POST /api/v1/sync` —
    the richer `conflicted` bucket (not just acknowledged/skipped) a queued
    offline edit needs."""
    session = await _register_and_login(client)
    destination_id = await _india_gate_id(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    generated = await client.post(
        "/api/v1/ai/trip-plan",
        json={"destination_id": destination_id, "prompt": "One day, main sights."},
        headers=headers,
    )
    itinerary = generated.json()["data"]
    item_id = itinerary["items"][0]["id"]

    sync_body = {
        "device_id": "test-device",
        "operations": [
            {
                "operation_id": str(uuid.uuid4()),
                "entity_type": "itinerary_item",
                "operation": "UPDATE",
                "client_timestamp": "2027-01-01T00:00:00Z",
                "payload": {"item_id": item_id, "completed": True, "base_item_version": 1},
            }
        ],
    }
    first = await client.post("/api/v1/sync", json=sync_body, headers=headers)
    assert first.status_code == 200, first.text
    assert sync_body["operations"][0]["operation_id"] in first.json()["data"]["acknowledged_operation_ids"]

    conflicting_op_id = str(uuid.uuid4())
    conflicting_body = {
        "device_id": "test-device",
        "operations": [
            {
                "operation_id": conflicting_op_id,
                "entity_type": "itinerary_item",
                "operation": "UPDATE",
                "client_timestamp": "2027-01-01T00:00:00Z",
                # Stale — the first sync call already advanced item_version to 2.
                "payload": {"item_id": item_id, "note": "too late", "base_item_version": 1},
            }
        ],
    }
    second = await client.post("/api/v1/sync", json=conflicting_body, headers=headers)
    assert second.status_code == 200, second.text
    conflicts = second.json()["data"]["conflicted"]
    assert len(conflicts) == 1
    assert conflicts[0]["operation_id"] == conflicting_op_id
    assert conflicts[0]["error_code"] == "ITEM_VERSION_CONFLICT"
    assert conflicts[0]["current_state"]["item_version"] == 2


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


async def _mysore_palace_id(client: AsyncClient) -> str:
    listing = (await client.get("/api/v1/destinations?limit=100")).json()
    return next(d for d in listing["data"] if d["name"] == "Mysore Palace")["id"]


async def test_avoid_category_hard_excludes_matching_attractions(client: AsyncClient) -> None:
    """Mysore Palace has exactly two real seeded attractions: Mysuru Zoo
    (category=zoo) and Chamundi Hills (category=temple). avoid=["temple"]
    must be a real pre-filter, never an LLM-enforced suggestion."""
    tourist = await _register_and_login(client)
    destination_id = await _mysore_palace_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "A relaxed half-day in Mysuru.",
            "avoid": ["temple"],
        },
        headers={"Authorization": f"Bearer {tourist['access_token']}"},
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert len(itinerary["items"]) >= 1
    assert all(item["attraction_name"] != "Chamundi Hills" for item in itinerary["items"])


async def test_avoid_term_with_no_matching_category_is_reported_not_silently_ignored(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "One day seeing the main sights.",
            "avoid": ["nightlife"],
        },
        headers={"Authorization": f"Bearer {tourist['access_token']}"},
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert len(itinerary["items"]) >= 1  # the full real candidate set was still used
    assert "nightlife" in itinerary["unmatched_avoid_terms"]


async def test_avoid_excluding_every_available_category_fails_closed(client: AsyncClient) -> None:
    """Mysore Palace's only two real categories are zoo and temple —
    excluding both must never silently produce an empty-but-200 itinerary."""
    tourist = await _register_and_login(client)
    destination_id = await _mysore_palace_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "Anything at all.",
            "avoid": ["zoo", "temple"],
        },
        headers={"Authorization": f"Bearer {tourist['access_token']}"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_CANDIDATE_ATTRACTIONS"


async def test_safety_preference_high_triggers_safety_signal_for_solo_traveler(client: AsyncClient) -> None:
    """Direct regression test for a real, confirmed gap: before this change,
    a plain SOLO traveler (the default — no traveler_type given here) got
    zero safety/crowd weighting regardless of any stated preference. India
    Gate has a real seeded safety score, so safety_preference="high" must
    now surface it."""
    tourist = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={
            "destination_id": destination_id,
            "prompt": "I'm travelling alone and safety matters a lot to me.",
            "safety_preference": "high",
        },
        headers={"Authorization": f"Bearer {tourist['access_token']}"},
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert any(item["reason_code"] == "safety_priority" for item in itinerary["items"])


async def test_no_cost_data_never_reports_a_fabricated_budget_total(client: AsyncClient) -> None:
    """No attraction anywhere has real price data — cost_estimate_available
    must honestly say so rather than implying a ₹0 total or omitting the
    field."""
    tourist = await _register_and_login(client)
    destination_id = await _india_gate_id(client)

    response = await client.post(
        "/api/v1/ai/trip-plan",
        json={"destination_id": destination_id, "prompt": "A budget-conscious one-day visit.", "budget": 500},
        headers={"Authorization": f"Bearer {tourist['access_token']}"},
    )
    assert response.status_code == 201, response.text
    itinerary = response.json()["data"]
    assert itinerary["cost_estimate_available"] is False
    assert itinerary["total_cost"] is None


async def test_quick_action_combines_with_free_text_reason_in_persisted_replan_reason(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    destination_id = await _india_gate_id(client)
    headers = {"Authorization": f"Bearer {tourist['access_token']}"}

    trip = await client.post("/api/v1/trips", json={"title": "Delhi trip"}, headers=headers)
    trip_id = trip.json()["data"]["id"]
    generated = await client.post(
        "/api/v1/ai/itinerary/generate",
        json={"trip_id": trip_id, "destination_id": destination_id, "prompt": "A relaxed half-day visit."},
        headers=headers,
    )
    itinerary_id = generated.json()["data"]["id"]

    replanned = await client.post(
        f"/api/v1/ai/itinerary/{itinerary_id}/replan",
        json={"reason": "I have less time than I thought.", "quick_action": "cheaper"},
        headers=headers,
    )
    assert replanned.status_code == 200, replanned.text
    reason = replanned.json()["data"]["replan_reason"]
    assert "budget-conscious" in reason
    assert "less time than I thought" in reason
