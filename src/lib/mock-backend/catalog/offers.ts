import { destinations } from '@/data/destinations';
import type {
  AvailabilityDto,
  BusinessDto,
  CostDto,
  GeoPointDto,
  PackageDetailsDto,
  ServiceDto,
  ServiceUnit,
  VerificationEvidenceDto,
} from '@/types/api';

/**
 * Bookable stays, cab operators and package operators for every destination:
 * the businesses a traveller can book straight from a recommended itinerary.
 * Sample listings — names, prices and availability are illustrative.
 */

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

type StayRow = readonly [name: string, area: string, nightly: number, stepFree: boolean, about: string];
type CabRow = readonly [name: string, transfer: string, transferPrice: number, dayPrice: number, vehicle: 'sedan' | 'suv'];
type PackageRow = readonly [name: string, perPerson: number, days: number];

const ROWS: Record<string, readonly [StayRow, CabRow, PackageRow]> = {
  delhi: [
    ['Jaali House Residency', 'Sunder Nagar', 7200, true, 'Quiet rooms near Humayun’s Tomb, with a lift and a shaded garden courtyard.'],
    ['Capital Chauffeur Cabs', 'Airport transfer (one way)', 1500, 3200, 'sedan'],
    ['Old & New Delhi Explorer', 6900, 3],
  ],
  agra: [
    ['Mehtab View Guesthouse', 'Taj Ganj', 5400, false, 'Rooftop views of the Taj Mahal, a short walk from the East Gate.'],
    ['Yamuna Road Cabs', 'Agra Cantt station transfer (one way)', 900, 2600, 'sedan'],
    ['Taj at Sunrise Weekend', 7800, 2],
  ],
  varanasi: [
    ['Ghat Steps Heritage House', 'Assi Ghat', 4800, false, 'A riverside house above Assi Ghat with a rooftop facing the Ganga. The lanes to it are narrow and stepped.'],
    ['Kashi Airport Cabs', 'Airport transfer (one way)', 1400, 2500, 'sedan'],
    ['Ganga Aarti & Sarnath Journey', 6200, 3],
  ],
  rishikesh: [
    ['Riverbend Garden Retreat', 'Tapovan', 4200, true, 'Garden rooms above the Ganga, with morning yoga on the lawn.'],
    ['Doon Valley Cabs', 'Dehradun airport transfer (one way)', 2600, 3400, 'sedan'],
    ['Rishikesh Yoga & River Break', 8400, 3],
  ],
  'leh-ladakh': [
    ['Stok View Guest Lodge', 'Changspa, Leh', 5600, true, 'Warm ground-floor rooms, suited to the first quiet days of acclimatisation.'],
    ['High Pass Cabs', 'Leh airport transfer (one way)', 1000, 5200, 'suv'],
    ['Leh, Nubra & Pangong Circuit', 22500, 6],
  ],
  manali: [
    ['Deodar Ridge Cottages', 'Old Manali', 4900, false, 'Timber cottages among deodar trees, a short drive above the Mall Road.'],
    ['Kullu Valley Cabs', 'Bhuntar airport transfer (one way)', 3800, 4200, 'suv'],
    ['Manali & Solang Valley Escape', 11800, 4],
  ],
  'spiti-valley': [
    ['Kaza Mud House Stay', 'Kaza', 3800, true, 'Traditional mud-brick rooms with solar heating and home-cooked meals.'],
    ['Spiti High Road Drivers', 'Manali to Kaza transfer (one way)', 14000, 6000, 'suv'],
    ['Spiti Monasteries Circuit', 24000, 6],
  ],
  amritsar: [
    ['Heritage Street Haveli', 'Near the Golden Temple', 4600, true, 'A restored haveli on the heritage street, with a lift to every floor.'],
    ['Majha Cabs', 'Airport transfer (one way)', 1100, 2800, 'sedan'],
    ['Golden Temple & Wagah Border Weekend', 6500, 2],
  ],
  khajuraho: [
    ['Chandela Garden Rooms', 'Near the Western Group', 4400, true, 'Single-storey garden rooms a short walk from the Western Group of temples.'],
    ['Bundelkhand Cabs', 'Airport transfer (one way)', 900, 2600, 'sedan'],
    ['Khajuraho Temples & Panna Safari', 9800, 3],
  ],
  'valley-of-flowers': [
    ['Ghangaria Trekkers’ Lodge', 'Ghangaria', 3200, false, 'Simple rooms with hot water in the trailhead village, reached on foot from Govindghat.'],
    ['Garhwal Hill Drivers', 'Rishikesh to Govindghat transfer (one way)', 9500, 4800, 'suv'],
    ['Valley of Flowers Trek', 18500, 5],
  ],
  jaipur: [
    ['Pink Courtyard Haveli', 'Civil Lines', 6400, true, 'A 1920s haveli with a lift, a courtyard pool and rooftop dinners.'],
    ['Amber Road Cabs', 'Airport transfer (one way)', 900, 2600, 'sedan'],
    ['Jaipur Forts & Bazaars', 7400, 3],
  ],
  udaipur: [
    ['Lake Pichola Terrace Rooms', 'Lal Ghat', 7900, false, 'Lake-facing rooms and a rooftop café near the City Palace.'],
    ['Mewar Lakeside Cabs', 'Airport transfer (one way)', 1200, 2900, 'sedan'],
    ['Udaipur Lakes & Palaces', 8600, 3],
  ],
  jaisalmer: [
    ['Sonar Sandstone Haveli', 'Below the fort', 5200, false, 'Carved sandstone rooms with fort views; a desert camp night can be arranged.'],
    ['Thar Dunes Cabs', 'Railway station transfer (one way)', 800, 3000, 'suv'],
    ['Golden Fort & Sam Dunes Camp', 9200, 3],
  ],
  jodhpur: [
    ['Blue Lane Guesthouse', 'Navchokiya', 4300, false, 'A blue-washed house in the old city, beneath Mehrangarh.'],
    ['Marwar Cabs', 'Airport transfer (one way)', 900, 2700, 'sedan'],
    ['Blue City & Mehrangarh Break', 6800, 2],
  ],
  ranthambore: [
    ['Tiger Trail Jungle Lodge', 'Ranthambore Road', 8800, true, 'Garden cottages near the park gates, with early breakfasts before safaris.'],
    ['Sawai Madhopur Cabs', 'Railway station transfer (one way)', 700, 2800, 'sedan'],
    ['Ranthambore Safari Weekend', 14500, 3],
  ],
  mumbai: [
    ['Marine Drive Deco Rooms', 'Churchgate', 9500, true, 'Art Deco rooms facing the Queen’s Necklace, with a lift.'],
    ['Bay City Cabs', 'Airport transfer (one way)', 1800, 3600, 'sedan'],
    ['Mumbai Heritage & Elephanta', 8900, 3],
  ],
  goa: [
    ['Casa Azul Fontainhas', 'Fontainhas, Panaji', 6200, false, 'A Portuguese-era townhouse in the Latin quarter.'],
    ['Konkan Coast Cabs', 'Airport transfer (one way)', 1700, 3000, 'sedan'],
    ['North & South Goa Beaches', 10500, 4],
  ],
  'rann-of-kutch': [
    ['Dhordo Bhunga Village Stay', 'Dhordo', 6800, true, 'Round, mud-walled bhunga huts close to the white desert.'],
    ['Kutch Salt Road Cabs', 'Bhuj to Dhordo transfer (one way)', 2600, 3400, 'suv'],
    ['White Rann & Kutch Crafts', 12800, 3],
  ],
  'ajanta-ellora': [
    ['Deccan Caves Residency', 'Chhatrapati Sambhajinagar', 4600, true, 'Comfortable city rooms between the two cave sites, with a lift.'],
    ['Ellora Road Cabs', 'Airport transfer (one way)', 900, 3200, 'sedan'],
    ['Ajanta & Ellora Caves', 7900, 3],
  ],
  lonar: [
    ['Crater Rim Eco Stay', 'Lonar', 2900, true, 'Simple eco-rooms a short walk from the crater rim trail.'],
    ['Buldhana Road Cabs', 'Sambhajinagar to Lonar transfer (one way)', 3800, 3200, 'sedan'],
    ['Lonar Crater Getaway', 5400, 2],
  ],
  gir: [
    ['Sasan Forest Edge Lodge', 'Sasan Gir', 7400, true, 'Cottages at the forest edge, a short drive from the safari gate.'],
    ['Saurashtra Cabs', 'Junagadh station transfer (one way)', 1900, 3000, 'sedan'],
    ['Asiatic Lion Safari Break', 13200, 3],
  ],
  alappuzha: [
    ['Punnamada Lakeside Villas', 'Punnamada Lake', 6900, true, 'Waterfront cottages with a private jetty for houseboat pick-ups.'],
    ['Backwater Coast Cabs', 'Kochi airport transfer (one way)', 3200, 3000, 'sedan'],
    ['Houseboat Overnight & Backwaters', 9800, 2],
  ],
  munnar: [
    ['Tea Estate Bungalow', 'Chithirapuram', 6300, false, 'A planter’s bungalow among the tea gardens, with fireplaces.'],
    ['High Range Cabs', 'Kochi airport transfer (one way)', 4500, 3400, 'sedan'],
    ['Munnar Tea Hills Retreat', 10900, 3],
  ],
  kochi: [
    ['Spice Warehouse Rooms', 'Fort Kochi', 6600, true, 'A converted spice-trade warehouse by the harbour, with a lift.'],
    ['Malabar Coast Cabs', 'Airport transfer (one way)', 1900, 2900, 'sedan'],
    ['Kochi Heritage & Kathakali', 7200, 3],
  ],
  hampi: [
    ['Boulder Valley Homestay', 'Kamalapur', 3900, true, 'Garden rooms between paddy fields and boulder hills.'],
    ['Vijayanagara Cabs', 'Hosapete station transfer (one way)', 700, 2400, 'sedan'],
    ['Hampi Ruins in Three Days', 6900, 3],
  ],
  mysuru: [
    ['Palace Road Heritage Inn', 'Near Mysore Palace', 5200, true, 'Heritage rooms with a lift, a short drive from the illuminated palace.'],
    ['Chamundi Hills Cabs', 'Railway station transfer (one way)', 700, 2800, 'sedan'],
    ['Mysuru Palaces & Srirangapatna', 6400, 2],
  ],
  coorg: [
    ['Coffee Bean Plantation Stay', 'Near Madikeri', 5800, false, 'Cottages on a working coffee estate, with plantation walks.'],
    ['Kodagu Hill Cabs', 'Mysuru transfer (one way)', 3400, 3100, 'sedan'],
    ['Coorg Coffee & Waterfalls', 9600, 3],
  ],
  warangal: [
    ['Kakatiya Heritage Residency', 'Hanamkonda', 3600, true, 'Modern rooms with a lift, close to the Thousand Pillar Temple.'],
    ['Orugallu Cabs', 'Kazipet station transfer (one way)', 700, 2600, 'sedan'],
    ['Kakatiya Temples & Ramappa', 6200, 2],
  ],
  madurai: [
    ['Temple Tower View Rooms', 'Near Meenakshi Temple', 4200, true, 'Rooms with a lift and a rooftop view of the temple gopurams.'],
    ['Vaigai Cabs', 'Airport transfer (one way)', 900, 2500, 'sedan'],
    ['Madurai Temple City', 5900, 2],
  ],
  thanjavur: [
    ['Chola Courtyard House', 'Near Brihadeeswarar Temple', 4700, false, 'A restored courtyard house in the Chettinad style.'],
    ['Kaveri Delta Cabs', 'Tiruchirappalli airport transfer (one way)', 2300, 2600, 'sedan'],
    ['Great Living Chola Temples', 7400, 3],
  ],
  mahabalipuram: [
    ['Shore Temple Sands Resort', 'Mahabalipuram beach', 6100, true, 'Beachside rooms a short walk from the Shore Temple.'],
    ['Coromandel Coast Cabs', 'Chennai airport transfer (one way)', 2600, 2800, 'sedan'],
    ['Mahabalipuram Monuments & Beach', 6300, 2],
  ],
  puducherry: [
    ['White Town Villa Rooms', 'White Town', 5900, false, 'A colonial villa with a bougainvillea courtyard.'],
    ['Promenade Cabs', 'Chennai airport transfer (one way)', 3600, 2600, 'sedan'],
    ['Pondicherry French Quarter & Auroville', 6800, 3],
  ],
  gandikota: [
    ['Gorge View Camp', 'Gandikota', 3400, true, 'Tented rooms near the fort, facing the Pennar gorge.'],
    ['Rayalaseema Cabs', 'Kadapa transfer (one way)', 2200, 2800, 'sedan'],
    ['Gandikota Canyon & Belum Caves', 6900, 2],
  ],
  'andaman-islands': [
    ['Radhanagar Palm Cottages', 'Swaraj Dweep (Havelock)', 8400, true, 'Palm-shaded cottages a short ride from Radhanagar Beach.'],
    ['Island Road Cabs', 'Port Blair airport transfer (one way)', 900, 3000, 'sedan'],
    ['Andaman Beaches & Snorkelling', 21500, 5],
  ],
  kolkata: [
    ['Park Street Heritage Rooms', 'Park Street', 6800, true, 'A 1930s building with a lift, close to the Maidan.'],
    ['Hooghly Cabs', 'Airport transfer (one way)', 1300, 2600, 'sedan'],
    ['Kolkata Heritage & Food', 6600, 3],
  ],
  darjeeling: [
    ['Kanchenjunga View Cottage', 'Near Chowrasta', 5300, false, 'Hillside rooms with mountain views and estate tea.'],
    ['Siliguri Hill Cabs', 'Bagdogra airport transfer (one way)', 3600, 3400, 'suv'],
    ['Darjeeling Toy Train & Tiger Hill', 10400, 3],
  ],
  gangtok: [
    ['Ridge Line Boutique Stay', 'Near MG Marg', 5700, true, 'Rooms with a lift and valley views, near MG Marg.'],
    ['Teesta Valley Cabs', 'Bagdogra airport transfer (one way)', 4200, 3600, 'suv'],
    ['Gangtok & Tsomgo Lake', 12600, 4],
  ],
  meghalaya: [
    ['Root Bridge Valley Homestay', 'Sohra (Cherrapunji)', 3900, false, 'Family-run rooms near the valley trails of Sohra.'],
    ['Khasi Hills Cabs', 'Guwahati airport transfer (one way)', 4600, 3600, 'suv'],
    ['Meghalaya Caves, Falls & Root Bridges', 14900, 5],
  ],
  kaziranga: [
    ['Elephant Grass Jungle Resort', 'Kohora', 6200, true, 'Cottages near the central range gate, with a safari desk.'],
    ['Brahmaputra Cabs', 'Jorhat airport transfer (one way)', 2900, 3200, 'suv'],
    ['Kaziranga Rhino Safari', 13800, 3],
  ],
  ziro: [
    ['Apatani Bamboo Homestay', 'Hong village', 2800, false, 'Bamboo rooms with an Apatani family, among the rice fields.'],
    ['Subansiri Cabs', 'Naharlagun station transfer (one way)', 4200, 3600, 'suv'],
    ['Ziro Valley Villages', 11200, 4],
  ],
  majuli: [
    ['Satra River Island Cottages', 'Garamur', 3300, true, 'Stilt cottages near the satras, with bicycles to borrow.'],
    ['Majuli Island Cabs', 'Jorhat to Majuli transfer, via ferry (one way)', 2600, 2800, 'sedan'],
    ['Majuli Satras & Mask-making', 7900, 3],
  ],
  'puri-konark': [
    ['Sea Breeze Beach Hotel', 'Puri beach road', 4900, true, 'Sea-facing rooms with a lift on the beach road.'],
    ['Kalinga Coast Cabs', 'Bhubaneswar airport transfer (one way)', 2400, 2800, 'sedan'],
    ['Puri, Konark & Bhubaneswar Temples', 7600, 3],
  ],
  'bodh-gaya': [
    ['Bodhi Garden Guesthouse', 'Near Mahabodhi Temple', 3800, true, 'Quiet garden rooms a short walk from the Mahabodhi Temple.'],
    ['Magadh Cabs', 'Gaya airport transfer (one way)', 900, 2700, 'sedan'],
    ['Bodh Gaya, Rajgir & Nalanda', 7200, 3],
  ],
};

