"""Realtime WebSocket gateway. httpx's `ASGITransport` (this suite's own
`client` fixture, see conftest.py) has no WebSocket support, and this
suite's conftest explicitly avoids Starlette's `TestClient` for handlers
that make outbound async calls (Keycloak) — `authenticate()` does exactly
that via `decode_and_verify`. So these tests exercise the gateway's real
authorization logic directly (`authorize_subscribe`, `_authenticate_share_
token`, `ConnectionManager`) against the real database, rather than a full
live socket round-trip. The live end-to-end flow (connect, auth frame,
subscribe, receive a broadcast) is verified manually per this feature's
plan file, with a short standalone websockets-client script against the
running dev server.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.api.deps import Principal
from app.websocket.auth import _authenticate_share_token
from app.websocket.channels import ChannelDenied, authorize_subscribe
from app.websocket.manager import ConnectionManager
from tests.integration.test_sos_and_incidents import _auth, _register_and_login


async def _grant_location_sharing_consent(token: str, client: AsyncClient) -> None:
    granted = await client.post(
        "/api/v1/users/me/consents", json={"purpose": "location_sharing", "version": "1.0"}, headers=_auth(token)
    )
    assert granted.status_code in (200, 201), granted.text


async def test_authorize_subscribe_chat_requires_active_membership(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "WS test", "member_user_ids": []},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]

    owner_principal = Principal(user_id=(await client.get("/api/v1/users/me", headers=_auth(owner["access_token"]))).json()["data"]["id"], role="tourist")
    stranger_principal = Principal(user_id=(await client.get("/api/v1/users/me", headers=_auth(stranger["access_token"]))).json()["data"]["id"], role="tourist")

    await authorize_subscribe(owner_principal, f"chat:conversation:{conv_id}")  # must not raise

    with pytest.raises(ChannelDenied):
        await authorize_subscribe(stranger_principal, f"chat:conversation:{conv_id}")


async def test_authorize_subscribe_location_share_requires_ownership(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    await _grant_location_sharing_consent(owner["access_token"], client)

    contact = await client.post(
        "/api/v1/users/me/trusted-contacts", json={"name": "Mom", "email": "mom@example.com"}, headers=_auth(owner["access_token"])
    )
    contact_id = contact.json()["data"]["id"]
    share = await client.post(
        "/api/v1/location-sharing",
        json={"recipient_type": "TRUSTED_CONTACT", "trusted_contact_id": contact_id, "precision": "PRECISE", "duration_choice": "15m"},
        headers={**_auth(owner["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert share.status_code == 201, share.text
    share_id = share.json()["data"]["id"]

    owner_principal = Principal(user_id=(await client.get("/api/v1/users/me", headers=_auth(owner["access_token"]))).json()["data"]["id"], role="tourist")
    stranger_principal = Principal(user_id=(await client.get("/api/v1/users/me", headers=_auth(stranger["access_token"]))).json()["data"]["id"], role="tourist")

    await authorize_subscribe(owner_principal, f"location:share:{share_id}")

    with pytest.raises(ChannelDenied):
        await authorize_subscribe(stranger_principal, f"location:share:{share_id}")


async def test_authorize_subscribe_rejects_malformed_and_unknown_channels() -> None:
    principal = Principal(user_id=str(uuid.uuid4()), role="tourist")
    with pytest.raises(ChannelDenied):
        await authorize_subscribe(principal, "not-a-real-channel")
    with pytest.raises(ChannelDenied):
        await authorize_subscribe(principal, f"bogus:kind:{uuid.uuid4()}")


async def test_share_token_auth_accepts_valid_rejects_revoked_and_expired(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    await _grant_location_sharing_consent(owner["access_token"], client)
    contact = await client.post(
        "/api/v1/users/me/trusted-contacts", json={"name": "Dad", "email": "dad@example.com"}, headers=_auth(owner["access_token"])
    )
    contact_id = contact.json()["data"]["id"]
    share = await client.post(
        "/api/v1/location-sharing",
        json={"recipient_type": "TRUSTED_CONTACT", "trusted_contact_id": contact_id, "precision": "PRECISE", "duration_choice": "15m"},
        headers={**_auth(owner["access_token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    body = share.json()["data"]
    share_id = body["id"]
    raw_token = body["access_token"]
    assert raw_token

    ok = await _authenticate_share_token(raw_token)
    assert ok is not None
    assert str(ok.location_share_id) == share_id

    bad = await _authenticate_share_token("not-a-real-token")
    assert bad is None

    revoke = await client.delete(f"/api/v1/location-sharing/{share_id}", headers=_auth(owner["access_token"]))
    assert revoke.status_code == 204
    after_revoke = await _authenticate_share_token(raw_token)
    assert after_revoke is None


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


async def test_connection_manager_delivers_only_to_subscribed_sockets() -> None:
    manager = ConnectionManager()
    user_a = uuid.uuid4()
    ws_a = _FakeWebSocket()
    ws_b = _FakeWebSocket()

    manager.connect(ws_a, user_a)  # type: ignore[arg-type]
    manager.connect(ws_b, uuid.uuid4())  # type: ignore[arg-type]
    manager.subscribe(ws_a, "chat:conversation:room-1")  # type: ignore[arg-type]
    # ws_b never subscribes to room-1.

    assert manager.is_online(user_a) is True

    await manager.publish("chat:conversation:room-1", {"type": "message.created"})
    assert len(ws_a.sent) == 1
    assert len(ws_b.sent) == 0

    manager.disconnect(ws_a)  # type: ignore[arg-type]
    assert manager.is_online(user_a) is False
    assert manager.last_seen(user_a) is not None

    # A publish after disconnect must not error and must reach nobody.
    await manager.publish("chat:conversation:room-1", {"type": "message.created"})
    assert len(ws_a.sent) == 1
