"""Chat domain — real conversations/messages (DIRECT/GROUP/TRIP), genuinely
new. Every test here exercises the actual REST endpoints against the real
database; realtime WebSocket delivery is covered separately in
tests/integration/test_websocket_gateway.py (auth/channel-authorization
unit-level tests) since httpx's ASGITransport has no WebSocket support and
this suite's own conftest explicitly avoids Starlette's TestClient for
handlers that make outbound async calls (see conftest.py's docstring).
"""

import uuid

from httpx import AsyncClient

from tests.integration.test_sos_and_incidents import _auth, _register_and_login


async def _user_id(client: AsyncClient, token: str) -> str:
    me = await client.get("/api/v1/users/me", headers=_auth(token))
    return me.json()["data"]["id"]


async def test_direct_conversation_create_is_idempotent_and_private(client: AsyncClient) -> None:
    a = await _register_and_login(client)
    b = await _register_and_login(client)
    b_id = await _user_id(client, b["access_token"])

    first = await client.post(
        "/api/v1/conversations", json={"type": "DIRECT", "member_user_ids": [b_id]}, headers=_auth(a["access_token"])
    )
    assert first.status_code == 201, first.text
    conv = first.json()["data"]
    assert conv["type"] == "DIRECT"
    assert {m["user_id"] for m in conv["members"]} == {await _user_id(client, a["access_token"]), b_id}

    # Creating "the same" DIRECT conversation again must return the
    # existing one, never a duplicate — real get-or-create idempotency.
    second = await client.post(
        "/api/v1/conversations", json={"type": "DIRECT", "member_user_ids": [b_id]}, headers=_auth(a["access_token"])
    )
    assert second.status_code == 201
    assert second.json()["data"]["id"] == conv["id"]

    # A stranger is not a member and must not be able to see it.
    stranger = await _register_and_login(client)
    denied = await client.get(f"/api/v1/conversations/{conv['id']}", headers=_auth(stranger["access_token"]))
    assert denied.status_code in (403, 404)


async def test_group_conversation_message_send_and_history(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    member = await _register_and_login(client)
    member_id = await _user_id(client, member["access_token"])

    created = await client.post(
        "/api/v1/conversations",
        json={"type": "GROUP", "title": "Trip planning", "member_user_ids": [member_id]},
        headers=_auth(owner["access_token"]),
    )
    assert created.status_code == 201, created.text
    conv_id = created.json()["data"]["id"]

    sent = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={"client_message_id": str(uuid.uuid4()), "content": "Hey team!"},
        headers=_auth(owner["access_token"]),
    )
    assert sent.status_code == 201, sent.text
    message = sent.json()["data"]
    assert message["content"] == "Hey team!"
    assert message["message_type"] == "TEXT"

    history = await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=_auth(member["access_token"]))
    assert history.status_code == 200
    assert len(history.json()["data"]) == 1
    assert history.json()["data"][0]["id"] == message["id"]


async def test_duplicate_client_message_id_never_creates_a_second_message(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Solo notes", "member_user_ids": []},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]
    client_message_id = str(uuid.uuid4())
    body = {"client_message_id": client_message_id, "content": "Retry me"}

    first = await client.post(f"/api/v1/conversations/{conv_id}/messages", json=body, headers=_auth(owner["access_token"]))
    assert first.status_code == 201
    second = await client.post(f"/api/v1/conversations/{conv_id}/messages", json=body, headers=_auth(owner["access_token"]))
    assert second.status_code == 201
    assert second.json()["data"]["id"] == first.json()["data"]["id"]

    history = await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=_auth(owner["access_token"]))
    assert len(history.json()["data"]) == 1


async def test_non_member_cannot_send_or_read_messages(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Private", "member_user_ids": []},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]

    send_denied = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={"client_message_id": str(uuid.uuid4()), "content": "sneaky"},
        headers=_auth(stranger["access_token"]),
    )
    assert send_denied.status_code == 403

    read_denied = await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=_auth(stranger["access_token"]))
    assert read_denied.status_code == 403


