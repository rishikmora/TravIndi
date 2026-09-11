"""Integration tests for Live Location Sharing — consent gate, ownership
validation, precision fuzzing, lazy expiry, revocation, rate limiting, and
the security-critical case: a stranger must never see another user's
location, with or without a stolen id, via any endpoint. Same ASGITransport
`client` fixture convention as tests/integration/test_sos_and_incidents.py
and test_group_travel.py.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import get_session_factory

_CONSENT_PURPOSE = "location_sharing"


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


def _idem() -> dict:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def _grant_location_consent(client: AsyncClient, token: str) -> None:
    granted = await client.post(
        "/api/v1/users/me/consents",
        json={"purpose": _CONSENT_PURPOSE, "version": "1"},
        headers=_auth(token),
    )
    assert granted.status_code == 201, granted.text


async def _add_contact(client: AsyncClient, token: str, name: str = "Mom") -> str:
    added = await client.post(
        "/api/v1/users/me/trusted-contacts",
        json={"name": name, "phone": "+911234567890"},
        headers=_auth(token),
    )
    assert added.status_code == 201, added.text
    return added.json()["data"]["id"]


async def _create_share(
    client: AsyncClient, token: str, *, contact_id: str, precision: str = "APPROXIMATE", duration: str = "1h"
) -> dict:
    created = await client.post(
        "/api/v1/location-sharing",
        json={
            "recipient_type": "TRUSTED_CONTACT",
            "trusted_contact_id": contact_id,
            "precision": precision,
            "duration_choice": duration,
        },
        headers={**_auth(token), **_idem()},
    )
    assert created.status_code == 201, created.text
    return created.json()["data"]


async def test_create_requires_consent(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    contact_id = await _add_contact(client, tourist["access_token"])

    denied = await client.post(
        "/api/v1/location-sharing",
        json={
            "recipient_type": "TRUSTED_CONTACT",
            "trusted_contact_id": contact_id,
            "precision": "APPROXIMATE",
            "duration_choice": "1h",
        },
        headers={**_auth(tourist["access_token"]), **_idem()},
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "CONSENT_REQUIRED"

    await _grant_location_consent(client, tourist["access_token"])
    share = await _create_share(client, tourist["access_token"], contact_id=contact_id)
    assert share["status"] == "ACTIVE"


async def test_create_issues_exactly_one_token_never_refetched(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_id = await _add_contact(client, tourist["access_token"])

    share = await _create_share(client, tourist["access_token"], contact_id=contact_id)
    assert share["access_token"] is not None

    refetched = await client.get(f"/api/v1/location-sharing/{share['id']}", headers=_auth(tourist["access_token"]))
    assert refetched.status_code == 200
    assert refetched.json()["data"]["access_token"] is None


async def test_user_a_cannot_see_user_bs_share(client: AsyncClient) -> None:
    a = await _register_and_login(client)
    b = await _register_and_login(client)
    await _grant_location_consent(client, a["access_token"])
    contact_id = await _add_contact(client, a["access_token"])
    share = await _create_share(client, a["access_token"], contact_id=contact_id)
    share_id = share["id"]

    forbidden_get = await client.get(f"/api/v1/location-sharing/{share_id}", headers=_auth(b["access_token"]))
    assert forbidden_get.status_code == 404

    forbidden_patch = await client.patch(
        f"/api/v1/location-sharing/{share_id}",
        json={"precision": "PRECISE"},
        headers=_auth(b["access_token"]),
    )
    assert forbidden_patch.status_code == 404

    forbidden_delete = await client.delete(f"/api/v1/location-sharing/{share_id}", headers=_auth(b["access_token"]))
    assert forbidden_delete.status_code == 404

    forbidden_ping = await client.post(
        f"/api/v1/location-sharing/{share_id}/ping",
        json={"lon": 77.2, "lat": 28.6},
        headers=_auth(b["access_token"]),
    )
    assert forbidden_ping.status_code == 404

    b_list = await client.get("/api/v1/location-sharing", headers=_auth(b["access_token"]))
    assert all(row["id"] != share_id for row in b_list.json()["data"])


async def test_recipient_view_requires_valid_token(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_id = await _add_contact(client, tourist["access_token"])
    share = await _create_share(client, tourist["access_token"], contact_id=contact_id)

    bad = await client.get(f"/api/v1/location-sharing/{share['id']}/recipient-view?token=not-a-real-token")
    assert bad.status_code == 403

    ok = await client.get(f"/api/v1/location-sharing/{share['id']}/recipient-view?token={share['access_token']}")
    assert ok.status_code == 200, ok.text
    data = ok.json()["data"]
    assert data["is_live"] is False
    assert data["current_location"] is None


async def test_precision_fuzzing_moves_approximate_location(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_id = await _add_contact(client, tourist["access_token"])

    precise_share = await _create_share(client, tourist["access_token"], contact_id=contact_id, precision="PRECISE")
    approx_share = await _create_share(
        client, tourist["access_token"], contact_id=await _add_contact(client, tourist["access_token"], "Dad"), precision="APPROXIMATE"
    )

    raw_lon, raw_lat = 77.2295, 28.6129

    precise_ping = await client.post(
        f"/api/v1/location-sharing/{precise_share['id']}/ping",
        json={"lon": raw_lon, "lat": raw_lat},
        headers=_auth(tourist["access_token"]),
    )
    assert precise_ping.status_code == 200, precise_ping.text
    assert precise_ping.json()["data"]["current_location"] == {"lon": raw_lon, "lat": raw_lat}

    approx_ping = await client.post(
        f"/api/v1/location-sharing/{approx_share['id']}/ping",
        json={"lon": raw_lon, "lat": raw_lat},
        headers=_auth(tourist["access_token"]),
    )
    assert approx_ping.status_code == 200, approx_ping.text
    fuzzed = approx_ping.json()["data"]["current_location"]
    assert fuzzed != {"lon": raw_lon, "lat": raw_lat}

    from app.core.geo import haversine_meters

    distance = haversine_meters(raw_lon, raw_lat, fuzzed["lon"], fuzzed["lat"])
    assert 0 < distance <= 2000  # within one H3-res-7 cell's width of the true point


async def test_ping_is_rate_limited(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_id = await _add_contact(client, tourist["access_token"])
    share = await _create_share(client, tourist["access_token"], contact_id=contact_id, precision="PRECISE")

    first = await client.post(
        f"/api/v1/location-sharing/{share['id']}/ping",
        json={"lon": 77.2, "lat": 28.6},
        headers=_auth(tourist["access_token"]),
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/api/v1/location-sharing/{share['id']}/ping",
        json={"lon": 77.21, "lat": 28.61},
        headers=_auth(tourist["access_token"]),
    )
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "PING_RATE_LIMITED"


async def test_revoke_stops_pings_and_recipient_view_immediately(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_id = await _add_contact(client, tourist["access_token"])
    share = await _create_share(client, tourist["access_token"], contact_id=contact_id, precision="PRECISE")

    pinged = await client.post(
        f"/api/v1/location-sharing/{share['id']}/ping",
        json={"lon": 77.2, "lat": 28.6},
        headers=_auth(tourist["access_token"]),
    )
    assert pinged.status_code == 200, pinged.text

    revoked = await client.delete(f"/api/v1/location-sharing/{share['id']}", headers=_auth(tourist["access_token"]))
    assert revoked.status_code == 204

    ping_after_revoke = await client.post(
        f"/api/v1/location-sharing/{share['id']}/ping",
        json={"lon": 77.3, "lat": 28.7},
        headers=_auth(tourist["access_token"]),
    )
    assert ping_after_revoke.status_code == 409

    # A location was successfully pinged before revocation — revoking also
    # revokes the access token itself (not just the share's own status), so
    # the recipient link goes fully dead immediately: INVALID_TOKEN, not a
    # 200 body that happens to say REVOKED. This is stricter than merely
    # hiding the location — no residual response distinguishes "revoked
    # share" from "never-existed token" to whoever holds a dead link.
    view = await client.get(
        f"/api/v1/location-sharing/{share['id']}/recipient-view?token={share['access_token']}"
    )
    assert view.status_code == 403
    assert view.json()["error"]["code"] == "INVALID_TOKEN"


async def test_expiry_is_enforced_lazily_without_a_cron(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_id = await _add_contact(client, tourist["access_token"])
    share = await _create_share(client, tourist["access_token"], contact_id=contact_id, precision="PRECISE")

    # Backdate expires_at directly via the service role — same pattern used
    # elsewhere in this suite to simulate time passing without a real sleep.
    async with get_session_factory()() as session:
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
        await session.execute(
            text("UPDATE location_sharing.location_shares SET expires_at = :past WHERE id = CAST(:id AS uuid)").bindparams(
                past=datetime.now(UTC) - timedelta(minutes=1), id=share["id"]
            )
        )
        await session.commit()

    view = await client.get(
        f"/api/v1/location-sharing/{share['id']}/recipient-view?token={share['access_token']}"
    )
    assert view.status_code == 200, view.text
    assert view.json()["data"]["status"] == "EXPIRED"

    ping = await client.post(
        f"/api/v1/location-sharing/{share['id']}/ping",
        json={"lon": 77.2, "lat": 28.6},
        headers=_auth(tourist["access_token"]),
    )
    assert ping.status_code == 409

    fetched = await client.get(f"/api/v1/location-sharing/{share['id']}", headers=_auth(tourist["access_token"]))
    assert fetched.json()["data"]["status"] == "EXPIRED"


async def test_stop_all_is_scoped_to_caller(client: AsyncClient) -> None:
    a = await _register_and_login(client)
    b = await _register_and_login(client)
    await _grant_location_consent(client, a["access_token"])
    await _grant_location_consent(client, b["access_token"])

    a_contact_1 = await _add_contact(client, a["access_token"], "A-Contact-1")
    a_contact_2 = await _add_contact(client, a["access_token"], "A-Contact-2")
    b_contact = await _add_contact(client, b["access_token"], "B-Contact")

    a_share_1 = await _create_share(client, a["access_token"], contact_id=a_contact_1)
    a_share_2 = await _create_share(client, a["access_token"], contact_id=a_contact_2)
    b_share = await _create_share(client, b["access_token"], contact_id=b_contact)

    stopped = await client.post("/api/v1/location-sharing/stop-all", headers=_auth(a["access_token"]))
    assert stopped.status_code == 204

    a_list = {row["id"]: row["status"] for row in (await client.get(
        "/api/v1/location-sharing", headers=_auth(a["access_token"])
    )).json()["data"]}
    assert a_list[a_share_1["id"]] == "REVOKED"
    assert a_list[a_share_2["id"]] == "REVOKED"

    b_fetched = await client.get(f"/api/v1/location-sharing/{b_share['id']}", headers=_auth(b["access_token"]))
    assert b_fetched.json()["data"]["status"] == "ACTIVE"


async def test_group_share_ping_is_rejected_use_group_travel_endpoint(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    await _grant_location_consent(client, owner["access_token"])

    trip = await client.post("/api/v1/trips", json={"title": "Group trip"}, headers=_auth(owner["access_token"]))
    trip_id = trip.json()["data"]["id"]

    created = await client.post(
        "/api/v1/location-sharing",
        json={"recipient_type": "GROUP", "trip_id": trip_id, "precision": "PRECISE", "duration_choice": "1h"},
        headers={**_auth(owner["access_token"]), **_idem()},
    )
    assert created.status_code == 201, created.text
    share = created.json()["data"]
    assert share["access_token"] is None

    rejected = await client.post(
        f"/api/v1/location-sharing/{share['id']}/ping",
        json={"lon": 77.2, "lat": 28.6},
        headers=_auth(owner["access_token"]),
    )
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "USE_GROUP_TRAVEL_ENDPOINT"


async def test_ownership_validation_on_create(client: AsyncClient) -> None:
    a = await _register_and_login(client)
    b = await _register_and_login(client)
    await _grant_location_consent(client, a["access_token"])
    b_contact_id = await _add_contact(client, b["access_token"])

    wrong_contact = await client.post(
        "/api/v1/location-sharing",
        json={
            "recipient_type": "TRUSTED_CONTACT",
            "trusted_contact_id": b_contact_id,
            "precision": "APPROXIMATE",
            "duration_choice": "1h",
        },
        headers={**_auth(a["access_token"]), **_idem()},
    )
    assert wrong_contact.status_code == 404

    not_a_member_trip = await client.post(
        "/api/v1/trips", json={"title": "B's trip"}, headers=_auth(b["access_token"])
    )
    trip_id = not_a_member_trip.json()["data"]["id"]
    await _grant_location_consent(client, a["access_token"])
    forbidden_group = await client.post(
        "/api/v1/location-sharing",
        json={"recipient_type": "GROUP", "trip_id": trip_id, "precision": "PRECISE", "duration_choice": "1h"},
        headers={**_auth(a["access_token"]), **_idem()},
    )
    assert forbidden_group.status_code == 403


async def test_cross_share_token_misuse_is_rejected(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    await _grant_location_consent(client, tourist["access_token"])
    contact_1 = await _add_contact(client, tourist["access_token"], "Contact One")
    contact_2 = await _add_contact(client, tourist["access_token"], "Contact Two")

    share_a = await _create_share(client, tourist["access_token"], contact_id=contact_1)
    share_b = await _create_share(client, tourist["access_token"], contact_id=contact_2)

    misused = await client.get(
        f"/api/v1/location-sharing/{share_b['id']}/recipient-view?token={share_a['access_token']}"
    )
    assert misused.status_code == 403
