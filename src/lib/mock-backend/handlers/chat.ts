import type { MessageCardDto, MessageRefDto, MessageType } from '@/types/api';
import { scheduleChatReply } from '../effects';
import { created, fail, newId, noContent, nowIso, ok } from '../http';
import { route, type HandlerContext, type RouteDefinition } from '../router';
import type { MessageRecord } from '../store';
import {
  broadcastMessage,
  conversationForViewer,
  conversationMessages,
  messageForViewer,
  readString,
  validationFailed,
} from './shared';

const REACTIONS = ['👍', '❤️', '😄', '🙏', '🎉', '😮'];
const SENDABLE: MessageType[] = ['text', 'place', 'itinerary_item', 'location', 'live_location', 'meeting_point'];
const sendTimes = new Map<string, number[]>();

function requireMember(ctx: HandlerContext) {
  const user = ctx.requireUser();
  const conversation = ctx.store.conversation(ctx.params.conversationId!);
  if (!conversation || !ctx.store.isConversationMember(user.user_id, conversation.conversation_id)) {
    fail(404, 'conversation_not_found', 'That conversation isn’t available.');
  }
  return { user, conversation };
}

const isNumber = (v: unknown, limit: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

function readCard(ctx: HandlerContext, type: MessageType, senderId: string): MessageCardDto | null {
  if (type === 'text') return null;
  const card = ctx.body.card as Record<string, unknown> | null;
  if (!card || card.card_type !== type) validationFailed([{ field: 'card', issue: 'The shared item is missing.' }]);
  switch (type) {
    case 'place':
      if (typeof card.place_id !== 'string' || typeof card.name !== 'string') validationFailed([{ field: 'card', issue: 'Choose a place to share.' }]);
      return { card_type: 'place', place_id: card.place_id, name: card.name.slice(0, 120), category: String(card.category ?? '').slice(0, 60), destination_slug: typeof card.destination_slug === 'string' ? card.destination_slug : null, image: null };
    case 'itinerary_item': {
      const tripId = String(card.trip_id);
      if (!ctx.store.isTripMember(senderId, tripId)) validationFailed([{ field: 'card', issue: 'You can only share items from your own trips.' }]);
      const days = ctx.store.currentItinerary(tripId)?.days ?? [];
      const day = days.find((d) => d.items.some((i) => i.item_id === card.item_id));
      const item = day?.items.find((i) => i.item_id === card.item_id);
      if (!day || !item) validationFailed([{ field: 'card', issue: 'That itinerary item no longer exists.' }]);
      return { card_type: 'itinerary_item', trip_id: tripId, item_id: item.item_id, day_number: day.day_number, title: item.title, start_time: item.start_time };
    }
    case 'location':
      if (!isNumber(card.latitude, 90) || !isNumber(card.longitude, 180)) validationFailed([{ field: 'card', issue: 'Location is invalid.' }]);
      return { card_type: 'location', latitude: card.latitude as number, longitude: card.longitude as number, accuracy: typeof card.accuracy === 'number' ? card.accuracy : null, label: typeof card.label === 'string' ? card.label.slice(0, 80) : null, recorded_at: typeof card.recorded_at === 'string' ? card.recorded_at : nowIso() };
    case 'live_location': {
      const share = ctx.store.share(String(card.share_id));
      if (!share || share.owner_id !== senderId || share.status !== 'active') {
        validationFailed([{ field: 'card', issue: 'Start sharing your location before posting it here.' }]);
      }
      return { card_type: 'live_location', share_id: share.share_id, expires_at: share.expires_at, status: share.status };
    }
    case 'meeting_point':
      if (!isNumber(card.latitude, 90) || !isNumber(card.longitude, 180) || typeof card.label !== 'string' || !card.label.trim()) {
        validationFailed([{ field: 'card', issue: 'Name the meeting point and choose where it is.' }]);
      }
      return { card_type: 'meeting_point', label: card.label.trim().slice(0, 80), latitude: card.latitude as number, longitude: card.longitude as number, meet_at: typeof card.meet_at === 'string' ? card.meet_at : null };
    default:
      validationFailed([{ field: 'message_type', issue: 'This kind of message isn’t supported.' }]);
  }
}

export const chatRoutes: RouteDefinition[] = [
  route('GET', '/v1/conversations', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    const destinationIds = new Set(store.tripsFor(userId).flatMap((t) => (t.destination ? [t.destination.destination_id] : [])));
    const items = store.state.conversations
      .filter((c) =>
        c.kind === 'community'
          ? userId in c._read || Boolean(c.destination_id && destinationIds.has(c.destination_id))
          : c.members.some((m) => m.user_id === userId),
      )
      .map((c) => conversationForViewer(store, c, userId))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
    return ok({ items });
  }),

  route('GET', '/v1/conversations/:conversationId', (ctx) => {
    const { user, conversation } = requireMember(ctx);
    if (conversation.kind === 'community' && !(user.user_id in conversation._read)) {
      conversation._read[user.user_id] = null;
      ctx.store.persist();
    }
    return ok(conversationForViewer(ctx.store, conversation, user.user_id));
  }),

  route('GET', '/v1/conversations/:conversationId/messages', (ctx) => {
    const { user, conversation } = requireMember(ctx);
    const all = conversationMessages(ctx.store, conversation.conversation_id);
    const limit = Math.min(50, Math.max(1, Number(ctx.query.limit) || 30));
    const end = ctx.query.before ? all.findIndex((m) => m.message_id === ctx.query.before) : all.length;
    const upto = end < 0 ? all.length : end;
    const page = all.slice(Math.max(0, upto - limit), upto);
    return ok({
      items: page.reverse().map((m) => messageForViewer(ctx.store, m, user.user_id)),
      next_cursor: upto - limit > 0 ? (page[page.length - 1]?.message_id ?? null) : null,
      total: all.length,
    });
  }),

  route('POST', '/v1/conversations/:conversationId/messages', (ctx) => {
    const { user, conversation } = requireMember(ctx);
    const { store, hub, body } = ctx;
    if (!conversation.permissions.can_post) fail(403, 'forbidden', 'You can’t post in this conversation.');

    const clientMessageId = readString(body, 'client_message_id', { required: true, max: 100, label: 'Message reference' })!;
    const duplicate = store.state.messages.find(
      (m) => m.conversation_id === conversation.conversation_id && m.sender_id === user.user_id && m.client_message_id === clientMessageId,
    );
    if (duplicate) return ok(messageForViewer(store, duplicate, user.user_id));

    const recent = (sendTimes.get(user.user_id) ?? []).filter((t) => Date.now() - t < 10_000);
    if (recent.length >= 20) fail(429, 'rate_limited', 'You’re sending messages quickly. Please wait a moment.', { retry_after_seconds: 10 });

    const type = body.message_type as MessageType;
    if (type === 'attachment') fail(422, 'attachments_unsupported', 'Attachments aren’t supported yet.');
    if (!SENDABLE.includes(type)) validationFailed([{ field: 'message_type', issue: 'This kind of message isn’t supported.' }]);
    if (type === 'live_location' && !conversation.permissions.can_share_location) {
      fail(403, 'forbidden', 'Live location can’t be shared in this conversation.');
    }
    const content = readString(body, 'content', { required: type === 'text', max: 4000, label: 'Message' }) ?? '';
    const card = readCard(ctx, type, user.user_id);

    let replyTo: MessageRefDto | null = null;
    if (typeof body.reply_to_id === 'string') {
      const target = store.state.messages.find((m) => m.message_id === body.reply_to_id && m.conversation_id === conversation.conversation_id);
      if (target) replyTo = { message_id: target.message_id, sender_name: target.sender_name, preview: (target.content || target.card?.card_type || '').slice(0, 80) };
    }

    const record: MessageRecord = {
      message_id: newId('msg'),
      conversation_id: conversation.conversation_id,
      sender_id: user.user_id,
      sender_name: user.display_name,
      client_message_id: clientMessageId,
      content,
      message_type: type,
      card,
      attachment: null,
      reply_to: replyTo,
      created_at: nowIso(),
      edited_at: null,
      deleted_at: null,
      _reactions: {},
    };
    store.state.messages.push(record);
    conversation._read[user.user_id] = record.message_id;
    conversation.updated_at = record.created_at;
    sendTimes.set(user.user_id, [...recent, Date.now()]);
    hub.publish(`conversation:${conversation.conversation_id}`, 'message.created', { message: broadcastMessage(record) });
    scheduleChatReply(store, hub, conversation.conversation_id, user.user_id);
    store.persist();
    return created(messageForViewer(store, record, user.user_id));
  }),

  route('POST', '/v1/conversations/:conversationId/read', (ctx) => {
    const { user, conversation } = requireMember(ctx);
    const messages = conversationMessages(ctx.store, conversation.conversation_id);
    const target = messages.findIndex((m) => m.message_id === ctx.body.last_read_message_id);
    if (target < 0) validationFailed([{ field: 'last_read_message_id', issue: 'Unknown message.' }]);
    const current = messages.findIndex((m) => m.message_id === conversation._read[user.user_id]);
    if (target > current) {
      conversation._read[user.user_id] = messages[target]!.message_id;
      ctx.hub.publish(`conversation:${conversation.conversation_id}`, 'message.read', {
        conversation_id: conversation.conversation_id,
        user_id: user.user_id,
        last_read_message_id: messages[target]!.message_id,
        read_at: nowIso(),
      });
      ctx.store.persist();
    }
    return noContent();
  }),

  route('POST', '/v1/conversations/:conversationId/messages/:messageId/reactions', (ctx) => {
    const { user, conversation } = requireMember(ctx);
    const record = ctx.store.state.messages.find((m) => m.message_id === ctx.params.messageId && m.conversation_id === conversation.conversation_id);
    if (!record || record.deleted_at) fail(404, 'message_not_found', 'That message is no longer available.');
    const emoji = String(ctx.body.emoji ?? '');
    if (!REACTIONS.includes(emoji)) validationFailed([{ field: 'emoji', issue: 'Choose one of the available reactions.' }]);
    const users = record._reactions[emoji] ?? [];
    record._reactions[emoji] = users.includes(user.user_id) ? users.filter((id) => id !== user.user_id) : [...users, user.user_id];
    ctx.hub.publish(`conversation:${conversation.conversation_id}`, 'message.updated', { message: broadcastMessage(record) });
    ctx.store.persist();
    return ok(messageForViewer(ctx.store, record, user.user_id));
  }),
];
