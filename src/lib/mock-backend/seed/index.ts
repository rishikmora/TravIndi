import { seedCommunityPosts } from '../catalog/community';
import { MOCK_SCHEMA_VERSION, type MockState } from '../store';
import { U } from './ids';
import {
  seedAdvisories,
  seedAvailability,
  seedBookings,
  seedCheckIns,
  seedComplaints,
  seedCrowdReports,
  seedIncidents,
  seedPartnerProfiles,
  seedSos,
  seedVerificationRequests,
} from './operations';
import { seedConversations, seedNotifications, seedShares, seedTrustedContacts } from './social';
import { seedTransportBookings } from './transport';
import { seedTrips } from './trips';
import { seedConsents, seedProfiles, seedUsers } from './users';

export function createSeed(): MockState {
  const users = seedUsers();
  const { trips, itineraries, versions, proposals } = seedTrips();
  const { conversations, messages } = seedConversations();

  // Point the seeded itinerary card at the real Birla Mandir item id.
  const birla = itineraries['trp_hyderabad_family']?.[0]?.days
    .flatMap((day) => day.items)
    .find((item) => item.place?.place_id === 'plc_hyd_birla_mandir');
  for (const message of messages) {
    if (message.card?.card_type === 'itinerary_item' && message.card.item_id === 'itm_placeholder') {
      if (birla) message.card = { ...message.card, item_id: birla.item_id, start_time: birla.start_time };
    }
  }

  return {
    schema: MOCK_SCHEMA_VERSION,
    seeded_on: new Date().toDateString(),
    users,
    profiles: seedProfiles(users),
    consents: seedConsents(users),
    data_requests: {},
    saved_places: { [U.ananya]: ['plc_hyd_qutb_shahi', 'plc_hyd_chowmahalla'] },
    trips,
    itineraries,
    versions,
    jobs: [],
    proposals,
    proposal_payloads: {},
    conversations,
    messages,
    shares: seedShares(),
    trusted_contacts: seedTrustedContacts(),
    check_ins: seedCheckIns(),
    incidents: seedIncidents(),
    sos: seedSos(),
    advisories: seedAdvisories(),
    crowd_reports: seedCrowdReports(),
    quotes: [],
    bookings: [...seedBookings(), ...seedTransportBookings()],
    notifications: seedNotifications(),
    community_posts: seedCommunityPosts(),
    helpful: {},
    verification_requests: seedVerificationRequests(),
    fraud_reports: [],
    partner_profiles: seedPartnerProfiles(),
    evidence_overrides: {},
    availability: seedAvailability(),
    complaints: seedComplaints(),
    idempotency: {},
  };
}
