"""Integration tests — require the live infra stack (`docker compose up -d
postgres redis minio` from infra/) and a seeded database (`python -m
app.db.seed`). These genuinely query PostgreSQL/PostGIS, unlike the
tests/unit/test_api_contract.py suite. `client` fixture: see tests/conftest.py.
"""

from httpx import AsyncClient


async def test_list_destinations_returns_seeded_rows(client: AsyncClient) -> None:
    response = await client.get("/api/v1/destinations")
    assert response.status_code == 200
    body = response.json()
    names = {d["name"] for d in body["data"]}
    assert "India Gate" in names


async def test_get_destination_by_id_round_trips_location(client: AsyncClient) -> None:
    listing = (await client.get("/api/v1/destinations")).json()
    india_gate = next(d for d in listing["data"] if d["name"] == "India Gate")

    response = await client.get(f"/api/v1/destinations/{india_gate['id']}")
    assert response.status_code == 200
    location = response.json()["data"]["location"]
    assert location["lon"] == 77.2295
    assert location["lat"] == 28.6129


async def test_get_destination_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/destinations/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "DESTINATION_NOT_FOUND"


async def test_destination_safety_reflects_seeded_score(client: AsyncClient) -> None:
    """`python -m app.db.seed` (the "build a working prototype" pass) now
    seeds an illustrative SafetyScore per destination (model_version
    "seed-demo-v1") so the destination detail view and safe-route scoring
    have real signal to compute against — this used to legitimately assert
    `None` before that seed data existed."""
    listing = (await client.get("/api/v1/destinations")).json()
    india_gate = next(d for d in listing["data"] if d["name"] == "India Gate")

    response = await client.get(f"/api/v1/destinations/{india_gate['id']}/safety")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data is not None
    assert 0.0 <= data["score"] <= 1.0
    assert data["model_version"] == "seed-demo-v1"


async def test_destination_crowd_reflects_seeded_cell(client: AsyncClient) -> None:
    listing = (await client.get("/api/v1/destinations")).json()
    india_gate = next(d for d in listing["data"] if d["name"] == "India Gate")

    response = await client.get(f"/api/v1/destinations/{india_gate['id']}/crowd")
    assert response.status_code == 200
    cells = response.json()["data"]
    assert len(cells) >= 1
    assert all(c["destination_id"] == india_gate["id"] for c in cells)


async def test_crowd_heatmap_includes_seeded_cells(client: AsyncClient) -> None:
    response = await client.get("/api/v1/crowd/heatmap")
    assert response.status_code == 200
    assert len(response.json()["data"]) >= 1
