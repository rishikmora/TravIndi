import type {
  AvailabilityDto,
  BusinessDto,
  CostDto,
  GuideDto,
  PackageDetailsDto,
  ReviewDto,
  ServiceDto,
  ServiceUnit,
  VerificationEvidenceDto,
} from '@/types/api';
import { buildOfferBusinesses } from './offers';

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

const VERIFIER = 'TravIndi verification (sample data)';

const evidence = (
  kind: VerificationEvidenceDto['kind'],
  status: VerificationEvidenceDto['status'],
  verifiedDaysAgo = 60,
): VerificationEvidenceDto => ({
  kind,
  status,
  verified_at: status === 'verified' ? iso(-verifiedDaysAgo) : null,
  expires_at: status === 'verified' ? iso(365 - verifiedDaysAgo) : null,
  verifier_label: status === 'verified' ? VERIFIER : null,
  note: status === 'pending' ? 'Documents received and under review.' : null,
});

const price = (rupees: number): CostDto => ({
  status: 'authoritative',
  value: { amount_minor: rupees * 100, currency: 'INR' },
  source_label: 'Provider’s listed price',
  updated_at: iso(-3),
});

const unavailable: CostDto = { status: 'unavailable', value: null };

const availability = (status: AvailabilityDto['status']): AvailabilityDto => ({
  status,
  next_available_at: status === 'limited' ? iso(1) : null,
  freshness: {
    source_kind: status === 'unknown' ? 'unavailable' : 'application',
    updated_at: status === 'unknown' ? null : iso(-0.02),
    source_label: status === 'unknown' ? null : 'Provider calendar (sample data)',
  },
});

const service = (
  service_id: string,
  provider_id: string,
  provider_type: ServiceDto['provider_type'],
  name: string,
  description: string,
  duration_minutes: number | null,
  cost: CostDto,
  bookable: boolean,
  capacity: number | null = null,
  unit: ServiceUnit = provider_type === 'guide' ? 'group' : 'person',
  highlights: string[] = [],
  package_details: PackageDetailsDto | null = null,
): ServiceDto => ({ service_id, provider_id, provider_type, name, description, duration_minutes, price: cost, unit, bookable, capacity, highlights, package_details });

