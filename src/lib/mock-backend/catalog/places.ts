import { getDestination } from '@/data/destinations';
import type { AttractionType } from '@/data/types';
import type { GeoPointDto, Level3, PlaceRefDto } from '@/types/api';

/**
 * Place catalogue used by the development itinerary builder. Hyderabad has a
 * hand-curated set (it anchors the demo trip); other destinations derive
 * places from the public destination guide data.
 */
export interface PlaceRecord {
  place_id: string;
  destination_slug: string;
  name: string;
  category: string;
  kind: 'attraction' | 'meal' | 'stay' | 'experience';
  coordinates: GeoPointDto;
  duration_minutes: number;
  walking: Level3;
  step_free: boolean | null;
  tags: string[];
  description: string;
  best_slot: 'morning' | 'afternoon' | 'evening' | 'any';
  /** 0 = Sunday … 6 = Saturday. */
  closed_days?: number[];
  unesco?: boolean;
  safety_note?: string | null;
}

export const HYDERABAD_PLACES: PlaceRecord[] = [
  {
    place_id: 'plc_hyd_chowmahalla',
    destination_slug: 'hyderabad',
    name: 'Chowmahalla Palace',
    category: 'Palace',
    kind: 'attraction',
    coordinates: { lat: 17.3578, lng: 78.4717 },
    duration_minutes: 90,
    walking: 'moderate',
    step_free: null,
    tags: ['heritage', 'palace', 'architecture'],
    description: 'The Nizams’ ceremonial palace, with courtyards, durbar halls and a collection of vintage cars.',
    best_slot: 'afternoon',
    closed_days: [5],
  },
  {
    place_id: 'plc_hyd_hussain_sagar',
    destination_slug: 'hyderabad',
    name: 'Hussain Sagar & Buddha Statue',
    category: 'Lake',
    kind: 'attraction',
    coordinates: { lat: 17.4239, lng: 78.4738 },
    duration_minutes: 60,
    walking: 'low',
    step_free: true,
    tags: ['nature', 'landmark'],
    description: 'A lakeside promenade facing the monolithic Buddha statue on an island in the lake.',
    best_slot: 'evening',
  },
  {
    place_id: 'plc_hyd_qutb_shahi',
    destination_slug: 'hyderabad',
    name: 'Qutb Shahi Tombs',
    category: 'Heritage site',
    kind: 'attraction',
    coordinates: { lat: 17.3949, lng: 78.3968 },
    duration_minutes: 75,
    walking: 'moderate',
    step_free: null,
    tags: ['heritage', 'architecture'],
    description: 'Domed tombs of the Qutb Shahi rulers set in restored gardens.',
    best_slot: 'morning',
  },
  {
    place_id: 'plc_hyd_salar_jung',
    destination_slug: 'hyderabad',
    name: 'Salar Jung Museum',
    category: 'Museum',
    kind: 'attraction',
    coordinates: { lat: 17.3713, lng: 78.4804 },
    duration_minutes: 90,
    walking: 'moderate',
    step_free: null,
    tags: ['museum', 'heritage', 'art'],
    description: 'An extensive collection of art and artefacts across many galleries.',
    best_slot: 'afternoon',
    closed_days: [5],
  },
  {
    place_id: 'plc_hyd_birla_mandir',
    destination_slug: 'hyderabad',
    name: 'Birla Mandir',
    category: 'Temple',
    kind: 'attraction',
    coordinates: { lat: 17.4062, lng: 78.4691 },
    duration_minutes: 60,
    walking: 'moderate',
    step_free: false,
    tags: ['temples', 'spiritual', 'architecture'],
    description: 'A white marble temple on Naubath Pahad with views over the city.',
    best_slot: 'evening',
  },
  {
    place_id: 'plc_hyd_jagannath',
    destination_slug: 'hyderabad',
    name: 'Sri Jagannath Temple, Banjara Hills',
    category: 'Temple',
    kind: 'attraction',
    coordinates: { lat: 17.4156, lng: 78.4347 },
    duration_minutes: 45,
    walking: 'low',
    step_free: null,
    tags: ['temples', 'spiritual', 'architecture'],
    description: 'A red sandstone temple built in the Kalinga style, a short walk from the drop-off point.',
    best_slot: 'any',
  },
  {
    place_id: 'plc_hyd_necklace_road',
    destination_slug: 'hyderabad',
    name: 'Necklace Road evening drive',
    category: 'Scenic drive',
    kind: 'experience',
    coordinates: { lat: 17.4115, lng: 78.4649 },
    duration_minutes: 45,
    walking: 'low',
    step_free: true,
    tags: ['nature', 'relaxed'],
    description: 'A gentle drive along the lakeside road as the city lights come on.',
    best_slot: 'evening',
  },
  {
    place_id: 'plc_hyd_chilkur',
    destination_slug: 'hyderabad',
    name: 'Chilkur Balaji Temple',
    category: 'Temple',
    kind: 'attraction',
    coordinates: { lat: 17.3571, lng: 78.2978 },
    duration_minutes: 60,
    walking: 'low',
    step_free: null,
    tags: ['temples', 'spiritual'],
    description: 'A much-visited temple to Lord Balaji on the western edge of the city.',
    best_slot: 'morning',
  },
  {
    place_id: 'plc_hyd_charminar',
    destination_slug: 'hyderabad',
    name: 'Charminar',
    category: 'Monument',
    kind: 'attraction',
    coordinates: { lat: 17.3616, lng: 78.4747 },
    duration_minutes: 60,
    walking: 'moderate',
    step_free: false,
    tags: ['heritage', 'architecture', 'landmark'],
    description: 'The four-minaret gateway built in 1591, at the heart of the old city.',
    best_slot: 'afternoon',
    safety_note: 'Busy area — keep phones and bags secure.',
  },
  {
    place_id: 'plc_hyd_mecca_masjid',
    destination_slug: 'hyderabad',
    name: 'Mecca Masjid',
    category: 'Mosque',
    kind: 'attraction',
    coordinates: { lat: 17.3604, lng: 78.4736 },
    duration_minutes: 30,
    walking: 'low',
    step_free: null,
    tags: ['heritage', 'spiritual', 'architecture'],
    description: 'One of the largest mosques in India, beside Charminar.',
    best_slot: 'afternoon',
  },
  {
    place_id: 'plc_hyd_laad_bazaar',
    destination_slug: 'hyderabad',
    name: 'Laad Bazaar',
    category: 'Market',
    kind: 'attraction',
    coordinates: { lat: 17.3609, lng: 78.4732 },
    duration_minutes: 60,
    walking: 'high',
    step_free: false,
    tags: ['shopping', 'market', 'crowded'],
    description: 'The bangle market off Charminar, with narrow and often crowded lanes.',
    best_slot: 'evening',
    safety_note: 'Crowded lanes in the evening — keep valuables secure.',
  },
  {
    place_id: 'plc_hyd_golconda',
    destination_slug: 'hyderabad',
    name: 'Golconda Fort',
    category: 'Fort',
    kind: 'attraction',
    coordinates: { lat: 17.3833, lng: 78.4011 },
    duration_minutes: 120,
    walking: 'high',
    step_free: false,
    tags: ['heritage', 'fort', 'architecture'],
    description: 'A hilltop citadel; reaching the top involves a long, steep climb.',
    best_slot: 'morning',
  },
  {
    place_id: 'plc_hyd_nizams_museum',
    destination_slug: 'hyderabad',
    name: 'Nizam’s Museum (Purani Haveli)',
    category: 'Museum',
    kind: 'attraction',
    coordinates: { lat: 17.3662, lng: 78.4851 },
    duration_minutes: 60,
    walking: 'low',
    step_free: null,
    tags: ['museum', 'heritage'],
    description: 'Gifts and memorabilia of the last Nizam, displayed in a historic mansion.',
    best_slot: 'morning',
    closed_days: [5],
  },
  {
    place_id: 'plc_hyd_meal_biryani',
    destination_slug: 'hyderabad',
    name: 'Hyderabadi biryani lunch',
    category: 'Meal',
    kind: 'meal',
    coordinates: { lat: 17.3657, lng: 78.4747 },
    duration_minutes: 60,
    walking: 'low',
    step_free: null,
    tags: ['food'],
    description: 'Slow-cooked dum biryani — choose any well-reviewed restaurant nearby.',
    best_slot: 'afternoon',
  },
  {
    place_id: 'plc_hyd_meal_irani_chai',
    destination_slug: 'hyderabad',
    name: 'Irani chai & Osmania biscuits',
    category: 'Café',
    kind: 'meal',
    coordinates: { lat: 17.3622, lng: 78.4755 },
    duration_minutes: 40,
    walking: 'low',
    step_free: null,
    tags: ['food'],
    description: 'A Hyderabad tradition in the old city’s Irani cafés.',
    best_slot: 'evening',
  },
  {
    place_id: 'plc_hyd_meal_dinner',
    destination_slug: 'hyderabad',
    name: 'Dinner in Banjara Hills',
    category: 'Meal',
    kind: 'meal',
    coordinates: { lat: 17.4126, lng: 78.4386 },
    duration_minutes: 75,
    walking: 'low',
    step_free: null,
    tags: ['food'],
    description: 'Evening meal close to your stay.',
    best_slot: 'evening',
  },
  {
    place_id: 'plc_hyd_stay',
    destination_slug: 'hyderabad',
    name: 'Your stay (not yet chosen)',
    category: 'Stay',
    kind: 'stay',
    coordinates: { lat: 17.4126, lng: 78.4482 },
    duration_minutes: 60,
    walking: 'low',
    step_free: null,
    tags: ['stay'],
    description: 'Check in and rest after arriving.',
    best_slot: 'any',
  },
];

