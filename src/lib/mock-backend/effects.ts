import type { AdaptationProposalDto, AuthoritySosItemDto, BookingDto, SosAlertDto } from '@/types/api';
import { mockFlags } from './flags';
import { broadcastMessage, conversationMessages, notify, permissionsFor, strip } from './handlers/shared';
import { newId, nowIso } from './http';
import { buildCrowdProposal } from './logic/adaptation';
import { mockNetwork } from './network';
import type { RealtimeHub } from './realtime';
import type { MessageRecord, MockStore, SosRecord } from './store';

/*
 * Delayed, server-side outcomes: things the real backend decides after a
 * request returns (acknowledgements, confirmations, replies). The client only
 * learns about them through realtime events or by re-fetching.
 */

const later = (ms: number, fn: () => void) => {
  if (typeof window !== 'undefined') setTimeout(fn, ms);
};

// SOS -------------------------------------------------------------------------

export const sosDto = (record: SosRecord): SosAlertDto => strip(record);

export function authoritySosItem(store: MockStore, record: SosRecord): AuthoritySosItemDto {
  return {
    alert_id: record.alert_id,
    status: record.status,
    priority: record._priority,
    traveller_label: store.user(record._owner_id)?.display_name ?? 'Traveller (demo)',
    coordinates: record._coordinates,
    accuracy_meters: record._accuracy_meters,
    location_label: record._location_label,
    received_at: record.received_at,
    last_update_at: record._last_update_at,
    assigned_to_label: record._assigned_to_label,
  };
}

export function publishSos(store: MockStore, hub: RealtimeHub, record: SosRecord) {
  record._last_update_at = nowIso();
  hub.publish(`user:${record._owner_id}`, 'sos.updated', { alert: sosDto(record) });
  hub.publish('authority:operations', 'authority.sos.updated', { item: authoritySosItem(store, record) });
  store.persist();
}

export function scheduleSosProgress(store: MockStore, hub: RealtimeHub, alertId: string, contactUserIds: string[]) {
  const find = () => store.state.sos.find((a) => a.alert_id === alertId);

  later(2500, () => {
    const record = find();
    if (!record || record.status === 'cancelled') return;
    const owner = store.displayName(record._owner_id);
    let changed = false;
    record.notifications = record.notifications.map((n) => {
      if (n.channel !== 'trusted_contact' || n.status !== 'queued') return n;
      changed = true;
      return { ...n, status: 'delivered' as const, updated_at: nowIso() };
    });
    for (const userId of contactUserIds) {
      notify(store, hub, userId, {
        category: 'safety',
        priority: 'critical',
        title: `${owner} raised an SOS`,
        body: `${record._location_label ? `Near ${record._location_label}. ` : ''}Try calling them. If you think they are in danger, call 112.`,
        target: null,
      });
    }
    if (changed) publishSos(store, hub, record);
  });

  later(8000, () => {
    const record = find();
    if (!mockFlags.autoAcknowledgeSos || !record || record.status !== 'received') return;
    record.status = 'acknowledged';
    record.acknowledged_at = nowIso();
    record.acknowledged_by_label = 'Operations Desk (demo)';
    publishSos(store, hub, record);
    notify(store, hub, record._owner_id, {
      category: 'safety',
      priority: 'critical',
      title: 'Your SOS was acknowledged',
      body: 'The TravIndi operations desk has seen your alert. If you are in immediate danger, call 112.',
      target: { kind: 'sos', alert_id: record.alert_id },
    });
  });
}

// Bookings --------------------------------------------------------------------

const code = () => `TVD-${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X')}`;

