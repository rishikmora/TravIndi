"""Chat domain models — `chat` schema.

Ordering is server-set `created_at` + the already-monotonic UUIDv7 `id`
(via `UUIDPKMixin`) as tie-breaker — deliberately no separate per-
conversation integer sequence column, which would need a hot-row lock
under concurrent sends for no real benefit over what UUIDv7 already gives
for free.

Idempotency is unique on `(conversation_id, sender_id, client_message_id)`
— not `(conversation_id, client_message_id)` alone — the same lesson
this session's own `sync.sync_operations` ledger already encoded: a
client-generated id must never let one member's retry collide with, or be
confused for, another member's message.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class ConversationType(enum.StrEnum):
    DIRECT = "DIRECT"
    GROUP = "GROUP"
    TRIP = "TRIP"


class ConversationStatus(enum.StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class MemberRole(enum.StrEnum):
    MEMBER = "MEMBER"
    ADMIN = "ADMIN"
    OWNER = "OWNER"


class MemberStatus(enum.StrEnum):
    ACTIVE = "ACTIVE"
    LEFT = "LEFT"


class MessageType(enum.StrEnum):
    TEXT = "TEXT"
    LOCATION = "LOCATION"
    SHARED_ENTITY = "SHARED_ENTITY"
    SYSTEM = "SYSTEM"


class Conversation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = {"schema": "chat"}

    type: Mapped[ConversationType] = mapped_column(
        Enum(ConversationType, name="conversation_type", schema="chat"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(200))
    trip_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("travel.trips.id", ondelete="CASCADE"))
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    status: Mapped[ConversationStatus] = mapped_column(
        Enum(ConversationStatus, name="conversation_status", schema="chat"),
        nullable=False,
        default=ConversationStatus.ACTIVE,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    members: Mapped[list["ConversationMember"]] = relationship(back_populates="conversation")


class Message(UUIDPKMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "sender_id", "client_message_id", name="uq_messages_sender_client_id"),
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
        {"schema": "chat"},
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat.conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    client_message_id: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    message_type: Mapped[MessageType] = mapped_column(
        Enum(MessageType, name="message_type", schema="chat"), nullable=False
    )
    reply_to_message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("chat.messages.id"))
    # One generic pointer for "share this from the app into chat"
    # (itinerary item / place / trip) instead of a separate message_type
    # per entity kind — deliberately simpler than a 5-way type union with
    # near-identical rendering.
    shared_entity_type: Mapped[str | None] = mapped_column(String(32))
    shared_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    location_share_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("location_sharing.location_shares.id"))
    mentions: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    conversation: Mapped["Conversation"] = relationship()
    reactions: Mapped[list["MessageReaction"]] = relationship(back_populates="message")


class ConversationMember(UUIDPKMixin, Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_members_conversation_user"),
        Index("ix_conversation_members_conversation_user_status", "conversation_id", "user_id", "status"),
        {"schema": "chat"},
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat.conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole, name="conversation_member_role", schema="chat"), nullable=False, default=MemberRole.MEMBER
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_read_message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("chat.messages.id"))
    status: Mapped[MemberStatus] = mapped_column(
        Enum(MemberStatus, name="conversation_member_status", schema="chat"),
        nullable=False,
        default=MemberStatus.ACTIVE,
    )

    conversation: Mapped["Conversation"] = relationship(back_populates="members")


class MessageReaction(UUIDPKMixin, Base):
    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reactions_message_user_emoji"),
        {"schema": "chat"},
    )

    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat.messages.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    message: Mapped["Message"] = relationship(back_populates="reactions")


class MessageReport(UUIDPKMixin, Base):
    __tablename__ = "message_reports"
    __table_args__ = {"schema": "chat"}

    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat.messages.id", ondelete="CASCADE"), nullable=False)
    reporter_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))


class UserBlock(UUIDPKMixin, Base):
    __tablename__ = "user_blocks"
    __table_args__ = (
        UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_blocks_pair"),
        CheckConstraint("blocker_user_id != blocked_user_id", name="ck_user_blocks_not_self"),
        {"schema": "chat"},
    )

    blocker_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    blocked_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