const DURATION_BY_TYPE: Partial<Record<AttractionType, number>> = {
  monument: 90,
  fort: 120,
  palace: 90,
  temple: 60,
  nature: 120,
  museum: 90,
  market: 60,
  lake: 60,
  beach: 120,
  viewpoint: 45,
  'religious-site': 60,
  'wildlife-reserve': 180,
  waterfall: 90,
  cave: 90,
  neighbourhood: 90,
  experience: 120,
};

const WALKING_BY_TYPE: Partial<Record<AttractionType, Level3>> = {
  fort: 'high',
  nature: 'high',
  'wildlife-reserve': 'low',
  waterfall: 'moderate',
  market: 'high',
  viewpoint: 'moderate',
  cave: 'moderate',
  beach: 'moderate',
  museum: 'moderate',
  temple: 'moderate',
  lake: 'low',
  experience: 'moderate',
};

const TAGS_BY_TYPE: Partial<Record<AttractionType, string[]>> = {
  monument: ['heritage', 'architecture'],
  fort: ['heritage', 'fort'],
  palace: ['heritage', 'palace'],
  temple: ['temples', 'spiritual'],
  'religious-site': ['spiritual'],
  museum: ['museum', 'heritage'],
  market: ['shopping', 'market'],
  nature: ['nature'],
  lake: ['nature'],
  beach: ['beaches', 'nature'],
  viewpoint: ['nature'],
  'wildlife-reserve': ['wildlife', 'nature'],
  waterfall: ['nature'],
  cave: ['heritage'],
  neighbourhood: ['culture'],
  experience: ['culture'],
};