export function scheduleBookingOutcome(store: MockStore, hub: RealtimeHub, bookingId: string, paymentRequired: boolean) {
  later(2500, () => {
    const booking = store.state.bookings.find((b) => b.booking_id === bookingId);
    if (!booking || booking.status !== 'processing') return;
    const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const daysAhead = (Date.parse(booking.date) - today) / 86_400_000;

    if (daysAhead > 90) {
      booking.status = 'failed';
      booking.failure_reason = 'The provider’s calendar isn’t open for this date yet. No payment was taken.';
    } else if (paymentRequired) {
      booking.status = 'payment_pending';
    } else {
      const confirmation = code();
      booking.status = 'confirmed';
      booking.confirmation_code = confirmation;
      booking.ticket = {
        ticket_id: newId('tkt'),
        booking_id: booking.booking_id,
        code: confirmation,
        issued_at: nowIso(),
        valid_from: null,
        valid_until: null,
        qr_payload: `travindi:ticket:${booking.booking_id}:${confirmation}`,
      };
    }
    booking.updated_at = nowIso();
    const dto = strip(booking) as BookingDto;
    hub.publish(`user:${booking._owner_id}`, 'booking.updated', { booking: dto });
    notify(store, hub, booking._owner_id, {
      category: 'booking',
      priority: booking.status === 'failed' || booking.status === 'payment_pending' ? 'high' : 'normal',
      title:
        booking.status === 'confirmed'
          ? `${booking.service_name} confirmed`
          : booking.status === 'payment_pending'
            ? `Payment pending for ${booking.service_name}`
            : `${booking.service_name} couldn’t be booked`,
      body:
        booking.status === 'confirmed'
          ? `Confirmation ${booking.confirmation_code}.`
          : booking.status === 'payment_pending'
            ? 'Pay the provider directly. Online payment isn’t available in TravIndi yet.'
            : (booking.failure_reason ?? 'The provider couldn’t confirm this booking.'),
      target: { kind: 'booking', booking_id: booking.booking_id },
    });
    store.persist();
  });
}

// Chat ------------------------------------------------------------------------

const lastAutoReply = new Map<string, number>();

const TRIP_REPLIES = ['Sounds good 👍', 'On my way — see you soon.', 'Noted, thanks for sorting it.', 'Perfect. Amma will be happy.'];
const DIRECT_REPLIES = ['Thanks for the message — I’ll get back to you shortly.', 'Got it, thank you!'];

function markReadBy(store: MockStore, hub: RealtimeHub, conversationId: string, userId: string) {
  const conversation = store.conversation(conversationId);
  const messages = conversationMessages(store, conversationId);
  const last = messages[messages.length - 1];
  if (!conversation || !last) return;
  conversation._read[userId] = last.message_id;
  hub.publish(`conversation:${conversationId}`, 'message.read', {
    conversation_id: conversationId,
    user_id: userId,
    last_read_message_id: last.message_id,
    read_at: nowIso(),
  });
  store.persist();
}

export function scheduleChatReply(store: MockStore, hub: RealtimeHub, conversationId: string, senderId: string) {
  const conversation = store.conversation(conversationId);
  if (!mockFlags.chatAutoReply || !conversation || conversation.kind === 'community') return;
  const others = conversation.members.filter((m) => m.user_id !== senderId && store.user(m.user_id));
  const responder = others.find((m) => m.presence === 'online') ?? others[0];
  if (!responder) return;

  later(1200, () => markReadBy(store, hub, conversationId, responder.user_id));

  const last = lastAutoReply.get(conversationId) ?? 0;
  if (Date.now() - last < 45_000) return;
  lastAutoReply.set(conversationId, Date.now());

  const channel = `conversation:${conversationId}` as const;
  later(2000, () =>
    hub.publish(channel, 'typing.started', {
      conversation_id: conversationId,
      user_id: responder.user_id,
      display_name: responder.display_name,
    }),
  );
  later(4200, () => {
    hub.publish(channel, 'typing.stopped', { conversation_id: conversationId, user_id: responder.user_id });
    const pool = conversation.kind === 'trip' ? TRIP_REPLIES : DIRECT_REPLIES;
    const record: MessageRecord = {
      message_id: newId('msg'),
      conversation_id: conversationId,
      sender_id: responder.user_id,
      sender_name: responder.display_name,
      client_message_id: null,
      content: pool[Math.floor(Math.random() * pool.length)]!,
      message_type: 'text',
      card: null,
      attachment: null,
      reply_to: null,
      created_at: nowIso(),
      edited_at: null,
      deleted_at: null,
      _reactions: {},
    };
    store.state.messages.push(record);
    conversation._read[responder.user_id] = record.message_id;
    conversation.updated_at = record.created_at;
    hub.publish(channel, 'message.created', { message: broadcastMessage(record) });
    store.persist();
  });
}

