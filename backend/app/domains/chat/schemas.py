import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ConversationTypeIn = Literal["DIRECT", "GROUP"]
SharedEntityType = Literal["itinerary_item", "destination", "trip"]


class ConversationCreateIn(BaseModel):
    type: ConversationTypeIn
    member_user_ids: list[uuid.UUID] = Field(default_factory=list)
    title: str | None = None


class ConversationMemberOut(BaseModel):
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: datetime
    last_read_message_id: uuid.UUID | None
    is_online: bool


class ConversationOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str | None
    trip_id: uuid.UUID | None
    creator_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime
    members: list[ConversationMemberOut]
    unread_count: int
    last_message_preview: str | None
    last_message_at: datetime | None


class MessageSendIn(BaseModel):
    client_message_id: str = Field(min_length=1, max_length=128)
    content: str | None = Field(default=None, max_length=4000)
    message_type: Literal["TEXT", "LOCATION", "SHARED_ENTITY"] = "TEXT"
    reply_to_message_id: uuid.UUID | None = None
    shared_entity_type: SharedEntityType | None = None
    shared_entity_id: uuid.UUID | None = None
    location_share_id: uuid.UUID | None = None
    mentions: list[uuid.UUID] = Field(default_factory=list)


class MessageEditIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)


class ReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class MarkReadIn(BaseModel):
    message_id: uuid.UUID


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    client_message_id: str
    content: str | None
    message_type: str
    reply_to_message_id: uuid.UUID | None
    reply_preview: str | None
    """A short preview of the replied-to message's content, or
    "This message was deleted." — never None when reply_to_message_id is
    set, so the frontend never has to special-case a missing reply."""
    shared_entity_type: str | None
    shared_entity_id: uuid.UUID | None
    location_share_id: uuid.UUID | None
    mentions: list[uuid.UUID]
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    reactions: dict[str, list[uuid.UUID]]
    seen_by_count: int
    """Derived from every other active member's `last_read_message_id`
    being at or past this message — computed from data already stored,
    no new column. Real per-recipient DELIVERED acks are out of scope for
    this pass; this is the one real, honest "read" signal for group
    conversations."""
