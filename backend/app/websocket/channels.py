"""Per-channel subscribe authorization. A socket never joins a channel
just because it asked — every subscribe is checked against real data
(the same ownership/membership rules the equivalent REST endpoints
already enforce), in a fresh short-lived session (`rls_session`), before
`ConnectionManager.subscribe()` is ever called.

Channel name grammar:
- `chat:conversation:{conversation_id}`
- `location:share:{share_id}`
- `location:group:{trip_id}`
- `adaptation:trip:{trip_id}`
"""

import uuid

from sqlalchemy import select

from app.api.deps import Principal
from app.domains.chat.models import ConversationMember, MemberStatus
from app.domains.group_travel.access import is_trip_owner_or_active_member
from app.domains.location_sharing.models import LocationShare
from app.domains.travel.models import Trip
from app.websocket.auth import ShareTokenAuth
from app.websocket.session import rls_session


class ChannelDenied(Exception):
    pass


def _parse_channel(channel: str) -> tuple[str, str, uuid.UUID]:
    parts = channel.split(":")
    if len(parts) != 3:
        raise ChannelDenied(f"Malformed channel: {channel}")
    kind, scope, raw_id = parts
    try:
        return kind, scope, uuid.UUID(raw_id)
    except ValueError as exc:
        raise ChannelDenied(f"Malformed channel id: {channel}") from exc


async def authorize_subscribe(auth: Principal | ShareTokenAuth, channel: str) -> None:
    """Raises `ChannelDenied` if the connection may not join this channel."""
    kind, scope, entity_id = _parse_channel(channel)

    if isinstance(auth, ShareTokenAuth):
        if kind == "location" and scope == "share" and entity_id == auth.location_share_id:
            return
        raise ChannelDenied("A share-link connection may only subscribe to its own share channel.")

    user_id = uuid.UUID(auth.user_id)

    if kind == "chat" and scope == "conversation":
        async with rls_session(user_id, auth.role) as session:
            result = await session.execute(
                select(ConversationMember.id).where(
                    ConversationMember.conversation_id == entity_id,
                    ConversationMember.user_id == user_id,
                    ConversationMember.status == MemberStatus.ACTIVE,
                )
            )
            if result.first() is None:
                raise ChannelDenied("Not an active member of this conversation.")
        return

    if kind == "location" and scope == "share":
        async with rls_session(user_id, auth.role) as session:
            share = await session.get(LocationShare, entity_id)
            if share is None or share.user_id != user_id:
                raise ChannelDenied("Not the owner of this location share.")
        return

    if kind == "location" and scope == "group":
        async with rls_session(user_id, auth.role) as session:
            trip = await session.get(Trip, entity_id)
            if trip is None or not await is_trip_owner_or_active_member(session, trip, str(user_id)):
                raise ChannelDenied("Not a member of this trip.")
        return

    if kind == "adaptation" and scope == "trip":
        async with rls_session(user_id, auth.role) as session:
            trip = await session.get(Trip, entity_id)
            if trip is None or not await is_trip_owner_or_active_member(session, trip, str(user_id)):
                raise ChannelDenied("Not a member of this trip.")
        return

    raise ChannelDenied(f"Unknown channel kind: {channel}")
