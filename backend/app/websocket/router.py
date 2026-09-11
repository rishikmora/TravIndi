"""`WS /api/v1/realtime` — the one WebSocket route. Auth via the first
frame (see `auth.py`), then channel subscribe/unsubscribe frames (see
`channels.py` for per-channel authorization), then a receive loop that
only ever handles ephemeral, never-persisted typing broadcasts — every
durable mutation (sending a message, pinging a location) still goes
through the existing REST endpoints; this loop never originates one.
"""

import json
import logging
import uuid

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.websocket.auth import ShareTokenAuth, authenticate
from app.websocket.channels import ChannelDenied, authorize_subscribe
from app.websocket.manager import manager, publish

logger = logging.getLogger(__name__)

router = APIRouter()

_CLOSE_POLICY_VIOLATION = 1008


@router.websocket("/realtime")
async def realtime(websocket: WebSocket) -> None:
    await websocket.accept()

    auth = await authenticate(websocket)
    if auth is None:
        await websocket.close(code=_CLOSE_POLICY_VIOLATION)
        return

    user_id = uuid.UUID(auth.user_id) if not isinstance(auth, ShareTokenAuth) else None
    manager.connect(websocket, user_id)
    await websocket.send_json({"type": "auth.ok"})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                frame = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                await websocket.send_json({"type": "error", "error": "Malformed frame."})
                continue

            frame_type = frame.get("type")

            if frame_type == "subscribe":
                channel = frame.get("channel")
                if not isinstance(channel, str):
                    await websocket.send_json({"type": "error", "error": "Missing channel."})
                    continue
                try:
                    await authorize_subscribe(auth, channel)
                except ChannelDenied as exc:
                    await websocket.send_json({"type": "error", "error": str(exc), "channel": channel})
                    continue
                manager.subscribe(websocket, channel)
                await websocket.send_json({"type": "subscribed", "channel": channel})
                if channel.startswith("chat:conversation:") and user_id is not None:
                    await publish(channel, {"type": "presence.updated", "user_id": str(user_id), "is_online": True})

            elif frame_type == "unsubscribe":
                channel = frame.get("channel")
                if isinstance(channel, str):
                    manager.unsubscribe(websocket, channel)
                    if channel.startswith("chat:conversation:") and user_id is not None:
                        await publish(
                            channel, {"type": "presence.updated", "user_id": str(user_id), "is_online": False}
                        )

            elif frame_type == "typing":
                channel = frame.get("channel")
                state = frame.get("state")
                if (
                    isinstance(channel, str)
                    and state in ("started", "stopped")
                    and manager.is_subscribed(websocket, channel)
                    and user_id is not None
                ):
                    await publish(channel, {"type": f"typing.{state}", "user_id": str(user_id)})

            else:
                await websocket.send_json({"type": "error", "error": f"Unknown frame type: {frame_type}"})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unhandled error in realtime WebSocket loop")
    finally:
        subscribed_chat_channels = [c for c in manager.channels_for(websocket) if c.startswith("chat:conversation:")]
        manager.disconnect(websocket)
        if user_id is not None:
            for channel in subscribed_chat_channels:
                await publish(channel, {"type": "presence.updated", "user_id": str(user_id), "is_online": False})
