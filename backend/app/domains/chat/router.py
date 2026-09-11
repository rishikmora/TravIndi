"""Chat — real conversations/messages (DIRECT/GROUP/TRIP), genuinely new.
Every mutation here happens over REST first; `app/websocket/` only ever
broadcasts what already happened (never originates a durable change
itself) via this module's own `_publish_event` calls.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session
from app.core.errors import AppError
from app.core.notify import notify
from app.domains.chat.models import (
    Conversation,
    ConversationMember,
    ConversationStatus,
    ConversationType,
    MemberRole,
    MemberStatus,
    Message,
    MessageReaction,
    MessageReport,
    MessageType,
    UserBlock,
)
from app.domains.chat.schemas import (
    ConversationCreateIn,
    ConversationMemberOut,
    ConversationOut,
    MarkReadIn,
    MessageEditIn,
    MessageOut,
    MessageSendIn,
    ReactionIn,
    ReportIn,
)
from app.domains.governance.audit import write_audit_log
from app.domains.group_travel.access import is_trip_owner_or_active_member
from app.domains.group_travel.models import TripMember, TripMemberStatus
from app.domains.travel.models import Trip
from app.schemas.common import DataResponse, ListMeta, ListResponse
from app.websocket.manager import manager, publish

router = APIRouter(tags=["chat"])

_ADMIN_ROLES = {"authority_platform_admin", "service"}
_MAX_MESSAGE_PAGE_SIZE = 100


def _require_platform_admin(principal: Principal) -> None:
    if principal.role not in _ADMIN_ROLES:
        raise AppError(code="FORBIDDEN", message="Only a platform admin account can moderate chat.", status_code=403)


async def _get_active_membership(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> ConversationMember:
    result = await session.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
            ConversationMember.status == MemberStatus.ACTIVE,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise AppError(code="NOT_A_MEMBER", message="This conversation is private.", status_code=403)
    return member


async def _get_conversation_or_404(session: AsyncSession, conversation_id: uuid.UUID) -> Conversation:
    conv = await session.get(Conversation, conversation_id)
    if conv is None:
        raise AppError(code="CONVERSATION_NOT_FOUND", message="No such conversation.", status_code=404)
    return conv


async def _is_blocked_between(session: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> bool:
    result = await session.execute(
        select(UserBlock.id).where(
            ((UserBlock.blocker_user_id == a) & (UserBlock.blocked_user_id == b))
            | ((UserBlock.blocker_user_id == b) & (UserBlock.blocked_user_id == a))
        )
    )
    return result.first() is not None


async def _to_conversation_out(session: AsyncSession, conv: Conversation, viewer_id: uuid.UUID) -> ConversationOut:
    members_result = await session.execute(
        select(ConversationMember).where(ConversationMember.conversation_id == conv.id)
    )
    members = members_result.scalars().all()
    viewer = next((m for m in members if m.user_id == viewer_id), None)

    last_message_result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(1)
    )
    last_message = last_message_result.scalars().first()

    unread_count = 0
    if last_message is not None and viewer is not None:
        cutoff_created_at = None
        if viewer.last_read_message_id is not None:
            cutoff = await session.get(Message, viewer.last_read_message_id)
            cutoff_created_at = cutoff.created_at if cutoff is not None else None
        count_query = select(Message.id).where(Message.conversation_id == conv.id)
        if cutoff_created_at is not None:
            count_query = count_query.where(Message.created_at > cutoff_created_at)
        unread_count = len((await session.execute(count_query)).all())

    return ConversationOut(
        id=conv.id,
        type=conv.type.value,
        title=conv.title,
        trip_id=conv.trip_id,
        creator_id=conv.creator_id,
        status=conv.status.value,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        members=[
            ConversationMemberOut(
                user_id=m.user_id,
                role=m.role.value,
                status=m.status.value,
                joined_at=m.joined_at,
                last_read_message_id=m.last_read_message_id,
                is_online=manager.is_online(m.user_id),
            )
            for m in members
        ],
        unread_count=unread_count,
        last_message_preview=(last_message.content or "").strip()[:120] if last_message and not last_message.deleted_at else (
            "This message was deleted." if last_message and last_message.deleted_at else None
        ),
        last_message_at=last_message.created_at if last_message else None,
    )


async def _to_message_out(session: AsyncSession, message: Message, conversation: Conversation) -> MessageOut:
    reactions_result = await session.execute(
        select(MessageReaction).where(MessageReaction.message_id == message.id)
    )
    reactions: dict[str, list[uuid.UUID]] = {}
    for r in reactions_result.scalars().all():
        reactions.setdefault(r.emoji, []).append(r.user_id)

    reply_preview = None
    if message.reply_to_message_id is not None:
        original = await session.get(Message, message.reply_to_message_id)
        if original is None or original.deleted_at is not None:
            reply_preview = "This message was deleted."
        else:
            reply_preview = (original.content or "").strip()[:80]

    seen_by_count = 0
    if not message.deleted_at:
        members_result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conversation.id,
                ConversationMember.status == MemberStatus.ACTIVE,
                ConversationMember.user_id != message.sender_id,
            )
        )
        for member in members_result.scalars().all():
            if member.last_read_message_id is None:
                continue
            read_row = await session.get(Message, member.last_read_message_id)
            if read_row is not None and read_row.created_at >= message.created_at:
                seen_by_count += 1

    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        client_message_id=message.client_message_id,
        content=None if message.deleted_at else message.content,
        message_type=message.message_type.value,
        reply_to_message_id=message.reply_to_message_id,
        reply_preview=reply_preview,
        shared_entity_type=None if message.deleted_at else message.shared_entity_type,
        shared_entity_id=None if message.deleted_at else message.shared_entity_id,
        location_share_id=None if message.deleted_at else message.location_share_id,
        mentions=[uuid.UUID(m) for m in message.mentions],
        created_at=message.created_at,
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
        reactions=reactions,
        seen_by_count=seen_by_count,
    )


async def _publish_message_event(event_type: str, conversation_id: uuid.UUID, payload: dict) -> None:
    await publish(f"chat:conversation:{conversation_id}", {"type": event_type, **payload})


@router.post("/conversations", response_model=DataResponse[ConversationOut], status_code=201)
async def create_conversation(
    body: ConversationCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ConversationOut]:
    user_id = uuid.UUID(principal.user_id)
    now = datetime.now(UTC)

    if body.type == "DIRECT":
        if len(body.member_user_ids) != 1 or body.member_user_ids[0] == user_id:
            raise AppError(
                code="INVALID_DIRECT_MEMBERS",
                message="A direct conversation needs exactly one other member.",
                status_code=422,
            )
        other_id = body.member_user_ids[0]
        if await _is_blocked_between(session, user_id, other_id):
            raise AppError(
                code="BLOCKED", message="You cannot start a conversation with this user.", status_code=403
            )
        # Get-or-create — real idempotency for "message this person",
        # never a fresh duplicate DIRECT conversation per click.
        existing = await session.execute(
            select(Conversation)
            .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
            .where(Conversation.type == ConversationType.DIRECT, ConversationMember.user_id == user_id)
        )
        for conv in existing.scalars().all():
            other_membership = await session.execute(
                select(ConversationMember.id).where(
                    ConversationMember.conversation_id == conv.id, ConversationMember.user_id == other_id
                )
            )
            if other_membership.first() is not None:
                return DataResponse(data=await _to_conversation_out(session, conv, user_id))

        conv = Conversation(type=ConversationType.DIRECT, creator_id=user_id, status=ConversationStatus.ACTIVE)
        session.add(conv)
        await session.flush()
        session.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role=MemberRole.OWNER, joined_at=now))
        session.add(ConversationMember(conversation_id=conv.id, user_id=other_id, role=MemberRole.MEMBER, joined_at=now))
        await session.flush()
        # Computed *before* commit, while get_rls_session's SET LOCAL GUCs
        # are still valid for this transaction — a post-commit read starts
        # a new transaction with those GUCs reset, and RLS would then see
        # no current_user_id and silently return zero rows (same reasoning
        # as location_sharing/router.py's ping handler).
        out = await _to_conversation_out(session, conv, user_id)
        await session.commit()
        return DataResponse(data=out)

    # GROUP
    conv = Conversation(
        type=ConversationType.GROUP, title=body.title, creator_id=user_id, status=ConversationStatus.ACTIVE
    )
    session.add(conv)
    await session.flush()
    session.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role=MemberRole.OWNER, joined_at=now))
    for member_id in body.member_user_ids:
        if member_id == user_id:
            continue
        session.add(ConversationMember(conversation_id=conv.id, user_id=member_id, role=MemberRole.MEMBER, joined_at=now))
    await session.flush()
    out = await _to_conversation_out(session, conv, user_id)
    await session.commit()
    return DataResponse(data=out)


@router.get("/conversations", response_model=ListResponse[ConversationOut])
async def list_conversations(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[ConversationOut]:
    user_id = uuid.UUID(principal.user_id)
    result = await session.execute(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user_id, ConversationMember.status == MemberStatus.ACTIVE)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    convs = result.scalars().all()
    return ListResponse(data=[await _to_conversation_out(session, c, user_id) for c in convs])


@router.get("/conversations/{conversation_id}", response_model=DataResponse[ConversationOut])
async def get_conversation(
    conversation_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ConversationOut]:
    user_id = uuid.UUID(principal.user_id)
    await _get_active_membership(session, conversation_id, user_id)
    conv = await session.get(Conversation, conversation_id)
    if conv is None:
        raise AppError(code="CONVERSATION_NOT_FOUND", message="No such conversation.", status_code=404)
    return DataResponse(data=await _to_conversation_out(session, conv, user_id))


async def _sync_trip_conversation_membership(
    session: AsyncSession, conv: Conversation, trip: Trip, *, caller_user_id: uuid.UUID
) -> None:
    """Idempotent upsert, run every time a trip's conversation is
    resolved — cheap given trip membership lists are small, and correct
    without a background job (none exists in this codebase to extend).

    The caller's own row is inserted first, deliberately — RLS's
    `WITH CHECK` on `conversation_members` allows inserting your own row
    unconditionally, but requires an *existing* active-membership row to
    insert someone else's; a brand-new conversation has none yet, so
    inserting any other member first (arbitrary set-iteration order)
    would be rejected."""
    now = datetime.now(UTC)
    active_trip_members = (
        await session.execute(select(TripMember).where(TripMember.trip_id == trip.id, TripMember.status == TripMemberStatus.ACTIVE))
    ).scalars().all()
    active_user_ids = {trip.user_id, *(tm.user_id for tm in active_trip_members)}
    ordered_user_ids = [caller_user_id, *(u for u in active_user_ids if u != caller_user_id)] if caller_user_id in active_user_ids else list(active_user_ids)

    existing = (
        await session.execute(select(ConversationMember).where(ConversationMember.conversation_id == conv.id))
    ).scalars().all()
    existing_by_user = {m.user_id: m for m in existing}

    for member_user_id in ordered_user_ids:
        member = existing_by_user.get(member_user_id)
        if member is None:
            session.add(
                ConversationMember(
                    conversation_id=conv.id,
                    user_id=member_user_id,
                    role=MemberRole.OWNER if member_user_id == trip.user_id else MemberRole.MEMBER,
                    joined_at=now,
                    status=MemberStatus.ACTIVE,
                )
            )
        elif member.status != MemberStatus.ACTIVE:
            member.status = MemberStatus.ACTIVE
            member.left_at = None

    for member_user_id, member in existing_by_user.items():
        if member_user_id not in active_user_ids and member.status == MemberStatus.ACTIVE:
            member.status = MemberStatus.LEFT
            member.left_at = now


@router.get("/trips/{trip_id}/conversation", response_model=DataResponse[ConversationOut])
async def get_or_create_trip_conversation(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ConversationOut]:
    user_id = uuid.UUID(principal.user_id)
    trip = await session.get(Trip, trip_id)
    if trip is None:
        raise AppError(code="TRIP_NOT_FOUND", message="No such trip.", status_code=404)
    if not await is_trip_owner_or_active_member(session, trip, principal.user_id):
        raise AppError(code="FORBIDDEN", message="You aren't part of this trip.", status_code=403)

    result = await session.execute(select(Conversation).where(Conversation.trip_id == trip_id))
    conv = result.scalar_one_or_none()
    if conv is None:
        conv = Conversation(
            type=ConversationType.TRIP, title=trip.title, trip_id=trip_id, creator_id=trip.user_id,
            status=ConversationStatus.ACTIVE,
        )
        session.add(conv)
        await session.flush()

    await _sync_trip_conversation_membership(session, conv, trip, caller_user_id=user_id)
    await session.flush()
    out = await _to_conversation_out(session, conv, user_id)
    await session.commit()
    return DataResponse(data=out)


@router.post("/conversations/{conversation_id}/members", response_model=DataResponse[ConversationOut])
async def add_conversation_members(
    conversation_id: uuid.UUID,
    member_user_ids: list[uuid.UUID],
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[ConversationOut]:
    user_id = uuid.UUID(principal.user_id)
    membership = await _get_active_membership(session, conversation_id, user_id)
    conv = await session.get(Conversation, conversation_id)
    if conv is None:
        raise AppError(code="CONVERSATION_NOT_FOUND", message="No such conversation.", status_code=404)
    if conv.type != ConversationType.GROUP:
        raise AppError(code="NOT_A_GROUP", message="Only group conversations support adding members.", status_code=409)
    if membership.role not in (MemberRole.ADMIN, MemberRole.OWNER):
        raise AppError(code="FORBIDDEN", message="Only an admin can add members.", status_code=403)

    now = datetime.now(UTC)
    for new_user_id in member_user_ids:
        existing = (
            await session.execute(
                select(ConversationMember).where(
                    ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == new_user_id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                ConversationMember(conversation_id=conversation_id, user_id=new_user_id, role=MemberRole.MEMBER, joined_at=now)
            )
        elif existing.status != MemberStatus.ACTIVE:
            existing.status = MemberStatus.ACTIVE
            existing.left_at = None
    await session.flush()
    out = await _to_conversation_out(session, conv, user_id)
    await session.commit()
    return DataResponse(data=out)


@router.delete("/conversations/{conversation_id}/members/{member_user_id}", status_code=204)
async def remove_conversation_member(
    conversation_id: uuid.UUID,
    member_user_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    user_id = uuid.UUID(principal.user_id)
    membership = await _get_active_membership(session, conversation_id, user_id)
    if member_user_id != user_id and membership.role not in (MemberRole.ADMIN, MemberRole.OWNER):
        raise AppError(code="FORBIDDEN", message="Only an admin can remove other members.", status_code=403)

    target = await _get_active_membership(session, conversation_id, member_user_id)
    target.status = MemberStatus.LEFT
    target.left_at = datetime.now(UTC)
    await session.commit()


@router.post("/conversations/{conversation_id}/messages", response_model=DataResponse[MessageOut], status_code=201)
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageSendIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[MessageOut]:
    sender_id = uuid.UUID(principal.user_id)
    sender_membership = await _get_active_membership(session, conversation_id, sender_id)
    conv = await session.get(Conversation, conversation_id)
    if conv is None:
        raise AppError(code="CONVERSATION_NOT_FOUND", message="No such conversation.", status_code=404)

    if conv.type == ConversationType.DIRECT:
        other = (
            await session.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id, ConversationMember.user_id != sender_id
                )
            )
        ).scalar_one_or_none()
        if other is not None and await _is_blocked_between(session, sender_id, other):
            raise AppError(code="BLOCKED", message="You cannot message this user.", status_code=403)

    # Mentions must resolve to real, active members of this conversation —
    # never an arbitrary user enumeration surface.
    if body.mentions:
        active_member_ids = {
            m
            for m, in (
                await session.execute(
                    select(ConversationMember.user_id).where(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.status == MemberStatus.ACTIVE,
                    )
                )
            ).all()
        }
        invalid = [str(m) for m in body.mentions if m not in active_member_ids]
        if invalid:
            raise AppError(code="INVALID_MENTION", message="Can only mention active members.", status_code=422)

    message: Message | None = None
    for _attempt in range(3):
        stmt = (
            pg_insert(Message)
            .values(
                conversation_id=conversation_id,
                sender_id=sender_id,
                client_message_id=body.client_message_id,
                content=body.content,
                message_type=MessageType(body.message_type),
                reply_to_message_id=body.reply_to_message_id,
                shared_entity_type=body.shared_entity_type,
                shared_entity_id=body.shared_entity_id,
                location_share_id=body.location_share_id,
                mentions=[str(m) for m in body.mentions],
            )
            .on_conflict_do_nothing(index_elements=["conversation_id", "sender_id", "client_message_id"])
            .returning(Message)
        )
        result = await session.execute(stmt)
        message = result.scalar_one_or_none()
        if message is not None:
            break
        existing_result = await session.execute(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.sender_id == sender_id,
                Message.client_message_id == body.client_message_id,
            )
        )
        message = existing_result.scalar_one_or_none()
        if message is not None:
            break
        # Read-committed race: the winner hasn't committed yet — retry.

    if message is None:
        raise AppError(code="MESSAGE_SEND_FAILED", message="Could not send this message, please retry.", status_code=409, retryable=True)

    conv.updated_at = datetime.now(UTC)
    sender_membership.last_read_message_id = message.id

    out = await _to_message_out(session, message, conv)

    if body.mentions:
        for mentioned_id in body.mentions:
            if mentioned_id != sender_id:
                await notify(
                    session,
                    user_id=mentioned_id,
                    title="You were mentioned",
                    body=(body.content or "shared something")[:200],
                    notification_type="chat_mention",
                    priority="normal",
                    related_entity_type="chat_message",
                    related_entity_id=message.id,
                )
    else:
        other_members = (
            await session.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.status == MemberStatus.ACTIVE,
                    ConversationMember.user_id != sender_id,
                )
            )
        ).all()
        for (member_user_id,) in other_members:
            await notify(
                session,
                user_id=member_user_id,
                title=conv.title or "New message",
                body=(body.content or "shared something")[:200],
                notification_type="chat_new_message",
                priority="normal",
                related_entity_type="chat_message",
                related_entity_id=message.id,
            )

    await session.commit()
    await _publish_message_event("message.created", conversation_id, {"message": out.model_dump(mode="json")})
    return DataResponse(data=out)


@router.get("/conversations/{conversation_id}/messages", response_model=ListResponse[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=_MAX_MESSAGE_PAGE_SIZE),
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[MessageOut]:
    user_id = uuid.UUID(principal.user_id)
    await _get_active_membership(session, conversation_id, user_id)
    conv = await session.get(Conversation, conversation_id)
    if conv is None:
        raise AppError(code="CONVERSATION_NOT_FOUND", message="No such conversation.", status_code=404)

    query = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id.desc()).limit(limit + 1)
    if cursor is not None:
        try:
            cursor_id = uuid.UUID(cursor)
        except ValueError as exc:
            raise AppError(code="INVALID_CURSOR", message="Invalid pagination cursor.", status_code=422) from exc
        query = query.where(Message.id < cursor_id)

    rows = (await session.execute(query)).scalars().all()
    has_more = len(rows) > limit
    page = rows[:limit]
    out = [await _to_message_out(session, m, conv) for m in reversed(page)]
    next_cursor = str(page[-1].id) if has_more and page else None
    return ListResponse(data=out, meta=ListMeta(next_cursor=next_cursor, has_more=has_more))


@router.patch("/messages/{message_id}", response_model=DataResponse[MessageOut])
async def edit_message(
    message_id: uuid.UUID,
    body: MessageEditIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[MessageOut]:
    user_id = uuid.UUID(principal.user_id)
    message = await session.get(Message, message_id)
    if message is None or message.deleted_at is not None:
        raise AppError(code="MESSAGE_NOT_FOUND", message="No such message.", status_code=404)
    await _get_active_membership(session, message.conversation_id, user_id)
    if message.sender_id != user_id:
        raise AppError(code="FORBIDDEN", message="You can only edit your own messages.", status_code=403)

    message.content = body.content
    message.edited_at = datetime.now(UTC)
    conv = await _get_conversation_or_404(session, message.conversation_id)
    out = await _to_message_out(session, message, conv)
    await session.commit()
    await _publish_message_event("message.updated", message.conversation_id, {"message": out.model_dump(mode="json")})
    return DataResponse(data=out)


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    """"Delete for everyone" only — this pass doesn't implement a separate
    "delete for me" (a per-viewer hide flag), a real simplification stated
    plainly. A platform admin may also delete as moderation, audited."""
    user_id = uuid.UUID(principal.user_id)
    message = await session.get(Message, message_id)
    if message is None or message.deleted_at is not None:
        raise AppError(code="MESSAGE_NOT_FOUND", message="No such message.", status_code=404)

    is_moderator = principal.role in _ADMIN_ROLES
    if not is_moderator:
        await _get_active_membership(session, message.conversation_id, user_id)
        if message.sender_id != user_id:
            raise AppError(code="FORBIDDEN", message="You can only delete your own messages.", status_code=403)

    message.deleted_at = datetime.now(UTC)
    message.content = None
    if is_moderator and message.sender_id != user_id:
        await write_audit_log(
            session, actor_user_id=principal.user_id, action="MODERATOR_DELETE_MESSAGE",
            resource_type="chat_message", resource_id=message.id, metadata={},
        )
    await session.commit()
    await _publish_message_event(
        "message.deleted", message.conversation_id, {"message_id": str(message_id)}
    )


@router.post("/messages/{message_id}/reactions", response_model=DataResponse[MessageOut])
async def add_reaction(
    message_id: uuid.UUID,
    body: ReactionIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[MessageOut]:
    user_id = uuid.UUID(principal.user_id)
    message = await session.get(Message, message_id)
    if message is None or message.deleted_at is not None:
        raise AppError(code="MESSAGE_NOT_FOUND", message="No such message.", status_code=404)
    await _get_active_membership(session, message.conversation_id, user_id)

    stmt = (
        pg_insert(MessageReaction)
        .values(message_id=message_id, user_id=user_id, emoji=body.emoji)
        .on_conflict_do_nothing(index_elements=["message_id", "user_id", "emoji"])
    )
    await session.execute(stmt)
    conv = await _get_conversation_or_404(session, message.conversation_id)
    out = await _to_message_out(session, message, conv)
    await session.commit()
    await _publish_message_event(
        "message.reaction_added", message.conversation_id,
        {"message_id": str(message_id), "user_id": str(user_id), "emoji": body.emoji},
    )
    return DataResponse(data=out)


@router.delete("/messages/{message_id}/reactions/{emoji}", response_model=DataResponse[MessageOut])
async def remove_reaction(
    message_id: uuid.UUID,
    emoji: str,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[MessageOut]:
    user_id = uuid.UUID(principal.user_id)
    message = await session.get(Message, message_id)
    if message is None:
        raise AppError(code="MESSAGE_NOT_FOUND", message="No such message.", status_code=404)
    await _get_active_membership(session, message.conversation_id, user_id)

    existing = (
        await session.execute(
            select(MessageReaction).where(
                MessageReaction.message_id == message_id, MessageReaction.user_id == user_id, MessageReaction.emoji == emoji
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        await session.delete(existing)
    conv = await _get_conversation_or_404(session, message.conversation_id)
    out = await _to_message_out(session, message, conv)
    await session.commit()
    await _publish_message_event(
        "message.reaction_removed", message.conversation_id,
        {"message_id": str(message_id), "user_id": str(user_id), "emoji": emoji},
    )
    return DataResponse(data=out)


@router.post("/messages/{message_id}/report", status_code=201)
async def report_message(
    message_id: uuid.UUID,
    body: ReportIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[dict]:
    user_id = uuid.UUID(principal.user_id)
    message = await session.get(Message, message_id)
    if message is None:
        raise AppError(code="MESSAGE_NOT_FOUND", message="No such message.", status_code=404)
    await _get_active_membership(session, message.conversation_id, user_id)

    report = MessageReport(message_id=message_id, reporter_user_id=user_id, reason=body.reason)
    session.add(report)
    await session.flush()
    await write_audit_log(
        session, actor_user_id=principal.user_id, action="REPORT_MESSAGE",
        resource_type="chat_message", resource_id=message_id, metadata={"reason": body.reason},
    )
    await session.commit()
    return DataResponse(data={"report_id": str(report.id)})


@router.get("/chat/reports", response_model=ListResponse[dict])
async def list_message_reports(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[dict]:
    _require_platform_admin(principal)
    rows = (
        await session.execute(select(MessageReport).where(MessageReport.resolved_at.is_(None)).order_by(MessageReport.created_at.desc()))
    ).scalars().all()
    return ListResponse(
        data=[
            {
                "id": str(r.id), "message_id": str(r.message_id), "reporter_user_id": str(r.reporter_user_id),
                "reason": r.reason, "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    )


@router.post("/chat/reports/{report_id}/resolve", response_model=DataResponse[dict])
async def resolve_message_report(
    report_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[dict]:
    _require_platform_admin(principal)
    report = await session.get(MessageReport, report_id)
    if report is None:
        raise AppError(code="REPORT_NOT_FOUND", message="No such report.", status_code=404)
    report.resolved_at = datetime.now(UTC)
    report.resolved_by = uuid.UUID(principal.user_id)
    await write_audit_log(
        session, actor_user_id=principal.user_id, action="RESOLVE_REPORT",
        resource_type="chat_message_report", resource_id=report.id, metadata={},
    )
    await session.commit()
    return DataResponse(data={"resolved": True})


@router.post("/conversations/{conversation_id}/read", status_code=204)
async def mark_conversation_read(
    conversation_id: uuid.UUID,
    body: MarkReadIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    user_id = uuid.UUID(principal.user_id)
    member = await _get_active_membership(session, conversation_id, user_id)
    message = await session.get(Message, body.message_id)
    if message is None or message.conversation_id != conversation_id:
        raise AppError(code="MESSAGE_NOT_FOUND", message="No such message in this conversation.", status_code=404)
    member.last_read_message_id = body.message_id
    await session.commit()
    await publish(
        f"chat:conversation:{conversation_id}",
        {"type": "message.read", "user_id": str(user_id), "message_id": str(body.message_id)},
    )


@router.post("/users/{blocked_user_id}/block", status_code=204)
async def block_user(
    blocked_user_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    user_id = uuid.UUID(principal.user_id)
    if blocked_user_id == user_id:
        raise AppError(code="CANNOT_BLOCK_SELF", message="You cannot block yourself.", status_code=422)
    stmt = pg_insert(UserBlock).values(blocker_user_id=user_id, blocked_user_id=blocked_user_id).on_conflict_do_nothing(
        index_elements=["blocker_user_id", "blocked_user_id"]
    )
    await session.execute(stmt)
    await session.commit()


@router.delete("/users/{blocked_user_id}/block", status_code=204)
async def unblock_user(
    blocked_user_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    user_id = uuid.UUID(principal.user_id)
    existing = (
        await session.execute(
            select(UserBlock).where(UserBlock.blocker_user_id == user_id, UserBlock.blocked_user_id == blocked_user_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        await session.delete(existing)
        await session.commit()
