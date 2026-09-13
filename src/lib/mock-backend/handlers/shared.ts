import type {
  ConversationDto,
  MessageDto,
  NotificationDto,
  TripDto,
  TripPermissionsDto,
  TripSummaryDto,
} from '@/types/api';
import { fail, newId, nowIso } from '../http';
import type { RealtimeHub } from '../realtime';
import type { HandlerContext } from '../router';
import type { ConversationRecord, MessageRecord, MockStore } from '../store';

/** Removes internal `_`-prefixed fields before a record leaves the backend. */
export function strip<T extends object>(record: T): { [K in keyof T as K extends `_${string}` ? never : K]: T[K] } {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('_'))) as never;
}

// Validation ------------------------------------------------------------------

type Issue = { field: string; issue: string };

export function validationFailed(issues: Issue[], message = 'Some details need attention.'): never {
  fail(422, 'validation_error', message, { details: issues });
}

export function readString(
  body: Record<string, unknown>,
  field: string,
  options: { required?: boolean; min?: number; max?: number; label?: string } = {},
): string | null {
  const { required = false, min = 1, max = 2000, label = 'This field' } = options;
  const raw = body[field];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (required) validationFailed([{ field, issue: `${label} is required.` }]);
    return null;
  }
  if (typeof raw !== 'string') validationFailed([{ field, issue: `${label} must be text.` }]);
  const value = raw.trim();
  if (value.length < min) validationFailed([{ field, issue: `${label} must be at least ${min} characters.` }]);
  if (value.length > max) validationFailed([{ field, issue: `${label} must be ${max} characters or fewer.` }]);
  return value;
}

export function readNumber(body: Record<string, unknown>, field: string, min: number, max: number, label = 'This value') {
  const raw = body[field];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) validationFailed([{ field, issue: `${label} is required.` }]);
  if (raw < min || raw > max) validationFailed([{ field, issue: `${label} must be between ${min} and ${max}.` }]);
  return raw;
}

export const csv = (value: string | undefined) => (value ? value.split(',').map((v) => v.trim()).filter(Boolean) : []);

/** Search input is untrusted: trim, collapse whitespace, cap length. */
export const cleanQuery = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);

// Idempotency ------------------------------------------------------------------

export async function idempotent<T>(
  ctx: HandlerContext,
  scope: string,
  key: string | null | undefined,
  compute: () => T | Promise<T>,
): Promise<{ replayed: boolean; body: T }> {
  const userId = ctx.user?.user_id ?? 'anonymous';
  const effectiveKey = key ?? ctx.request.idempotencyKey;
  if (!effectiveKey) return { replayed: false, body: await compute() };
  const storeKey = `${userId}:${scope}:${effectiveKey}`;
  const existing = ctx.store.state.idempotency[storeKey];
  if (existing) return { replayed: true, body: existing.body as T };
  const body = await compute();
  ctx.store.state.idempotency[storeKey] = { status: 200, body };
  return { replayed: false, body };
}

// Trips -----------------------------------------------------------------------

export function permissionsFor(trip: TripDto, userId: string): TripPermissionsDto {
  const role = trip.members.find((m) => m.user_id === userId)?.role;
  if (role === 'owner') return { can_edit: true, can_invite: true, can_review_adaptations: true, can_book: true };
  if (role === 'editor') return { can_edit: true, can_invite: false, can_review_adaptations: true, can_book: true };
  return { can_edit: false, can_invite: false, can_review_adaptations: false, can_book: false };
}

export function tripForViewer(store: MockStore, trip: TripDto, userId: string): TripDto {
  const conversation = trip.conversation_id ? store.conversation(trip.conversation_id) : undefined;
  return {
    ...trip,
    members_count: trip.members.length,
    pending_adaptations: store.state.proposals.filter((p) => p.trip_id === trip.trip_id && p.status === 'proposed').length,
    unread_messages: conversation ? unreadCount(store, conversation, userId) : 0,
    current_itinerary_version: store.currentItinerary(trip.trip_id)?.version ?? null,
    permissions: permissionsFor(trip, userId),
    // Presence is only shared with fellow members; location share ids only when visible to this viewer.
    members: trip.members.map((m) => {
      const share = m.location_share_id ? store.share(m.location_share_id) : undefined;
      return { ...m, location_share_id: share && store.canViewShare(userId, share) ? share.share_id : null };
    }),
  };
}

export function tripSummary(trip: TripDto): TripSummaryDto {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    status: trip.status,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    days: trip.days,
    cover_image: trip.cover_image,
    members_count: trip.members_count,
    pending_adaptations: trip.pending_adaptations,
    unread_messages: trip.unread_messages,
    updated_at: trip.updated_at,
  };
}

export function requireTripMember(ctx: HandlerContext, tripId: string) {
  const user = ctx.requireUser();
  const trip = ctx.store.trip(tripId);
  // 404 rather than 403 so private trips are not discoverable.
  if (!trip || !ctx.store.isTripMember(user.user_id, tripId)) fail(404, 'trip_not_found', 'We couldn’t find that trip.');
  return { user, trip };
}