const CURATED_BUSINESSES: BusinessDto[] = [
  {
    business_id: 'biz_oldcity_walks',
    name: 'Old City Heritage Walks',
    category: 'tour_operator',
    destination_id: 'dst_hyderabad',
    destination_name: 'Hyderabad',
    address: 'Near Charminar, Hyderabad',
    coordinates: { lat: 17.3625, lng: 78.4741 },
    description: 'Small-group and private walks through the old city, with slow-paced routes for older travellers.',
    images: [],
    services: [
      service('svc_oldcity_walk', 'biz_oldcity_walks', 'business', 'Slow-paced Old City heritage walk', 'Charminar, Mecca Masjid and Chowmahalla surroundings with rest stops.', 150, price(1200), true, 8),
      service('svc_oldcity_food', 'biz_oldcity_walks', 'business', 'Old City food trail', 'Biryani, Irani chai and sweets across four stops.', 180, price(1800), true, 10),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'verified'), evidence('review_authenticity', 'verified', 20)],
    reputation: { rating: 4.7, review_count: 212, review_signal: 'strong' },
    availability: availability('available'),
    languages: ['English', 'Hindi', 'Telugu', 'Urdu'],
    opening_hours: 'Walks start at 7:00 and 16:30',
  },
  {
    business_id: 'biz_deccan_cabs',
    name: 'Deccan Family Cabs',
    category: 'transport',
    destination_id: 'dst_hyderabad',
    destination_name: 'Hyderabad',
    address: 'Begumpet, Hyderabad',
    coordinates: { lat: 17.4447, lng: 78.4664 },
    description: 'Chauffeured cars for families, with child seats on request.',
    images: [],
    services: [
      service('svc_city_cab', 'biz_deccan_cabs', 'business', 'Full-day city cab with driver (8 hours)', 'Air-conditioned sedan, up to 4 passengers.', 480, price(2800), true, 3, 'vehicle', ['Air-conditioned sedan, up to 4 passengers', 'Child seats on request']),
      service('svc_deccan_airport', 'biz_deccan_cabs', 'business', 'Airport transfer (one way)', 'Between Rajiv Gandhi International Airport and your stay. The driver meets you with a name board.', 75, price(1800), true, 3, 'vehicle', ['Air-conditioned sedan, up to 4 passengers', 'Waits up to 60 minutes for delays']),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'verified')],
    reputation: { rating: 4.5, review_count: 98, review_signal: 'strong' },
    availability: availability('limited'),
    languages: ['English', 'Hindi', 'Telugu'],
    opening_hours: 'Bookings 6:00–22:00',
  },
  {
    business_id: 'biz_nizams_table',
    name: 'Nizam’s Table',
    category: 'restaurant',
    destination_id: 'dst_hyderabad',
    destination_name: 'Hyderabad',
    address: 'Banjara Hills, Hyderabad',
    coordinates: { lat: 17.4145, lng: 78.4412 },
    description: 'Hyderabadi and Deccani dishes in a family-friendly dining room.',
    images: [],
    services: [],
    verification: [evidence('business_registration', 'pending')],
    reputation: { rating: 4.2, review_count: 23, review_signal: 'limited' },
    availability: null,
    languages: ['English', 'Hindi', 'Urdu'],
    opening_hours: '12:00–23:00',
  },
  {
    business_id: 'biz_bangle_studio',
    name: 'Pearl & Bangle Studio',
    category: 'shop',
    destination_id: 'dst_hyderabad',
    destination_name: 'Hyderabad',
    address: 'Laad Bazaar, Hyderabad',
    coordinates: { lat: 17.3611, lng: 78.4729 },
    description: 'Lac bangles and pearl jewellery.',
    images: [],
    services: [],
    verification: [evidence('identity', 'unverified')],
    reputation: { rating: null, review_count: 3, review_signal: 'insufficient' },
    availability: null,
    languages: ['Hindi', 'Urdu'],
    opening_hours: null,
  },
  {
    business_id: 'biz_lakeview_stay',
    name: 'Lakeview Heritage Stay',
    category: 'stay',
    destination_id: 'dst_hyderabad',
    destination_name: 'Hyderabad',
    address: 'Necklace Road, Hyderabad',
    coordinates: { lat: 17.4142, lng: 78.4657 },
    description: 'A restored 1930s residence with ground-floor rooms and lift access.',
    images: [],
    services: [
      service('svc_lakeview_room', 'biz_lakeview_stay', 'business', 'Deluxe double room', 'A double room for two, with breakfast. Ground-floor rooms can be requested.', null, price(5200), true, 6, 'room_night', [
        'Breakfast included',
        'Step-free access and a lift',
        'Free cancellation until the day before',
      ]),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'verified')],
    reputation: { rating: 4.4, review_count: 140, review_signal: 'strong' },
    availability: availability('available'),
    languages: ['English', 'Hindi', 'Telugu'],
    opening_hours: 'Check-in from 14:00 · check-out by 11:00',
  },
  {
    business_id: 'biz_nizam_trails',
    name: 'Nizam Trails Holidays',
    category: 'tour_operator',
    destination_id: 'dst_hyderabad',
    destination_name: 'Hyderabad',
    address: 'Somajiguda, Hyderabad',
    coordinates: { lat: 17.4239, lng: 78.4575 },
    description: 'Unhurried Hyderabad packages for families, with rest stops built into every day.',
    images: [],
    services: [
      service('svc_nizam_trails_package', 'biz_nizam_trails', 'business', 'Hyderabad Heritage & Biryani Trail', '4 days and 3 nights in Hyderabad, paced for older travellers.', null, price(8400), true, 12, 'person', ['Stay, car and guide included', 'Free cancellation up to 7 days before'], {
        days: 4,
        nights: 3,
        includes: ['3 nights at Lakeview Heritage Stay', 'Daily breakfast', 'Private car with driver for sightseeing', 'Slow-paced guided visits with rest stops', 'Airport transfers'],
      }),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'verified')],
    reputation: { rating: 4.6, review_count: 134, review_signal: 'strong' },
    availability: availability('available'),
    languages: ['English', 'Hindi', 'Telugu'],
    opening_hours: 'Planning desk 9:00–19:00',
  },
  {
    business_id: 'biz_pinkcity_walks',
    name: 'Pink City Walks',
    category: 'tour_operator',
    destination_id: 'dst_jaipur',
    destination_name: 'Jaipur',
    address: 'Johari Bazaar, Jaipur',
    coordinates: { lat: 26.9196, lng: 75.8263 },
    description: 'Walks through the walled city’s bazaars, havelis and temples.',
    images: [],
    services: [
      service('svc_walled_city_walk', 'biz_pinkcity_walks', 'business', 'Walled City heritage walk', 'Hawa Mahal surroundings, bazaars and a haveli courtyard.', 150, price(1000), true, 12),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'verified')],
    reputation: { rating: 4.6, review_count: 187, review_signal: 'strong' },
    availability: availability('available'),
    languages: ['English', 'Hindi', 'French'],
    opening_hours: 'Walks at 8:00 and 16:00',
  },
  {
    business_id: 'biz_ghat_boats',
    name: 'Ghat Boat Collective',
    category: 'experience',
    destination_id: 'dst_varanasi',
    destination_name: 'Varanasi',
    address: 'Dashashwamedh Ghat, Varanasi',
    coordinates: { lat: 25.3066, lng: 83.0104 },
    description: 'Rowing boats for sunrise and evening aarti views, operated by boatmen families.',
    images: [],
    services: [
      service('svc_sunrise_boat', 'biz_ghat_boats', 'business', 'Sunrise boat ride (1 hour)', 'Shared boat from Dashashwamedh Ghat.', 60, price(700), true, 6),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'verified')],
    reputation: { rating: 4.5, review_count: 301, review_signal: 'strong' },
    availability: availability('available'),
    languages: ['Hindi', 'English'],
    opening_hours: 'From 5:30',
  },
  {
    business_id: 'biz_kochi_harbour',
    name: 'Fort Kochi Harbour Cruises',
    category: 'experience',
    destination_id: 'dst_kochi',
    destination_name: 'Kochi',
    address: 'Fort Kochi Beach Road, Kochi',
    coordinates: { lat: 9.9669, lng: 76.2419 },
    description: 'Short cruises past the Chinese fishing nets and the harbour.',
    images: [],
    services: [
      service('svc_sunset_cruise', 'biz_kochi_harbour', 'business', 'Sunset harbour cruise', '90 minutes, life jackets provided.', 90, price(900), true, 20),
    ],
    verification: [evidence('identity', 'verified'), evidence('business_registration', 'pending')],
    reputation: { rating: 4.3, review_count: 64, review_signal: 'limited' },
    availability: availability('limited'),
    languages: ['English', 'Malayalam', 'Hindi'],
    opening_hours: 'Departures 16:30 and 17:30',
  },
];

