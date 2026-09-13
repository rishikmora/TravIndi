import type { ConversationMemberDto, MessageCardDto, NotificationDto } from '@/types/api';
import type { ConversationRecord, MessageRecord, ShareRecord, TrustedContactRecord } from '../store';
import { atLocal, C, minutesAgo, minutesAhead, T, U } from './ids';

const cm = (
  user_id: string,
  display_name: string,
  presence: ConversationMemberDto['presence'] = null,
  role: ConversationMemberDto['role'] = 'member',
): ConversationMemberDto => ({ user_id, display_name, avatar_url: null, role, presence, last_read_message_id: null });

const conversation = (
  init: Pick<ConversationRecord, 'conversation_id' | 'kind' | 'title' | 'members'> &
    Partial<ConversationRecord>,
): ConversationRecord => ({
  avatar_url: null,
  trip_id: null,
  destination_id: null,
  pinned: false,
  muted: false,
  updated_at: minutesAgo(5),
  permissions: { can_post: true, can_share_location: init.kind !== 'community' },
  _read: {},
  ...init,
});

let sequence = 0;
const msg = (
  conversation_id: string,
  sender_id: string,
  sender_name: string,
  minutes: number,
  content: string,
  card: MessageCardDto | null = null,
): MessageRecord => {
  sequence += 1;
  return {
    message_id: `msg_${conversation_id.replace('cnv_', '')}_${String(sequence).padStart(3, '0')}`,
    conversation_id,
    sender_id,
    sender_name,
    client_message_id: null,
    content,
    message_type: card ? card.card_type : 'text',
    card,
    attachment: null,
    reply_to: null,
    created_at: minutesAgo(minutes),
    edited_at: null,
    deleted_at: null,
    _reactions: {},
  };
};

