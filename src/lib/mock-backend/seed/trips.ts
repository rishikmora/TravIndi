import { requireDestination } from '@/data/destinations';
import type {
  AdaptationProposalDto,
  ItineraryDto,
  ItineraryVersionDto,
  TripDto,
  TripMemberDto,
} from '@/types/api';
import { toDestinationSummary } from '../catalog/destinations';
import { dateOffset } from '../http';
import { buildItinerary } from '../logic/itinerary';
import { C, minutesAgo, T, U } from './ids';

const member = (
  user_id: string,
  display_name: string,
  role: TripMemberDto['role'],
  presence: TripMemberDto['presence'],
  location_share_id: string | null = null,
): TripMemberDto => ({ user_id, display_name, avatar_url: null, role, presence, location_share_id });

/** Stored placeholder; handlers compute permissions for the viewing member. */
const PERMISSIONS = { can_edit: false, can_invite: false, can_review_adaptations: false, can_book: false };

function markDone(itinerary: ItineraryDto, dayNumbers: number[]) {
  for (const day of itinerary.days) {
    if (dayNumbers.includes(day.day_number)) day.items.forEach((item) => (item.status = 'done'));
  }
}

export function seedTrips() {
  const hyderabad = toDestinationSummary(requireDestination('hyderabad'));
  const jaipur = toDestinationSummary(requireDestination('jaipur'));
  const alappuzha = toDestinationSummary(requireDestination('alappuzha'));

  const hydTrip: TripDto = {
    trip_id: T.hyderabad,
    title: 'Hyderabad with Amma & Appa',
    status: 'active',
    destination: hyderabad,
    start_date: dateOffset(-1),
    end_date: dateOffset(2),
    days: 4,
    cover_image: hyderabad.hero_image,
    members_count: 5,
    pending_adaptations: 0,
    unread_messages: 0,
    updated_at: minutesAgo(90),
    owner_id: U.ananya,
    intent: {
      destination: 'Hyderabad',
      destination_id: hyderabad.destination_id,
      start_date: dateOffset(-1),
      end_date: dateOffset(2),
      days: 4,
      nights: 3,
      travellers: { adults: 2, children: 0, seniors: 2 },
      trip_type: 'family',
      pace: 'relaxed',
      interests: ['heritage', 'temples', 'food'],
      avoid: ['long drives'],
      budget: { ceiling: { amount_minor: 40_000_00, currency: 'INR' }, level: null, per: 'trip' },
      safety_preference: 'high',
      accessibility: {
        low_walking: true,
        wheelchair: false,
        step_free_access: false,
        hearing_support: false,
        visual_support: false,
        notes: 'Parents need regular places to sit.',
      },
      food: null,
      transport: ['taxi'],
      accommodation: 'mid_range',
      booking_preferences: { book_through_travindi: true, verified_providers_only: true, free_cancellation_preferred: true },
      notes: null,
    },
    current_itinerary_version: 1,
    conversation_id: C.tripHyd,
    members: [
      member(U.ananya, 'Ananya Rao', 'owner', 'online'),
      member(U.rahul, 'Rahul Rao', 'editor', 'away'),
      member(U.appa, 'Srinivas Rao', 'viewer', null),
      member(U.amma, 'Meera Rao', 'viewer', null),
      member(U.priya, 'Priya Shah', 'editor', 'online', 'shr_priya'),
    ],
    permissions: PERMISSIONS,
    created_at: minutesAgo(9 * 1440),
  };

  const jaipurTrip: TripDto = {
    trip_id: T.jaipur,
    title: 'Jaipur long weekend',
    status: 'draft',
    destination: jaipur,
    start_date: null,
    end_date: null,
    days: 3,
    cover_image: jaipur.hero_image,
    members_count: 1,
    pending_adaptations: 0,
    unread_messages: 0,
    updated_at: minutesAgo(3 * 1440),
    owner_id: U.ananya,
    intent: {
      destination: 'Jaipur',
      destination_id: jaipur.destination_id,
      days: 3,
      nights: 2,
      travellers: { adults: 2, children: 0, seniors: 0 },
      interests: ['heritage', 'shopping'],
    },
    current_itinerary_version: null,
    conversation_id: C.tripJaipur,
    members: [member(U.ananya, 'Ananya Rao', 'owner', 'online')],
    permissions: PERMISSIONS,
    created_at: minutesAgo(3 * 1440),
  };

  const keralaTrip: TripDto = {
    trip_id: T.kerala,
    title: 'Kerala backwaters with Rahul',
    status: 'completed',
    destination: alappuzha,
    start_date: dateOffset(-64),
    end_date: dateOffset(-61),
    days: 4,
    cover_image: alappuzha.hero_image,
    members_count: 2,
    pending_adaptations: 0,
    unread_messages: 0,
    updated_at: minutesAgo(60 * 1440),
    owner_id: U.ananya,
    intent: {
      destination: 'Alappuzha',
      destination_id: alappuzha.destination_id,
      start_date: dateOffset(-64),
      end_date: dateOffset(-61),
      days: 4,
      nights: 3,
      travellers: { adults: 2, children: 0, seniors: 0 },
      pace: 'relaxed',
      interests: ['nature', 'food'],
    },
    current_itinerary_version: 1,
    conversation_id: C.tripKerala,
    members: [member(U.ananya, 'Ananya Rao', 'owner', 'online'), member(U.rahul, 'Rahul Rao', 'editor', 'away')],
    permissions: PERMISSIONS,
    created_at: minutesAgo(80 * 1440),
  };

  const hydPlan = buildItinerary(hydTrip, 1);
  hydPlan.created_at = minutesAgo(9 * 1440);
  markDone(hydPlan, [1]);

  const keralaPlan = buildItinerary(keralaTrip, 1);
  keralaPlan.created_at = minutesAgo(80 * 1440);
  markDone(keralaPlan, [1, 2, 3, 4]);

  const itineraries: Record<string, ItineraryDto[]> = {
    [T.hyderabad]: [hydPlan],
    [T.kerala]: [keralaPlan],
  };

  const generated = (created_at: string, days: number): ItineraryVersionDto => ({
    version: 1,
    created_at,
    trigger: 'generated',
    title: 'Plan created',
    reason: `${days}-day plan generated from your trip details.`,
    change_count: 0,
    proposal_id: null,
  });

  const versions: Record<string, ItineraryVersionDto[]> = {
    [T.hyderabad]: [generated(hydPlan.created_at, hydPlan.days.length)],
    [T.kerala]: [generated(keralaPlan.created_at, keralaPlan.days.length)],
  };

  // A past request the traveller decided not to apply — gives the history view real content.
  const dayOne = hydPlan.days[0]!;
  const lake = dayOne.items.find((item) => item.place?.place_id === 'plc_hyd_hussain_sagar');
  const proposals: AdaptationProposalDto[] = lake
    ? [
        {
          proposal_id: 'adp_seed_lighter_day1',
          trip_id: T.hyderabad,
          based_on_version: 1,
          trigger_type: 'user_request',
          reason_code: 'replan_more_relaxed',
          title: 'A lighter Day 1',
          summary: 'Here’s a version of your plan with the change you asked for.',
          confidence: 'high',
          risk_level: 'low',
          changes: [
            {
              change_id: 'chg_seed_1',
              change_type: 'removed',
              day_number: 1,
              before: {
                item_id: lake.item_id,
                title: lake.title,
                place_name: lake.place?.name ?? null,
                category: lake.category,
                start_time: lake.start_time,
                end_time: lake.end_time,
              },
              after: null,
              reasons: [{ code: 'lighter_day', label: 'Lightens a busy day' }],
            },
          ],
          impact_summary: {
            time_delta_minutes: null,
            distance_delta_meters: null,
            cost: { status: 'unknown', delta: null },
            safety: { status: 'unchanged', note: null },
          },
          reasons: [{ code: 'requested', label: 'Based on your request' }],
          alternatives: [],
          event: null,
          status: 'rejected',
          created_at: minutesAgo(30 * 60),
          expires_at: minutesAgo(29 * 60),
          resulting_version: null,
          failure_reason: null,
        },
      ]
    : [];

  return { trips: [hydTrip, jaipurTrip, keralaTrip], itineraries, versions, proposals };
}