async def test_blocked_user_cannot_start_or_send_direct_message(client: AsyncClient) -> None:
    a = await _register_and_login(client)
    b = await _register_and_login(client)
    a_id = await _user_id(client, a["access_token"])
    b_id = await _user_id(client, b["access_token"])

    block = await client.post(f"/api/v1/users/{b_id}/block", headers=_auth(a["access_token"]))
    assert block.status_code == 204

    denied = await client.post(
        "/api/v1/conversations", json={"type": "DIRECT", "member_user_ids": [b_id]}, headers=_auth(a["access_token"])
    )
    assert denied.status_code == 403

    # Blocking is symmetric for DM creation — b cannot start one with a either.
    denied_reverse = await client.post(
        "/api/v1/conversations", json={"type": "DIRECT", "member_user_ids": [a_id]}, headers=_auth(b["access_token"])
    )
    assert denied_reverse.status_code == 403

    unblock = await client.delete(f"/api/v1/users/{b_id}/block", headers=_auth(a["access_token"]))
    assert unblock.status_code == 204
    allowed = await client.post(
        "/api/v1/conversations", json={"type": "DIRECT", "member_user_ids": [b_id]}, headers=_auth(a["access_token"])
    )
    assert allowed.status_code == 201


async def test_reply_reaction_edit_and_delete(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Reactions", "member_user_ids": []},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]
    headers = _auth(owner["access_token"])

    original = (
        await client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"client_message_id": str(uuid.uuid4()), "content": "Original"},
            headers=headers,
        )
    ).json()["data"]

    reply = (
        await client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"client_message_id": str(uuid.uuid4()), "content": "A reply", "reply_to_message_id": original["id"]},
            headers=headers,
        )
    ).json()["data"]
    assert reply["reply_preview"] == "Original"

    reacted = await client.post(f"/api/v1/messages/{original['id']}/reactions", json={"emoji": "👍"}, headers=headers)
    assert reacted.status_code == 200
    assert "👍" in reacted.json()["data"]["reactions"]

    edited = await client.patch(f"/api/v1/messages/{original['id']}", json={"content": "Edited!"}, headers=headers)
    assert edited.status_code == 200
    assert edited.json()["data"]["content"] == "Edited!"
    assert edited.json()["data"]["edited_at"] is not None

    deleted = await client.delete(f"/api/v1/messages/{original['id']}", headers=headers)
    assert deleted.status_code == 204

    reply_after_delete = await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=headers)
    by_id = {m["id"]: m for m in reply_after_delete.json()["data"]}
    assert by_id[original["id"]]["content"] is None
    assert by_id[original["id"]]["deleted_at"] is not None
    assert by_id[reply["id"]]["reply_preview"] == "This message was deleted."


async def test_report_message_and_admin_resolve(client: AsyncClient) -> None:
    from tests.integration.test_sos_and_incidents import _login_police
    from tests.integration.test_trust_and_business import _login_admin

    reporter = await _register_and_login(client)
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Reportable", "member_user_ids": []},
        headers=_auth(reporter["access_token"]),
    )
    conv_id = created.json()["data"]["id"]
    message = (
        await client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"client_message_id": str(uuid.uuid4()), "content": "questionable"},
            headers=_auth(reporter["access_token"]),
        )
    ).json()["data"]

    reported = await client.post(
        f"/api/v1/messages/{message['id']}/report", json={"reason": "spam"}, headers=_auth(reporter["access_token"])
    )
    assert reported.status_code == 201
    report_id = reported.json()["data"]["report_id"]

    # A plain tourist cannot see the moderation queue.
    denied = await client.get("/api/v1/chat/reports", headers=_auth(reporter["access_token"]))
    assert denied.status_code == 403

    # Nor can a non-platform-admin authority role (police).
    police = await _login_police(client)
    police_denied = await client.get("/api/v1/chat/reports", headers=_auth(police["access_token"]))
    assert police_denied.status_code == 403

    admin = await _login_admin(client)
    listed = await client.get("/api/v1/chat/reports", headers=_auth(admin["access_token"]))
    assert listed.status_code == 200
    assert any(r["id"] == report_id for r in listed.json()["data"])

    resolved = await client.post(f"/api/v1/chat/reports/{report_id}/resolve", headers=_auth(admin["access_token"]))
    assert resolved.status_code == 200
    assert resolved.json()["data"]["resolved"] is True

    listed_after = await client.get("/api/v1/chat/reports", headers=_auth(admin["access_token"]))
    assert not any(r["id"] == report_id for r in listed_after.json()["data"])


