import type {
  AdaptationProposalDto,
  AuthoritySosItemDto,
  BookingDto,
  ID,
  ISODateTime,
  LocationUpdateDto,
  MessageDto,
  NotificationDto,
  SosAlertDto,
} from '@/types/api';

/**
 * Realtime contract. The WebSocket is a transport for hints about change;
 * the REST API remains the source of truth and is re-queried after reconnects.
 */

export type ChannelName =
  | `user:${string}`
  | `trip:${string}`
  | `conversation:${string}`
  | `location_share:${string}`
  | 'authority:operations';

export interface RealtimeEventPayloads {
  'message.created': { message: MessageDto };
  'message.updated': { message: MessageDto };
  'message.deleted': { conversation_id: ID; message_id: ID; deleted_at: ISODateTime };
  'message.read': { conversation_id: ID; user_id: ID; last_read_message_id: ID; read_at: ISODateTime };
  'typing.started': { conversation_id: ID; user_id: ID; display_name: string };
  'typing.stopped': { conversation_id: ID; user_id: ID };
  'presence.updated': { user_id: ID; presence: 'online' | 'away' | 'offline' };

  'location.updated': { share_id: ID; owner_id: ID; location: LocationUpdateDto };
  'location.expired': { share_id: ID; expired_at: ISODateTime };
  'location.revoked': { share_id: ID; revoked_at: ISODateTime; revoked_by: 'owner' | 'system' };

  'adaptation.proposed': { proposal: AdaptationProposalDto };
  'adaptation.applied': { trip_id: ID; proposal_id: ID; resulting_version: number };
  'adaptation.rejected': { trip_id: ID; proposal_id: ID };
  'adaptation.expired': { trip_id: ID; proposal_id: ID };
  'adaptation.failed': { trip_id: ID; proposal_id: ID; reason: string | null };

  'notification.created': { notification: NotificationDto };

  'sos.updated': { alert: SosAlertDto };
  'booking.updated': { booking: BookingDto };
  'authority.sos.updated': { item: AuthoritySosItemDto };
}

export type RealtimeEventName = keyof RealtimeEventPayloads;

export interface RealtimeEvent<N extends RealtimeEventName = RealtimeEventName> {
  /** Unique, used to de-duplicate redelivered events. */
  event_id: string;
  name: N;
  channel: ChannelName;
  occurred_at: ISODateTime;
  payload: RealtimeEventPayloads[N];
}

export type AnyRealtimeEvent = { [N in RealtimeEventName]: RealtimeEvent<N> }[RealtimeEventName];

/** Frames the server sends. */
export type ServerFrame =
  | { type: 'ready'; session_id: string; server_time: ISODateTime; heartbeat_seconds: number }
  | { type: 'subscribed'; channel: ChannelName }
  | { type: 'unsubscribed'; channel: ChannelName }
  | { type: 'event'; event: AnyRealtimeEvent }
  | { type: 'pong'; ts: number }
  | {
      type: 'error';
      code: 'unauthorized' | 'forbidden' | 'invalid_channel' | 'rate_limited' | 'internal';
      message: string;
      channel?: ChannelName;
    };

/** Frames the client sends. */
export type ClientFrame =
  | { type: 'auth'; token: string | null }
  | { type: 'subscribe'; channel: ChannelName }
  | { type: 'unsubscribe'; channel: ChannelName }
  | { type: 'ping'; ts: number }
  | { type: 'typing'; conversation_id: ID; state: 'started' | 'stopped' };

export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'failed';
