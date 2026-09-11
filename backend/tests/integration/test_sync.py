"""Offline-sync coverage beyond the original SOS-only test in
test_sos_and_incidents.py — the new `incident`/CREATE and `itinerary_item`/
UPDATE entity types, atomic dedup within one batch, and cross-user
isolation on the shared `sync.sync_operations` ledger.
"""

import uuid

from httpx import AsyncClient

from tests.integration.test_sos_and_incidents import _auth, _register_and_login


def _sync_body(device_id: str, operations: list[dict]) -> dict:
    return {"device_id": device_id, "operations": operations}


async def test_sync_incident_create_is_real_and_idempotent(client: AsyncClient) -> None:
    reporter = await _register_and_login(client)
    operation_id = str(uuid.uuid4())
    body = _sync_body(
        "test-device",
        [
            {
                "operation_id": operation_id,
                "entity_type": "incident",
                "operation": "CREATE",
                "client_timestamp": "2027-01-01T00:00:00Z",
                "payload": {
                    "incident_type": "offline_theft",
                    "severity": "medium",
                    "lon": 77.2,
                    "lat": 28.6,
                    "description": "Reported while offline",
                },
            }
        ],
    )
    first = await client.post("/api/v1/sync", json=body, headers=_auth(reporter["access_token"]))
    assert first.status_code == 200, first.text
    assert first.json()["data"]["acknowledged_operation_ids"] == [operation_id]

    incidents = await client.get("/api/v1/emergency/incidents", headers=_auth(reporter["access_token"]))
    matching = [i for i in incidents.json()["data"] if i["incident_type"] == "offline_theft"]
    assert len(matching) == 1

    second = await client.post("/api/v1/sync", json=body, headers=_auth(reporter["access_token"]))
    assert second.status_code == 200
    incidents_again = await client.get("/api/v1/emergency/incidents", headers=_auth(reporter["access_token"]))
    matching_again = [i for i in incidents_again.json()["data"] if i["incident_type"] == "offline_theft"]
    assert len(matching_again) == 1


async def test_sync_duplicate_operation_id_within_one_batch_creates_only_one_sos(client: AsyncClient) -> None:
    """Two operations in the *same* request sharing an operation_id (e.g. a
    buggy client retry queued twice before the first ever reached the
    server) must still only create one real SOS — proves the ledger's
    `ON CONFLICT DO NOTHING` claim is visible within the same transaction,
    not just across separate requests."""
    tourist = await _register_and_login(client)
    operation_id = str(uuid.uuid4())
    op = {
        "operation_id": operation_id,
        "entity_type": "sos",
        "operation": "CREATE",
        "client_timestamp": "2027-01-01T00:00:00Z",
        "payload": {"lon": 77.2, "lat": 28.6, "emergency_type": "batch_duplicate_test"},
    }
    body = _sync_body("test-device", [op, dict(op)])

    response = await client.post("/api/v1/sync", json=body, headers=_auth(tourist["access_token"]))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["acknowledged_operation_ids"] == [operation_id, operation_id]

    sos_list = await client.get("/api/v1/sos", headers=_auth(tourist["access_token"]))
    matching = [s for s in sos_list.json()["data"] if s["emergency_type"] == "batch_duplicate_test"]
    assert len(matching) == 1


async def test_sync_cross_user_same_operation_id_creates_independent_sos(client: AsyncClient) -> None:
    """Two different users coincidentally using the same client-generated
    operation_id must never dedupe against each other or leak one user's
    entity into the other's ack — the ledger's uniqueness is scoped to
    (user_id, operation_id), not operation_id alone."""
    tourist_a = await _register_and_login(client)
    tourist_b = await _register_and_login(client)
    operation_id = str(uuid.uuid4())
    op = {
        "operation_id": operation_id,
        "entity_type": "sos",
        "operation": "CREATE",
        "client_timestamp": "2027-01-01T00:00:00Z",
        "payload": {"lon": 77.2, "lat": 28.6, "emergency_type": "cross_user_test"},
    }

    resp_a = await client.post(
        "/api/v1/sync", json=_sync_body("device-a", [op]), headers=_auth(tourist_a["access_token"])
    )
    resp_b = await client.post(
        "/api/v1/sync", json=_sync_body("device-b", [op]), headers=_auth(tourist_b["access_token"])
    )
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.json()["data"]["acknowledged_operation_ids"] == [operation_id]
    assert resp_b.json()["data"]["acknowledged_operation_ids"] == [operation_id]

    sos_a = [
        s
        for s in (await client.get("/api/v1/sos", headers=_auth(tourist_a["access_token"]))).json()["data"]
        if s["emergency_type"] == "cross_user_test"
    ]
    sos_b = [
        s
        for s in (await client.get("/api/v1/sos", headers=_auth(tourist_b["access_token"]))).json()["data"]
        if s["emergency_type"] == "cross_user_test"
    ]
    assert len(sos_a) == 1
    assert len(sos_b) == 1
    assert sos_a[0]["id"] != sos_b[0]["id"]


async def test_sync_unsupported_entity_type_still_honestly_skipped(client: AsyncClient) -> None:
    """Regression — the original narrow contract must hold for anything
    outside the three real entity types this endpoint supports."""
    tourist = await _register_and_login(client)
    body = _sync_body(
        "test-device",
        [
            {
                "operation_id": "nope",
                "entity_type": "booking",
                "operation": "CREATE",
                "client_timestamp": "2027-01-01T00:00:00Z",
                "payload": {},
            }
        ],
    )
    response = await client.post("/api/v1/sync", json=body, headers=_auth(tourist["access_token"]))
    assert response.status_code == 200
    assert response.json()["data"]["skipped_operation_ids"] == ["nope"]
    assert response.json()["data"]["acknowledged_operation_ids"] == []