/** Curated listings plus a stay, cab operator and package operator for every destination. */
export const BUSINESSES: BusinessDto[] = [...CURATED_BUSINESSES, ...buildOfferBusinesses()];

export const GUIDES: GuideDto[] = [
  {
    guide_id: 'gd_farhan_ali',
    name: 'Farhan Ali',
    avatar: null,
    languages: ['English', 'Hindi', 'Urdu', 'Telugu'],
    specializations: ['Qutb Shahi history', 'Old City food walks', 'Slow-paced tours'],
    destination_ids: ['dst_hyderabad'],
    destination_names: ['Hyderabad'],
    bio: 'Grew up near Charminar and has guided families through the old city for twelve years.',
    years_experience: 12,
    verification: [evidence('identity', 'verified'), evidence('credential', 'verified', 120), evidence('review_authenticity', 'verified', 15)],
    reputation: { rating: 4.8, review_count: 126, review_signal: 'strong' },
    availability: availability('available'),
    services: [
      service('svc_farhan_private', 'gd_farhan_ali', 'guide', 'Private heritage walk (3 hours)', 'Paced for your group, with seating breaks.', 180, price(2500), true, 6),
    ],
  },
  {
    guide_id: 'gd_rukhsana_begum',
    name: 'Rukhsana Begum',
    avatar: null,
    languages: ['English', 'Hindi', 'Urdu'],
    specializations: ['Hyderabadi cuisine', 'Home kitchens', 'Markets'],
    destination_ids: ['dst_hyderabad'],
    destination_names: ['Hyderabad'],
    bio: 'Food writer and cook who leads tasting walks and home-kitchen visits.',
    years_experience: 7,
    verification: [evidence('identity', 'verified'), evidence('credential', 'pending')],
    reputation: { rating: 4.9, review_count: 41, review_signal: 'limited' },
    availability: availability('limited'),
    services: [
      service('svc_rukhsana_food', 'gd_rukhsana_begum', 'guide', 'Hyderabadi food tasting walk', 'Five tastings; vegetarian route available.', 150, price(1800), true, 8),
    ],
  },
  {
    guide_id: 'gd_arjun_rathore',
    name: 'Arjun Singh Rathore',
    avatar: null,
    languages: ['English', 'Hindi', 'French'],
    specializations: ['Forts and palaces', 'Rajput history'],
    destination_ids: ['dst_jaipur', 'dst_jodhpur'],
    destination_names: ['Jaipur', 'Jodhpur'],
    bio: 'Historian-guide specialising in the architecture of Rajasthan’s hill forts.',
    years_experience: 15,
    verification: [evidence('identity', 'verified'), evidence('credential', 'verified', 200)],
    reputation: { rating: 4.7, review_count: 233, review_signal: 'strong' },
    availability: availability('available'),
    services: [
      service('svc_arjun_amber', 'gd_arjun_rathore', 'guide', 'Amber Fort private tour', 'Includes the Sheesh Mahal and ramparts at your pace.', 180, price(3000), true, 6),
    ],
  },
  {
    guide_id: 'gd_lakshmi_narayanan',
    name: 'Lakshmi Narayanan',
    avatar: null,
    languages: ['English', 'Tamil'],
    specializations: ['Temple architecture', 'Chola bronzes'],
    destination_ids: ['dst_madurai', 'dst_thanjavur'],
    destination_names: ['Madurai', 'Thanjavur'],
    bio: 'Art historian who explains Dravidian temple design and ritual life.',
    years_experience: 18,
    verification: [evidence('identity', 'verified'), evidence('credential', 'verified', 300)],
    reputation: { rating: 4.9, review_count: 158, review_signal: 'strong' },
    availability: availability('limited'),
    services: [
      service('svc_lakshmi_temple', 'gd_lakshmi_narayanan', 'guide', 'Meenakshi Temple architecture walk', 'Outer corridors and gopurams, explained.', 150, price(2000), true, 8),
    ],
  },
  {
    guide_id: 'gd_anjali_menon',
    name: 'Anjali Menon',
    avatar: null,
    languages: ['English', 'Malayalam', 'Hindi'],
    specializations: ['Fort Kochi heritage', 'Backwater villages'],
    destination_ids: ['dst_kochi', 'dst_alappuzha'],
    destination_names: ['Kochi', 'Alappuzha (Alleppey)'],
    bio: 'Leads unhurried walks through Fort Kochi and village canoe trips near Alappuzha.',
    years_experience: 9,
    verification: [evidence('identity', 'verified'), evidence('credential', 'verified', 90)],
    reputation: { rating: 4.8, review_count: 97, review_signal: 'strong' },
    availability: availability('available'),
    services: [
      service('svc_anjali_fortkochi', 'gd_anjali_menon', 'guide', 'Fort Kochi heritage walk', 'Fishing nets, Mattancherry and Jew Town.', 150, price(2200), true, 8),
    ],
  },
  {
    guide_id: 'gd_tenzin_dorje',
    name: 'Tenzin Dorje',
    avatar: null,
    languages: ['English', 'Hindi', 'Ladakhi'],
    specializations: ['Monasteries', 'High-altitude acclimatisation walks'],
    destination_ids: ['dst_leh-ladakh'],
    destination_names: ['Leh & Ladakh'],
    bio: 'Mountain guide based in Leh, focused on gentle acclimatisation itineraries.',
    years_experience: 6,
    verification: [evidence('identity', 'verified'), evidence('credential', 'pending')],
    reputation: { rating: null, review_count: 4, review_signal: 'insufficient' },
    availability: availability('unknown'),
    services: [
      service('svc_tenzin_monastery', 'gd_tenzin_dorje', 'guide', 'Monastery circuit (full day)', 'Thiksey, Shey and Hemis by car.', 480, unavailable, false),
    ],
  },
];