export function seedConversations() {
  sequence = 0;
  const hydMembers = [
    cm(U.ananya, 'Ananya Rao', 'online', 'admin'),
    cm(U.rahul, 'Rahul Rao', 'away'),
    cm(U.appa, 'Srinivas Rao'),
    cm(U.amma, 'Meera Rao'),
    cm(U.priya, 'Priya Shah', 'online'),
  ];

  const tripHyd = [
    msg(C.tripHyd, U.rahul, 'Rahul Rao', 40 * 60, 'Booked the cab for Appa and Amma from the airport 🚕'),
    msg(C.tripHyd, U.ananya, 'Ananya Rao', 39 * 60, 'Thank you! I’ve kept Day 1 light.'),
    msg(C.tripHyd, U.priya, 'Priya Shah', 20 * 60, 'Adding this for tomorrow morning.', {
      card_type: 'place',
      place_id: 'plc_hyd_qutb_shahi',
      name: 'Qutb Shahi Tombs',
      category: 'Heritage site',
      destination_slug: 'hyderabad',
      image: null,
    }),
    msg(C.tripHyd, U.ananya, 'Ananya Rao', 3 * 60, 'Birla Mandir this evening — Amma has been wanting to go.', {
      card_type: 'itinerary_item',
      trip_id: T.hyderabad,
      item_id: 'itm_placeholder',
      day_number: 2,
      title: 'Birla Mandir',
      start_time: '16:00',
    }),
    msg(C.tripHyd, U.amma, 'Meera Rao', 150, 'Please make sure there is somewhere to sit 🙏'),
    msg(C.tripHyd, U.priya, 'Priya Shah', 90, 'Let’s meet here before the museum.', {
      card_type: 'meeting_point',
      label: 'Salar Jung Museum entrance',
      latitude: 17.3713,
      longitude: 78.4804,
      meet_at: atLocal(14, 0),
    }),
    msg(C.tripHyd, U.priya, 'Priya Shah', 40, 'Sharing my location until I reach you.', {
      card_type: 'live_location',
      share_id: 'shr_priya',
      expires_at: minutesAhead(80),
      status: 'active',
    }),
    msg(C.tripHyd, U.rahul, 'Rahul Rao', 12, 'Running 10 minutes late, start without me.'),
    msg(C.tripHyd, U.priya, 'Priya Shah', 4, 'I’m near the museum now.'),
  ];

  const dmFarhan = [
    msg(C.dmFarhan, U.ananya, 'Ananya Rao', 2 * 1440, 'Hi Farhan, do you do slower-paced walks for parents in their 60s?'),
    msg(C.dmFarhan, U.farhan, 'Farhan Ali', 2 * 1440 - 30, 'Yes — I plan the route with seating breaks every 20–30 minutes. Mornings are cooler.'),
    msg(C.dmFarhan, U.farhan, 'Farhan Ali', 2 * 1440 - 31, 'We could finish at Chowmahalla Palace.', {
      card_type: 'place',
      place_id: 'plc_hyd_chowmahalla',
      name: 'Chowmahalla Palace',
      category: 'Palace',
      destination_slug: 'hyderabad',
      image: null,
    }),
  ];

  const dmPriya = [
    msg(C.dmPriya, U.priya, 'Priya Shah', 22 * 60, 'Can’t wait to see you all tomorrow!'),
    msg(C.dmPriya, U.ananya, 'Ananya Rao', 21 * 60, 'Same! Amma is bringing you pickles 😄'),
  ];

  const community = [
    msg(C.communityHyd, 'usr_community_sanjana', 'Sanjana K.', 5 * 60, 'Is the area around Charminar manageable with a wheelchair?'),
    msg(C.communityHyd, 'usr_community_rukhsana', 'Rukhsana Begum', 4 * 60, 'The main road is mostly flat, but the lanes nearby are uneven. Check with your guide before going.'),
    msg(C.communityHyd, 'usr_community_imran', 'Imran S.', 2 * 60, 'Reminder: Chowmahalla Palace is closed on Fridays.'),
  ];

  const kerala = [
    msg(C.tripKerala, U.rahul, 'Rahul Rao', 62 * 1440, 'Houseboat check-in is at noon.'),
    msg(C.tripKerala, U.ananya, 'Ananya Rao', 62 * 1440 - 10, 'Perfect, we’ll have lunch on board.'),
  ];

  tripHyd[1]!._reactions = { '👍': [U.rahul, U.priya] };
  dmPriya[1]!._reactions = { '😄': [U.priya] };

  const readAt = (list: MessageRecord[], index: number) => list[index]?.message_id ?? null;

  const conversations: ConversationRecord[] = [
    conversation({
      conversation_id: C.tripHyd,
      kind: 'trip',
      title: 'Hyderabad with Amma & Appa',
      trip_id: T.hyderabad,
      destination_id: 'dst_hyderabad',
      members: hydMembers,
      pinned: true,
      updated_at: tripHyd[tripHyd.length - 1]!.created_at,
      _read: {
        [U.ananya]: readAt(tripHyd, 6),
        [U.rahul]: readAt(tripHyd, 8),
        [U.priya]: readAt(tripHyd, 8),
        [U.appa]: readAt(tripHyd, 4),
        [U.amma]: readAt(tripHyd, 5),
      },
    }),
    conversation({
      conversation_id: C.dmFarhan,
      kind: 'direct',
      title: 'Farhan Ali',
      members: [cm(U.ananya, 'Ananya Rao', 'online'), cm(U.farhan, 'Farhan Ali', 'offline')],
      updated_at: dmFarhan[2]!.created_at,
      _read: { [U.ananya]: readAt(dmFarhan, 2), [U.farhan]: readAt(dmFarhan, 2) },
    }),
    conversation({
      conversation_id: C.dmPriya,
      kind: 'direct',
      title: 'Priya Shah',
      members: [cm(U.ananya, 'Ananya Rao', 'online'), cm(U.priya, 'Priya Shah', 'online')],
      updated_at: dmPriya[1]!.created_at,
      _read: { [U.ananya]: readAt(dmPriya, 1), [U.priya]: readAt(dmPriya, 1) },
    }),
    conversation({
      conversation_id: C.communityHyd,
      kind: 'community',
      title: 'Hyderabad travellers',
      destination_id: 'dst_hyderabad',
      members: [cm('usr_community_rukhsana', 'Rukhsana Begum', null, 'moderator')],
      updated_at: community[2]!.created_at,
      _read: { [U.ananya]: readAt(community, 1) },
    }),
    conversation({
      conversation_id: C.tripJaipur,
      kind: 'trip',
      title: 'Jaipur long weekend',
      trip_id: T.jaipur,
      destination_id: 'dst_jaipur',
      members: [cm(U.ananya, 'Ananya Rao', 'online', 'admin')],
      updated_at: minutesAgo(3 * 1440),
    }),
    conversation({
      conversation_id: C.tripKerala,
      kind: 'trip',
      title: 'Kerala backwaters with Rahul',
      trip_id: T.kerala,
      destination_id: 'dst_alappuzha',
      members: [cm(U.ananya, 'Ananya Rao', 'online', 'admin'), cm(U.rahul, 'Rahul Rao', 'away')],
      muted: true,
      updated_at: kerala[1]!.created_at,
      _read: { [U.ananya]: readAt(kerala, 1), [U.rahul]: readAt(kerala, 1) },
    }),
  ];

  return { conversations, messages: [...tripHyd, ...dmFarhan, ...dmPriya, ...community, ...kerala] };
}