// Adaptation ------------------------------------------------------------------

export function emitCrowdProposal(store: MockStore, hub: RealtimeHub, tripId: string): AdaptationProposalDto | null {
  const trip = store.trip(tripId);
  const itinerary = store.currentItinerary(tripId);
  if (!trip || !itinerary) return null;
  if (store.state.proposals.some((p) => p.trip_id === tripId && p.status === 'proposed')) return null;
  const result = buildCrowdProposal(trip, itinerary);
  if (!result) return null;

  const { proposal, payload } = result;
  store.state.proposals.push(proposal);
  store.state.proposal_payloads[proposal.proposal_id] = payload;

  const removedId = proposal.changes.find((c) => c.change_type === 'removed')?.before?.item_id;
  const coordinates = itinerary.days.flatMap((d) => d.items).find((i) => i.item_id === removedId)?.place?.coordinates;
  if (coordinates) {
    store.state.crowd_reports.push({
      signal_id: `crd_${proposal.proposal_id}`,
      coordinates,
      level: 'high',
      label: 'Visitors report heavy crowds',
      freshness: { source_kind: 'application', updated_at: nowIso(), stale_after_seconds: 3600, source_label: 'Visitor reports (sample data)' },
    });
  }

  hub.publish(`trip:${tripId}`, 'adaptation.proposed', { proposal });
  for (const member of trip.members) {
    if (!permissionsFor(trip, member.user_id).can_review_adaptations) continue;
    notify(store, hub, member.user_id, {
      category: 'trip',
      priority: 'high',
      title: `Travel update · ${trip.title}`,
      body: proposal.summary,
      target: { kind: 'adaptation', trip_id: tripId, proposal_id: proposal.proposal_id },
    });
  }
  store.persist();
  return proposal;
}

const AUTOPLAY_KEY = 'travindi:mock-autoplay';
let autoplayScheduled = false;

/** Once per browser session, a reviewer viewing an active trip receives a crowd-change proposal. */
export function maybeAutoplayAdaptation(store: MockStore, hub: RealtimeHub, tripId: string, userId: string) {
  if (!mockFlags.autoplayAdaptation || autoplayScheduled) return;
  const trip = store.trip(tripId);
  if (!trip || trip.status !== 'active' || !permissionsFor(trip, userId).can_review_adaptations) return;
  try {
    if (window.sessionStorage.getItem(AUTOPLAY_KEY)) return;
    window.sessionStorage.setItem(AUTOPLAY_KEY, '1');
  } catch {
    return;
  }
  autoplayScheduled = true;
  later(15_000, () => emitCrowdProposal(store, hub, tripId));
}

// Live location ---------------------------------------------------------------

const PRIYA_PATH: Array<[number, number]> = [
  [17.3702, 78.4795],
  [17.3705, 78.4798],
  [17.3708, 78.48],
  [17.3711, 78.4802],
  [17.3713, 78.4804],
  [17.371, 78.4806],
  [17.3706, 78.4801],
];

let simulationTimer: ReturnType<typeof setInterval> | null = null;

/** Moves a seeded trip member's shared location while their share is active. */
export function startLiveLocationSimulation(store: MockStore, hub: RealtimeHub) {
  if (typeof window === 'undefined' || simulationTimer) return;
  let step = 0;
  simulationTimer = setInterval(() => {
    if (!mockNetwork.online) return;
    const share = store.share('shr_priya');
    if (!share || share.status !== 'active') return;
    step = (step + 1) % PRIYA_PATH.length;
    const [latitude, longitude] = PRIYA_PATH[step]!;
    const location = {
      latitude,
      longitude,
      accuracy: 12 + (step % 3) * 4,
      recorded_at: nowIso(),
      sequence: (share.last_location?.sequence ?? 0) + 1,
    };
    share.last_location = location;
    share.last_location_at = location.recorded_at;
    hub.publish(`location_share:${share.share_id}`, 'location.updated', {
      share_id: share.share_id,
      owner_id: share.owner_id,
      location,
    });
    store.persist();
  }, 12_000);
}