export const REVIEWS: Record<string, ReviewDto[]> = {
  biz_oldcity_walks: [
    {
      review_id: 'rev_1',
      author_name: 'Sanjana K.',
      rating: 5,
      text: 'The guide kept a gentle pace for my father and found shaded spots to rest.',
      created_at: iso(-12),
      authenticity: 'verified_booking',
      response: { text: 'Thank you — we look forward to welcoming you again.', created_at: iso(-11) },
    },
    {
      review_id: 'rev_2',
      author_name: 'Marco P.',
      rating: 4,
      text: 'Fascinating history; the lanes get busy after 5 pm.',
      created_at: iso(-30),
      authenticity: 'verified_booking',
      response: null,
    },
  ],
  gd_farhan_ali: [
    {
      review_id: 'rev_3',
      author_name: 'The Iyer family',
      rating: 5,
      text: 'Patient, knowledgeable and wonderful with our grandparents.',
      created_at: iso(-8),
      authenticity: 'verified_booking',
      response: null,
    },
    {
      review_id: 'rev_4',
      author_name: 'Aditya R.',
      rating: 5,
      text: 'Brought the Qutb Shahi period to life.',
      created_at: iso(-45),
      authenticity: 'unverified',
      response: null,
    },
  ],
};

export function findBusiness(id: string) {
  return BUSINESSES.find((b) => b.business_id === id);
}

export function findGuide(id: string) {
  return GUIDES.find((g) => g.guide_id === id);
}

export function findService(serviceId: string) {
  for (const provider of [...BUSINESSES, ...GUIDES]) {
    const match = provider.services.find((s) => s.service_id === serviceId);
    if (match) {
      const isBusiness = 'business_id' in provider;
      return {
        service: match,
        provider: {
          provider_id: isBusiness ? provider.business_id : provider.guide_id,
          provider_type: match.provider_type,
          name: provider.name,
          verified: provider.verification.some((e) => e.kind !== 'review_authenticity' && e.status === 'verified'),
        },
        availability: provider.availability,
      };
    }
  }
  return null;
}