const OPERATOR_BRAND: Record<string, string> = {
  north: 'Northern Trails Holidays',
  west: 'Western Routes Holidays',
  south: 'Southern Sojourns',
  east: 'Eastern Horizons Travel',
  northeast: 'Seven Sisters Journeys',
  central: 'Heartland Holidays',
  islands: 'Island Hopper Holidays',
};

/** Service ids a destination's booking recommendations are drawn from. */
export interface DestinationOfferSet {
  room: string;
  suite: string | null;
  transfer: string;
  fullDay: string;
  package: string;
}

export interface OfferTraits {
  stepFree: boolean;
  /** Passengers per vehicle, for cab services. */
  seats: number;
}

/** Hyderabad's hand-curated listings (see catalog/providers) anchor the demo trip. */
const HYDERABAD_SET: DestinationOfferSet = {
  room: 'svc_lakeview_room',
  suite: null,
  transfer: 'svc_deccan_airport',
  fullDay: 'svc_city_cab',
  package: 'svc_nizam_trails_package',
};

const keyOf = (slug: string) => slug.replace(/-/g, '_');

const TRAITS = new Map<string, OfferTraits>([
  ['svc_lakeview_room', { stepFree: true, seats: 0 }],
  ['svc_deccan_airport', { stepFree: false, seats: 4 }],
  ['svc_city_cab', { stepFree: false, seats: 4 }],
]);
for (const [slug, [stay, cab]] of Object.entries(ROWS)) {
  const key = keyOf(slug);
  const seats = cab[4] === 'suv' ? 6 : 4;
  TRAITS.set(`svc_${key}_room`, { stepFree: stay[3], seats: 0 });
  TRAITS.set(`svc_${key}_suite`, { stepFree: stay[3], seats: 0 });
  TRAITS.set(`svc_${key}_transfer`, { stepFree: false, seats });
  TRAITS.set(`svc_${key}_day`, { stepFree: false, seats });
}