// Chat ------------------------------------------------------------------------

const indexOf = (messages: MessageRecord[], id: string | null | undefined) =>
  id ? messages.findIndex((m) => m.message_id === id) : -1;

export function conversationMessages(store: MockStore, conversationId: string) {
  return store.state.messages
    .filter((m) => m.conversation_id === conversationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function unreadCount(store: MockStore, conversation: ConversationRecord, userId: string) {
  const messages = conversationMessages(store, conversation.conversation_id);
  const lastRead = indexOf(messages, conversation._read[userId]);
  return messages.slice(lastRead + 1).filter((m) => m.sender_id !== userId && !m.deleted_at).length;
}

export function messageForViewer(store: MockStore, record: MessageRecord, userId: string): MessageDto {
  const conversation = store.conversation(record.conversation_id);
  let status: MessageDto['status'] = 'read';
  if (record.sender_id === userId && conversation) {
    const messages = conversationMessages(store, record.conversation_id);
    const position = indexOf(messages, record.message_id);
    const readByOther = Object.entries(conversation._read).some(
      ([reader, lastRead]) => reader !== userId && indexOf(messages, lastRead) >= position,
    );
    status = readByOther ? 'read' : Date.now() - Date.parse(record.created_at) > 1500 ? 'delivered' : 'sent';
  }
  const { _reactions, ...rest } = record;
  return {
    ...rest,
    content: record.deleted_at ? '' : record.content,
    reactions: Object.entries(_reactions)
      .filter(([, users]) => users.length > 0)
      .map(([emoji, users]) => ({ emoji, count: users.length, reacted_by_me: users.includes(userId) })),
    status,
  };
}

/**
 * Viewer-neutral projection for realtime fan-out: `status` is `sent` and
 * `reacted_by_me` is false. Clients re-fetch for per-viewer detail.
 */
export function broadcastMessage(record: MessageRecord): MessageDto {
  const { _reactions, ...rest } = record;
  return {
    ...rest,
    content: record.deleted_at ? '' : record.content,
    reactions: Object.entries(_reactions)
      .filter(([, users]) => users.length > 0)
      .map(([emoji, users]) => ({ emoji, count: users.length, reacted_by_me: false })),
    status: 'sent',
  };
}

export function conversationForViewer(store: MockStore, record: ConversationRecord, userId: string): ConversationDto {
  const messages = conversationMessages(store, record.conversation_id);
  const last = messages[messages.length - 1];
  const { _read, ...rest } = record;
  return {
    ...rest,
    members: record.members.map((m) => ({ ...m, last_read_message_id: _read[m.user_id] ?? null })),
    members_count: record.members.length,
    last_message: last ? messageForViewer(store, last, userId) : null,
    unread_count: unreadCount(store, record, userId),
  };
}

// Notifications ---------------------------------------------------------------

export function notify(
  store: MockStore,
  hub: RealtimeHub,
  userId: string,
  init: Omit<NotificationDto, 'notification_id' | 'created_at' | 'read_at'>,
) {
  if (!store.user(userId)) return null;
  const notification: NotificationDto = { notification_id: newId('ntf'), created_at: nowIso(), read_at: null, ...init };
  store.state.notifications.unshift({ ...notification, _user_id: userId });
  hub.publish(`user:${userId}`, 'notification.created', { notification });
  store.persist();
  return notification;
}

// Housekeeping ----------------------------------------------------------------

/** Applies time-based transitions the real backend would run on a schedule. */
export function runHousekeeping(store: MockStore, hub: RealtimeHub) {
  const now = Date.now();
  let changed = false;

  for (const share of store.state.shares) {
    if ((share.status === 'active' || share.status === 'paused') && share.expires_at && Date.parse(share.expires_at) <= now) {
      share.status = 'expired';
      share._ended_at = share.expires_at;
      share.last_location = null;
      share.last_location_at = null;
      hub.publish(`location_share:${share.share_id}`, 'location.expired', { share_id: share.share_id, expired_at: share.expires_at });
      hub.revalidate(`location_share:${share.share_id}`);
      changed = true;
    }
  }

  for (const proposal of store.state.proposals) {
    if (proposal.status !== 'proposed') continue;
    const current = store.currentItinerary(proposal.trip_id)?.version ?? null;
    if (current !== null && proposal.based_on_version < current) {
      proposal.status = 'stale';
      changed = true;
    } else if (proposal.expires_at && Date.parse(proposal.expires_at) <= now) {
      proposal.status = 'expired';
      hub.publish(`trip:${proposal.trip_id}`, 'adaptation.expired', { trip_id: proposal.trip_id, proposal_id: proposal.proposal_id });
      changed = true;
    }
  }

  for (const checkIn of store.state.check_ins) {
    if (checkIn.status === 'scheduled' && Date.parse(checkIn.due_at) + 15 * 60_000 <= now) {
      checkIn.status = 'missed';
      changed = true;
    }
  }

  if (changed) store.persist();
}