export function seedShares(): ShareRecord[] {
  const tripRecipient = { recipient_id: T.hyderabad, display_name: 'Hyderabad with Amma & Appa', kind: 'trip' as const };
  return [
    {
      share_id: 'shr_priya',
      owner_id: U.priya,
      owner_name: 'Priya Shah',
      trip_id: T.hyderabad,
      recipient_ids: [T.hyderabad],
      recipients: [tripRecipient],
      audience_label: tripRecipient.display_name,
      started_at: minutesAgo(40),
      expires_at: minutesAhead(80),
      status: 'active',
      precision_mode: 'precise',
      last_location_at: minutesAgo(0.5),
      last_location: { latitude: 17.3702, longitude: 78.4795, accuracy: 18, recorded_at: minutesAgo(0.5), sequence: 42 },
      _ended_at: null,
      _audience: 'trip_members',
    },
    {
      share_id: 'shr_rahul',
      owner_id: U.rahul,
      owner_name: 'Rahul Rao',
      trip_id: null,
      recipient_ids: [U.ananya],
      recipients: [{ recipient_id: U.ananya, display_name: 'Ananya Rao', kind: 'user' }],
      audience_label: 'Ananya Rao',
      started_at: minutesAgo(70),
      expires_at: minutesAhead(50),
      status: 'active',
      precision_mode: 'approximate',
      last_location_at: minutesAgo(26),
      last_location: { latitude: 17.44, longitude: 78.47, accuracy: 1000, recorded_at: minutesAgo(26), sequence: 12 },
      _ended_at: null,
      _audience: 'custom',
    },
    {
      share_id: 'shr_ananya_yesterday',
      owner_id: U.ananya,
      owner_name: 'Ananya Rao',
      trip_id: T.hyderabad,
      recipient_ids: [T.hyderabad],
      recipients: [tripRecipient],
      audience_label: tripRecipient.display_name,
      started_at: atLocal(18, 0, -1),
      expires_at: atLocal(20, 30, -1),
      status: 'stopped',
      precision_mode: 'precise',
      last_location_at: null,
      last_location: null,
      _ended_at: atLocal(20, 5, -1),
      _audience: 'trip_members',
    },
  ];
}

export function seedTrustedContacts(): TrustedContactRecord[] {
  return [
    {
      contact_id: 'tc_rahul',
      name: 'Rahul Rao',
      relationship: 'Brother',
      phone_masked: '+91 ••••• ••418',
      email_masked: 'r•••@travindi.dev',
      verified: true,
      notify_on: ['sos', 'missed_check_in', 'location_share'],
      _owner_id: U.ananya,
      _linked_user_id: U.rahul,
      _phone: '+91 90000 00418',
      _email: 'rahul@travindi.dev',
    },
    {
      contact_id: 'tc_kavya',
      name: 'Kavya Iyer',
      relationship: 'Friend',
      phone_masked: '+91 ••••• ••576',
      email_masked: null,
      verified: false,
      notify_on: ['sos'],
      _owner_id: U.ananya,
      _linked_user_id: null,
      _phone: '+91 90000 00576',
      _email: null,
    },
  ];
}

export function seedNotifications(): Array<NotificationDto & { _user_id: string }> {
  const n = (
    notification_id: string,
    init: Omit<NotificationDto, 'notification_id' | 'read_at'>,
    read: boolean,
  ) => ({ notification_id, ...init, read_at: read ? init.created_at : null, _user_id: U.ananya });

  return [
    n('ntf_advisory_hyd', {
      category: 'safety',
      priority: 'high',
      title: 'Advisory for Hyderabad',
      body: 'Busy evenings expected around Charminar. Keep valuables secure.',
      created_at: minutesAgo(180),
      target: { kind: 'destination', slug: 'hyderabad' },
    }, false),
    n('ntf_share_priya', {
      category: 'safety',
      priority: 'normal',
      title: 'Priya Shah is sharing her location with your trip',
      body: 'Visible to members of Hyderabad with Amma & Appa.',
      created_at: minutesAgo(40),
      target: { kind: 'location_share', share_id: 'shr_priya' },
    }, false),
    n('ntf_meeting_point', {
      category: 'message',
      priority: 'normal',
      title: 'Priya shared a meeting point',
      body: 'Salar Jung Museum entrance at 2:00 pm.',
      created_at: minutesAgo(90),
      target: { kind: 'conversation', conversation_id: C.tripHyd },
    }, false),
    n('ntf_cab_payment', {
      category: 'booking',
      priority: 'high',
      title: 'Payment pending for your city cab',
      body: 'Pay the provider directly. Online payment isn’t available in TravIndi yet.',
      created_at: minutesAgo(1440),
      target: { kind: 'booking', booking_id: 'bkg_cab' },
    }, false),
    n('ntf_walk_confirmed', {
      category: 'booking',
      priority: 'normal',
      title: 'Old City heritage walk confirmed',
      body: 'Tomorrow at 7:00 am for 4 people.',
      created_at: minutesAgo(5 * 1440),
      target: { kind: 'booking', booking_id: 'bkg_oldcity' },
    }, true),
    n('ntf_plan_ready', {
      category: 'trip',
      priority: 'normal',
      title: 'Your Hyderabad itinerary is ready',
      body: '4 days planned around heritage, temples and food.',
      created_at: minutesAgo(9 * 1440),
      target: { kind: 'trip', trip_id: T.hyderabad },
    }, true),
    n('ntf_community_food', {
      category: 'community',
      priority: 'low',
      title: 'New tip in Hyderabad · Food',
      body: 'An easy Irani chai stop near Charminar.',
      created_at: minutesAgo(6 * 1440),
      target: { kind: 'destination', slug: 'hyderabad' },
    }, true),
  ];
}