const titleCase = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function placesForDestination(slug: string): PlaceRecord[] {
  if (slug === 'hyderabad') return HYDERABAD_PLACES;
  const destination = getDestination(slug);
  if (!destination) return [];

  const attractions: PlaceRecord[] = destination.attractions.map((attraction) => ({
    place_id: `plc_${attraction.slug}`,
    destination_slug: slug,
    name: attraction.name,
    category: titleCase(attraction.type),
    kind: 'attraction',
    coordinates: attraction.coordinates,
    duration_minutes: DURATION_BY_TYPE[attraction.type] ?? 90,
    walking: WALKING_BY_TYPE[attraction.type] ?? 'moderate',
    step_free: null,
    tags: TAGS_BY_TYPE[attraction.type] ?? ['culture'],
    description: attraction.summary,
    best_slot: attraction.type === 'viewpoint' || attraction.type === 'lake' ? 'evening' : 'any',
    unesco: attraction.unesco,
  }));

  const centre = destination.coordinates;
  const meals: PlaceRecord[] = [
    {
      place_id: `plc_${slug}_lunch`,
      destination_slug: slug,
      name: `Lunch — local ${destination.name} specialities`,
      category: 'Meal',
      kind: 'meal',
      coordinates: centre,
      duration_minutes: 60,
      walking: 'low',
      step_free: null,
      tags: ['food'],
      description: 'Choose a well-reviewed local restaurant near your morning stop.',
      best_slot: 'afternoon',
    },
    {
      place_id: `plc_${slug}_dinner`,
      destination_slug: slug,
      name: 'Dinner near your stay',
      category: 'Meal',
      kind: 'meal',
      coordinates: centre,
      duration_minutes: 75,
      walking: 'low',
      step_free: null,
      tags: ['food'],
      description: 'An easy evening meal close to where you are staying.',
      best_slot: 'evening',
    },
    {
      place_id: `plc_${slug}_stay`,
      destination_slug: slug,
      name: 'Your stay (not yet chosen)',
      category: 'Stay',
      kind: 'stay',
      coordinates: centre,
      duration_minutes: 60,
      walking: 'low',
      step_free: null,
      tags: ['stay'],
      description: 'Check in and rest after arriving.',
      best_slot: 'any',
    },
  ];
  return [...attractions, ...meals];
}

export function findPlace(placeId: string): PlaceRecord | undefined {
  if (placeId.startsWith('plc_hyd_')) return HYDERABAD_PLACES.find((p) => p.place_id === placeId);
  for (const slug of ['hyderabad']) {
    const match = placesForDestination(slug).find((p) => p.place_id === placeId);
    if (match) return match;
  }
  return undefined;
}

export function toPlaceRef(place: PlaceRecord): PlaceRefDto {
  return {
    place_id: place.place_id,
    name: place.name,
    category: place.category,
    coordinates: place.coordinates,
    image: null,
    destination_slug: place.destination_slug,
    address: null,
  };
}
