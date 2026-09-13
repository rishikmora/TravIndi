import type { ID, ImageDto, ISODateTime, LocalTime } from './common';

export type ConversationKind = 'direct' | 'trip' | 'community';

export interface ConversationMemberDto {
  user_id: ID;
  display_name: string;
  avatar_url: string | null;
  role: 'member' | 'admin' | 'moderator';
  /** Null when presence is not permitted. */
  presence: 'online' | 'away' | 'offline' | null;
  last_read_message_id: ID | null;
}

export type MessageType =
  | 'text'
  | 'place'
  | 'itinerary_item'
  | 'location'
  | 'live_location'
  | 'meeting_point'
  | 'attachment'
  | 'system';

export type MessageCardDto =
  | {
      card_type: 'place';
      place_id: ID;
      name: string;
      category: string;
      destination_slug: string | null;
      image: ImageDto | null;
    }
  | {
      card_type: 'itinerary_item';
      trip_id: ID;
      item_id: ID;
      day_number: number;
      title: string;
      start_time: LocalTime | null;
    }
  | {
      card_type: 'location';
      latitude: number;
      longitude: number;
      accuracy: number | null;
      label: string | null;
      recorded_at: ISODateTime;
    }
  | {
      card_type: 'live_location';
      share_id: ID;
      expires_at: ISODateTime | null;
      status: 'active' | 'paused' | 'expired' | 'stopped' | 'revoked';
    }
  | {
      card_type: 'meeting_point';
      label: string;
      latitude: number;
      longitude: number;
      meet_at: ISODateTime | null;
    };

export interface AttachmentDto {
  attachment_id: ID;
  kind: 'image' | 'file';
  url: string;
  name: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface ReactionDto {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

export interface MessageRefDto {
  message_id: ID;
  sender_name: string;
  preview: string;
}

/**
 * Server-confirmed message. `sending` and `failed` exist only on the client;
 * the server reports `sent`, `delivered` and `read`.
 */
export interface MessageDto {
  message_id: ID;
  conversation_id: ID;
  sender_id: ID;
  sender_name: string;
  client_message_id: string | null;
  content: string;
  message_type: MessageType;
  card: MessageCardDto | null;
  attachment: AttachmentDto | null;
  reply_to: MessageRefDto | null;
  reactions: ReactionDto[];
  created_at: ISODateTime;
  edited_at: ISODateTime | null;
  deleted_at: ISODateTime | null;
  status: 'sent' | 'delivered' | 'read';
}

export interface ConversationDto {
  conversation_id: ID;
  kind: ConversationKind;
  title: string;
  avatar_url: string | null;
  trip_id: ID | null;
  destination_id: ID | null;
  members_count: number;
  members: ConversationMemberDto[];
  last_message: MessageDto | null;
  unread_count: number;
  pinned: boolean;
  muted: boolean;
  updated_at: ISODateTime;
  permissions: { can_post: boolean; can_share_location: boolean };
}

export interface SendMessageRequestDto {
  client_message_id: string;
  content: string;
  message_type: MessageType;
  card: MessageCardDto | null;
  reply_to_id: ID | null;
}

export interface MarkReadRequestDto {
  last_read_message_id: ID;
}

export interface ToggleReactionRequestDto {
  emoji: string;
}

export interface MessagesQueryDto {
  /** Cursor pointing at older messages. */
  before?: string;
  limit?: number;
}