export function offerSetFor(slug: string): DestinationOfferSet | null {
  if (slug === 'hyderabad') return HYDERABAD_SET;
  if (!ROWS[slug]) return null;
  const key = keyOf(slug);
  return {
    room: `svc_${key}_room`,
    suite: `svc_${key}_suite`,
    transfer: `svc_${key}_transfer`,
    fullDay: `svc_${key}_day`,
    package: `svc_${key}_package`,
  };
}

export function offerTraits(serviceId: string): OfferTraits {
  return TRAITS.get(serviceId) ?? { stepFree: false, seats: 4 };
}

/** Stable pseudo-random value in [0, 1) for a key, so sample data doesn't shift between loads. */
function seeded(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

const evidence = (kind: VerificationEvidenceDto['kind']): VerificationEvidenceDto => ({
  kind,
  status: 'verified',
  verified_at: iso(-45),
  expires_at: iso(320),
  verifier_label: 'TravIndi verification (sample data)',
  note: null,
});

const listed = (rupees: number): CostDto => ({
  status: 'authoritative',
  value: { amount_minor: rupees * 100, currency: 'INR' },
  source_label: 'Provider’s listed price (sample data)',
  updated_at: iso(-2),
});

const available = (): AvailabilityDto => ({
  status: 'available',
  next_available_at: null,
  freshness: { source_kind: 'application', updated_at: iso(-0.02), source_label: 'Provider calendar (sample data)' },
});

const offer = (
  service_id: string,
  provider_id: string,
  name: string,
  description: string,
  duration_minutes: number | null,
  rupees: number,
  unit: ServiceUnit,
  capacity: number,
  highlights: string[],
  package_details: PackageDetailsDto | null = null,
): ServiceDto => ({
  service_id,
  provider_id,
  provider_type: 'business',
  name,
  description,
  duration_minutes,
  price: listed(rupees),
  unit,
  bookable: true,
  capacity,
  highlights,
  package_details,
});

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export function buildOfferBusinesses(): BusinessDto[] {
  const businesses: BusinessDto[] = [];
  for (const destination of destinations) {
    const row = ROWS[destination.slug];
    if (!row) continue;
    const [[stayName, area, nightly, stepFree, about], [cabName, transferName, transferPrice, dayPrice, vehicle], [packageName, perPerson, days]] = row;
    const key = keyOf(destination.slug);
    const place = destination.name;
    const nights = days - 1;
    const vehicleLabel = vehicle === 'suv' ? 'Air-conditioned SUV, up to 6 passengers' : 'Air-conditioned sedan, up to 4 passengers';

    const base = (index: number): Pick<BusinessDto, 'destination_id' | 'destination_name' | 'coordinates' | 'images' | 'verification' | 'reputation' | 'availability' | 'languages'> => ({
      destination_id: `dst_${destination.slug}`,
      destination_name: place,
      coordinates: {
        lat: Number((destination.coordinates.lat + (seeded(`${key}:lat:${index}`) - 0.5) * 0.03).toFixed(4)),
        lng: Number((destination.coordinates.lng + (seeded(`${key}:lng:${index}`) - 0.5) * 0.03).toFixed(4)),
      } satisfies GeoPointDto,
      images: [],
      verification: [evidence('identity'), evidence('business_registration')],
      reputation: {
        rating: Math.round((4.3 + seeded(`${key}:rating:${index}`) * 0.6) * 10) / 10,
        review_count: 40 + Math.round(seeded(`${key}:reviews:${index}`) * 360),
        review_signal: 'strong',
      },
      availability: available(),
      languages: ['English', 'Hindi'],
    });

    const stayId = `biz_${key}_stay`;
    businesses.push({
      ...base(1),
      business_id: stayId,
      name: stayName,
      category: 'stay',
      address: `${area}, ${place}`,
      description: about,
      services: [
        offer(`svc_${key}_room`, stayId, 'Deluxe double room', 'A double room for two, with breakfast.', null, nightly, 'room_night', 8, [
          'Breakfast included',
          stepFree ? 'Step-free access and a lift' : 'Rooms are reached by stairs',
          'Free cancellation until the day before',
        ]),
        offer(`svc_${key}_suite`, stayId, 'Family suite (up to 4 guests)', 'A larger suite with extra beds and breakfast for four.', null, Math.round((nightly * 1.7) / 100) * 100, 'room_night', 3, [
          'Breakfast for four',
          'Extra beds for children',
        ]),
      ],
      opening_hours: 'Check-in from 14:00 · check-out by 11:00',
    });

    const cabId = `biz_${key}_cabs`;
    businesses.push({
      ...base(2),
      business_id: cabId,
      name: cabName,
      category: 'transport',
      address: place,
      description: `Licensed ${vehicle === 'suv' ? 'SUVs' : 'cars'} with local drivers for transfers and day hire around ${place}.`,
      services: [
        offer(`svc_${key}_transfer`, cabId, transferName, `${vehicleLabel}. The driver meets you with a name board.`, 90, transferPrice, 'vehicle', 4, [vehicleLabel, 'Waits up to 60 minutes for delays']),
        offer(`svc_${key}_day`, cabId, 'Full-day car with driver (8 hours)', `${vehicleLabel}. Up to 80 km around ${place}; tolls and parking are extra.`, 480, dayPrice, 'vehicle', 4, [vehicleLabel, 'Driver allowance included']),
      ],
      opening_hours: 'Bookings 6:00–22:00',
    });

    const tourId = `biz_${key}_journeys`;
    businesses.push({
      ...base(3),
      business_id: tourId,
      name: `${OPERATOR_BRAND[destination.region] ?? 'Local Journeys'} · ${place}`,
      category: 'tour_operator',
      address: place,
      description: `Private packages around ${place}, with the stay, car and local guides arranged.`,
      services: [
        offer(`svc_${key}_package`, tourId, packageName, `${plural(days, 'day')} and ${plural(nights, 'night')} in and around ${place}, at a comfortable pace.`, null, perPerson, 'person', 12, ['Stay, car and guide included', 'Free cancellation up to 7 days before'], {
          days,
          nights,
          includes: [`${plural(nights, 'night')} at ${stayName}`, 'Daily breakfast', 'Private car with driver for sightseeing', 'Local guide at the main sights', 'Arrival and departure transfers'],
        }),
      ],
      opening_hours: 'Planning desk 9:00–19:00',
    });
  }
  return businesses;
}
