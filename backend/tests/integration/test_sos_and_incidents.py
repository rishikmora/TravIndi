"""Prototype-depth integration tests for the real SOS/incident lifecycles,
trusted-contact tokens, safe-route scoring, notifications, and the
authority dashboard — the "build a working prototype, not full depth"
pass. Requires `docker compose --profile full up -d` from infra/ and a
seeded database (`python -m app.db.seed`).

The Keycloak fixture user `test-police@example.com` (infra/keycloak/
realm-export.json) has no local `identity.users` row — nothing ever
provisions one for pre-seeded Keycloak users, only /auth/register does.
Authority actions write `actor_user_id` (a real FK to identity.users) into
event tables, so a positive "police acknowledges" test needs that local row
to exist; `_ensure_local_user` seeds it directly (mirroring
tests/integration/test_rls_session.py's own fixture-setup pattern), which
is a real gap this note flags rather than hides: a genuine admin-provisioning
endpoint for authority accounts doesn't exist in this build either.
"""

import base64
import json
import uuid

from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import get_session_factory


def _decode_sub(access_token: str) -> str:
    payload_b64 = access_token.split(".")[1]
    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))["sub"]


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


async def _login_police(client: AsyncClient) -> dict:
    login = await client.post(
        "/api/v1/auth/login", json={"email": "test-police@example.com", "password": "Test1234!"}
    )
    assert login.status_code == 200, login.text
    data = login.json()["data"]
    user_id = _decode_sub(data["access_token"])
    async with get_session_factory()() as session:
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        await session.execute(
            text(
                "INSERT INTO identity.users (id, account_type, status) "
                "VALUES (CAST(:uid AS uuid), 'authority', 'ACTIVE') ON CONFLICT (id) DO NOTHING"
            ).bindparams(uid=user_id)
        )
        await session.commit()
    return {"user_id": user_id, **data}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_sos_create_acknowledge_resolve_lifecycle(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    police = await _login_police(client)

    created = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6, "emergency_type": "harassment"},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert created.status_code == 201, created.text
    sos = created.json()["data"]
    assert sos["status"] == "CREATED"
    assert sos["local_ack_at"] is not None
    sos_id = sos["id"]

    # A stranger tourist (no authority role) can't even see this SOS exists —
    # RLS's own read policy hides the row before OPA's action check ever
    # runs (a stranger isn't the owner and isn't an authority role), so this
    # is a 404, not a 403 — better info-hiding than a non-RLS resource like
    # Trip would give (see test_cannot_generate_itinerary_for_another_users_trip
    # in tests/integration/test_ai_planner.py, which gets a 403 instead,
    # since travel.trips has no RLS and Trip rows are always DB-visible).
    stranger = await _register_and_login(client)
    forbidden = await client.post(
        f"/api/v1/sos/{sos_id}/acknowledge", json={}, headers=_auth(stranger["access_token"])
    )
    assert forbidden.status_code == 404

    acknowledged = await client.post(
        f"/api/v1/sos/{sos_id}/acknowledge",
        json={"note": "en route"},
        headers=_auth(police["access_token"]),
    )
    assert acknowledged.status_code == 200, acknowledged.text
    assert acknowledged.json()["data"]["status"] == "ACKNOWLEDGED"

    resolved = await client.post(
        f"/api/v1/sos/{sos_id}/resolve",
        json={"outcome": "RESOLVED"},
        headers=_auth(police["access_token"]),
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["data"]["status"] == "RESOLVED"

    # Terminal state — a second resolve must fail, not silently succeed.
    already_closed = await client.post(
        f"/api/v1/sos/{sos_id}/resolve", json={}, headers=_auth(police["access_token"])
    )
    assert already_closed.status_code == 409

    # The tourist should have a real notification about the resolution.
    notifications = await client.get(
        "/api/v1/notifications", headers=_auth(tourist["access_token"])
    )
    assert notifications.status_code == 200
    bodies = [n["notification_type"] for n in notifications.json()["data"]]
    assert "sos_update" in bodies


async def test_sos_owner_can_cancel_their_own(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    created = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    sos_id = created.json()["data"]["id"]

    cancelled = await client.post(
        f"/api/v1/sos/{sos_id}/cancel", headers=_auth(tourist["access_token"])
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "CANCELLED"


async def test_trusted_contact_token_issued_and_verified(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    added = await client.post(
        "/api/v1/users/me/trusted-contacts",
        json={"name": "Mom", "phone": "+911234567890"},
        headers=_auth(tourist["access_token"]),
    )
    assert added.status_code == 201, added.text

    created = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    sos = created.json()["data"]
    assert len(sos["trusted_contact_tokens"]) == 1
    token = sos["trusted_contact_tokens"][0]["token"]

    # Without OTP step-up: coarse info only, no precise location.
    coarse = await client.post(
        f"/api/v1/sos/{sos['id']}/trusted-contact/verify", json={"token": token}
    )
    assert coarse.status_code == 200, coarse.text
    assert coarse.json()["data"]["precise_location"] is None

    # A garbage token must be rejected, never silently accepted.
    bad = await client.post(
        f"/api/v1/sos/{sos['id']}/trusted-contact/verify", json={"token": "not-a-real-token"}
    )
    assert bad.status_code == 403


async def test_trusted_contact_otp_stepup_reveals_precise_location(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await client.post(
        "/api/v1/users/me/trusted-contacts",
        json={"name": "Dad", "email": "dad@example.com"},
        headers=_auth(tourist["access_token"]),
    )
    created = await client.post(
        "/api/v1/sos",
        json={"lon": 77.5, "lat": 28.9},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    sos = created.json()["data"]
    token = sos["trusted_contact_tokens"][0]["token"]

    verified = await client.post(
        f"/api/v1/sos/{sos['id']}/trusted-contact/verify",
        json={"token": token, "otp_code": "123456"},
    )
    assert verified.status_code == 200
    location = verified.json()["data"]["precise_location"]
    assert location["lon"] == 77.5
    assert location["lat"] == 28.9


async def test_incident_report_assign_resolve_lifecycle(client: AsyncClient) -> None:
    reporter = await _register_and_login(client)
    police = await _login_police(client)

    created = await client.post(
        "/api/v1/emergency/incidents",
        json={"incident_type": "theft", "severity": "medium", "lon": 77.2, "lat": 28.6},
        headers={**_auth(reporter["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert created.status_code == 201, created.text
    incident_id = created.json()["data"]["id"]

    assigned = await client.post(
        f"/api/v1/emergency/incidents/{incident_id}/assign", headers=_auth(police["access_token"])
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["data"]["status"] == "ASSIGNED"
    assert assigned.json()["data"]["assigned_to_user_id"] == police["user_id"]

    resolved = await client.post(
        f"/api/v1/emergency/incidents/{incident_id}/resolve",
        json={},
        headers=_auth(police["access_token"]),
    )
    assert resolved.status_code == 200
    assert resolved.json()["data"]["status"] == "RESOLVED"


async def test_safe_route_scores_a_real_corridor(client: AsyncClient) -> None:
    """No auth needed — routing is a public read-style computation. Scores
    a genuine PostGIS query, not a placeholder: reasons must reflect real
    distance/incident/crowd data, per app/domains/travel/routing.py."""
    response = await client.post(
        "/api/v1/routes/safe",
        json={
            "origin_lon": 77.2295,
            "origin_lat": 28.6129,
            "destination_lon": 72.8347,
            "destination_lat": 18.9220,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["mode"] == "SAFE"
    assert 0.0 <= data["score"] <= 1.0
    assert data["reasons"]["distance_km"] > 1000  # Delhi <-> Mumbai, a real haversine distance
    assert "corridor_buffer_meters" in data["reasons"]


async def test_authority_dashboard_reflects_real_counts(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    police = await _login_police(client)

    before = await client.get("/api/v1/authority/dashboard", headers=_auth(police["access_token"]))
    assert before.status_code == 200
    before_count = before.json()["data"]["active_sos_count"]

    await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={**_auth(tourist["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )

    after = await client.get("/api/v1/authority/dashboard", headers=_auth(police["access_token"]))
    assert after.status_code == 200
    assert after.json()["data"]["active_sos_count"] == before_count + 1

    # A tourist (non-authority) must not see the command center.
    denied = await client.get("/api/v1/authority/dashboard", headers=_auth(tourist["access_token"]))
    assert denied.status_code == 403


async def test_offline_sos_sync_creates_a_real_sos_idempotently(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    operation_id = str(uuid.uuid4())
    body = {
        "device_id": "test-device",
        "operations": [
            {
                "operation_id": operation_id,
                "entity_type": "sos",
                "operation": "CREATE",
                "client_timestamp": "2027-01-01T00:00:00Z",
                "payload": {"lon": 77.2, "lat": 28.6, "emergency_type": "offline_test"},
            },
            {
                "operation_id": "unsupported-op",
                "entity_type": "trip",
                "operation": "UPDATE",
                "client_timestamp": "2027-01-01T00:00:00Z",
                "payload": {},
            },
        ],
    }
    first = await client.post("/api/v1/sync", json=body, headers=_auth(tourist["access_token"]))
    assert first.status_code == 200, first.text
    assert first.json()["data"]["acknowledged_operation_ids"] == [operation_id]
    assert first.json()["data"]["skipped_operation_ids"] == ["unsupported-op"]

    sos_list = await client.get("/api/v1/sos", headers=_auth(tourist["access_token"]))
    matching = [s for s in sos_list.json()["data"] if s["emergency_type"] == "offline_test"]
    assert len(matching) == 1

    # Re-sending the same operation_id must not create a duplicate SOS.
    second = await client.post("/api/v1/sync", json=body, headers=_auth(tourist["access_token"]))
    assert second.status_code == 200
    sos_list_again = await client.get("/api/v1/sos", headers=_auth(tourist["access_token"]))
    matching_again = [
        s for s in sos_list_again.json()["data"] if s["emergency_type"] == "offline_test"
    ]
    assert len(matching_again) == 1


async def test_notification_preferences_default_enabled_then_a_disabled_type_is_really_suppressed(
    client: AsyncClient,
) -> None:
    """Regression test for a real gap found while redesigning the
    notifications UI: GET/PUT /notifications/preferences existed and
    persisted real data, but app/core/notify.py never read it back — every
    notification always fired regardless of what was saved. Pins both the
    default (absence of a key means enabled) and the real suppression
    (`notify()` now checks `preferences.get(notification_type) is False`
    before ever inserting a row)."""
    tourist = await _register_and_login(client)
    police = await _login_police(client)
    headers = _auth(tourist["access_token"])

    default_prefs = await client.get("/api/v1/notifications/preferences", headers=headers)
    assert default_prefs.status_code == 200, default_prefs.text
    assert default_prefs.json()["data"]["preferences"] == {}

    disabled = await client.put(
        "/api/v1/notifications/preferences",
        json={"preferences": {"sos_update": False}},
        headers=headers,
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["data"]["preferences"] == {"sos_update": False}

    created = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    sos_id = created.json()["data"]["id"]
    await client.post(
        f"/api/v1/sos/{sos_id}/acknowledge", json={}, headers=_auth(police["access_token"])
    )
    await client.post(
        f"/api/v1/sos/{sos_id}/resolve",
        json={"outcome": "RESOLVED"},
        headers=_auth(police["access_token"]),
    )

    notifications = await client.get("/api/v1/notifications", headers=headers)
    assert notifications.status_code == 200
    assert all(n["notification_type"] != "sos_update" for n in notifications.json()["data"])

    # Re-enabling must let the type through again.
    reenabled = await client.put(
        "/api/v1/notifications/preferences",
        json={"preferences": {"sos_update": True}},
        headers=headers,
    )
    assert reenabled.status_code == 200, reenabled.text
    second_sos = await client.post(
        "/api/v1/sos",
        json={"lon": 77.2, "lat": 28.6},
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    await client.post(
        f"/api/v1/sos/{second_sos.json()['data']['id']}/resolve",
        json={"outcome": "FALSE_ALARM"},
        headers=_auth(police["access_token"]),
    )
    notifications_after = await client.get("/api/v1/notifications", headers=headers)
    assert any(n["notification_type"] == "sos_update" for n in notifications_after.json()["data"])
