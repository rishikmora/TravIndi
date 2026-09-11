"""The one in-process fanout point every realtime event goes through.

`publish()` is deliberately the single seam: every caller (chat message
send, location-share ping/lifecycle, group-travel location update) calls
`publish(channel, event)` and nothing else. If this ever needs to run on
more than one backend process, swapping this module's internals for a
Redis pub/sub subscriber is a change contained to this file.

Presence is derived from `ConnectionManager`'s own live socket set — never
persisted, and explicitly lost on a process restart (stated plainly, not
hidden as if durable).
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


@dataclass
class Connection:
    websocket: WebSocket
    user_id: uuid.UUID | None  # None for a public share-token connection
    channels: set[str] = field(default_factory=set)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[WebSocket, Connection] = {}
        self._by_channel: dict[str, set[WebSocket]] = defaultdict(set)
        # user_id -> {channel scopes the user is present in} -> last-seen,
        # purely in-memory. Presence is "has a live socket right now";
        # last_seen is when that stopped being true.
        self._last_seen: dict[uuid.UUID, datetime] = {}

    def connect(self, websocket: WebSocket, user_id: uuid.UUID | None) -> None:
        self._connections[websocket] = Connection(websocket=websocket, user_id=user_id)

    def disconnect(self, websocket: WebSocket) -> None:
        conn = self._connections.pop(websocket, None)
        if conn is None:
            return
        for channel in conn.channels:
            self._by_channel[channel].discard(websocket)
            if not self._by_channel[channel]:
                del self._by_channel[channel]
        if conn.user_id is not None and not self.is_online(conn.user_id):
            self._last_seen[conn.user_id] = datetime.now(UTC)

    def subscribe(self, websocket: WebSocket, channel: str) -> None:
        conn = self._connections.get(websocket)
        if conn is None:
            return
        conn.channels.add(channel)
        self._by_channel[channel].add(websocket)

    def unsubscribe(self, websocket: WebSocket, channel: str) -> None:
        conn = self._connections.get(websocket)
        if conn is not None:
            conn.channels.discard(channel)
        self._by_channel[channel].discard(websocket)
        if not self._by_channel[channel]:
            del self._by_channel[channel]

    def is_online(self, user_id: uuid.UUID) -> bool:
        return any(conn.user_id == user_id for conn in self._connections.values())

    def channels_for(self, websocket: WebSocket) -> set[str]:
        conn = self._connections.get(websocket)
        return set(conn.channels) if conn is not None else set()

    def is_subscribed(self, websocket: WebSocket, channel: str) -> bool:
        return channel in self.channels_for(websocket)

    def last_seen(self, user_id: uuid.UUID) -> datetime | None:
        return self._last_seen.get(user_id)

    async def publish(self, channel: str, event: dict) -> None:
        # The event itself never carries which channel it came from unless
        # tagged here — a client subscribed to several channels (e.g. more
        # than one conversation at once) has no other way to route an
        # incoming frame to the right handler.
        tagged = {**event, "channel": channel}
        for websocket in list(self._by_channel.get(channel, ())):
            try:
                await websocket.send_json(tagged)
            except (RuntimeError, WebSocketDisconnect):
                # A dead socket that hasn't been reaped yet — never let one
                # bad connection break delivery to everyone else.
                self.disconnect(websocket)


manager = ConnectionManager()


async def publish(channel: str, event: dict) -> None:
    await manager.publish(channel, event)