async def test_cursor_pagination_over_many_messages(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Paged", "member_user_ids": []},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]
    headers = _auth(owner["access_token"])

    for i in range(5):
        await client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"client_message_id": str(uuid.uuid4()), "content": f"msg-{i}"},
            headers=headers,
        )

    first_page = await client.get(f"/api/v1/conversations/{conv_id}/messages?limit=2", headers=headers)
    assert first_page.status_code == 200
    body = first_page.json()
    assert len(body["data"]) == 2
    assert body["meta"]["has_more"] is True
    cursor = body["meta"]["next_cursor"]
    assert cursor is not None

    second_page = await client.get(f"/api/v1/conversations/{conv_id}/messages?limit=2&cursor={cursor}", headers=headers)
    assert second_page.status_code == 200
    second_ids = {m["id"] for m in second_page.json()["data"]}
    first_ids = {m["id"] for m in body["data"]}
    assert first_ids.isdisjoint(second_ids)


async def test_trip_conversation_auto_creates_and_syncs_membership(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    member = await _register_and_login(client)
    member_email = member["email"]

    trip = await client.post("/api/v1/trips", json={"title": "Hyderabad Heritage Weekend"}, headers=_auth(owner["access_token"]))
    trip_id = trip.json()["data"]["id"]

    invite = await client.post(
        f"/api/v1/group-travel/trips/{trip_id}/members", json={"email": member_email}, headers=_auth(owner["access_token"])
    )
    assert invite.status_code == 201, invite.text
    member_row_id = invite.json()["data"]["id"]
    accept = await client.post(f"/api/v1/group-travel/members/{member_row_id}/accept", headers=_auth(member["access_token"]))
    assert accept.status_code == 200, accept.text

    owner_view = await client.get(f"/api/v1/trips/{trip_id}/conversation", headers=_auth(owner["access_token"]))
    assert owner_view.status_code == 200, owner_view.text
    conv = owner_view.json()["data"]
    assert conv["type"] == "TRIP"
    member_ids = {m["user_id"] for m in conv["members"]}
    assert await _user_id(client, member["access_token"]) in member_ids

    # The member can independently resolve the same conversation.
    member_view = await client.get(f"/api/v1/trips/{trip_id}/conversation", headers=_auth(member["access_token"]))
    assert member_view.status_code == 200
    assert member_view.json()["data"]["id"] == conv["id"]

    outsider = await _register_and_login(client)
    denied = await client.get(f"/api/v1/trips/{trip_id}/conversation", headers=_auth(outsider["access_token"]))
    assert denied.status_code == 403


async def test_mark_read_updates_unread_count_and_seen_by(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    member = await _register_and_login(client)
    member_id = await _user_id(client, member["access_token"])
    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Read state", "member_user_ids": [member_id]},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]

    sent = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={"client_message_id": str(uuid.uuid4()), "content": "please read this"},
        headers=_auth(owner["access_token"]),
    )
    message_id = sent.json()["data"]["id"]

    before = await client.get(f"/api/v1/conversations/{conv_id}", headers=_auth(member["access_token"]))
    assert before.json()["data"]["unread_count"] == 1

    read = await client.post(
        f"/api/v1/conversations/{conv_id}/read", json={"message_id": message_id}, headers=_auth(member["access_token"])
    )
    assert read.status_code == 204

    after = await client.get(f"/api/v1/conversations/{conv_id}", headers=_auth(member["access_token"]))
    assert after.json()["data"]["unread_count"] == 0

    seen = await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=_auth(owner["access_token"]))
    assert seen.json()["data"][0]["seen_by_count"] == 1


async def test_mentions_must_be_active_members(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    outsider = await _register_and_login(client)
    outsider_id = await _user_id(client, outsider["access_token"])

    created = await client.post(
        "/api/v1/conversations", json={"type": "GROUP", "title": "Mentions", "member_user_ids": []},
        headers=_auth(owner["access_token"]),
    )
    conv_id = created.json()["data"]["id"]

    denied = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={"client_message_id": str(uuid.uuid4()), "content": "hi", "mentions": [outsider_id]},
        headers=_auth(owner["access_token"]),
    )
    assert denied.status_code == 422
