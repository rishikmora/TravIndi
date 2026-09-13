import type {
  BudgetSummaryDto,
  CostDto,
  ItineraryDayDto,
  ItineraryDto,
  ItineraryItemDto,
  MoneyDto,
  ReasonDto,
  TravelLegDto,
  TripDto,
} from '@/types/api';
import { haversineKm } from '@/utils/geo';
import { offerSetFor } from '../catalog/offers';
import { type PlaceRecord, placesForDestination, toPlaceRef } from '../catalog/places';
import { newId } from '../http';

/** Points an item at the bookable service recommended for it (e.g. a stay or a transfer). */
const recommendedBooking = (serviceId: string | null | undefined): ItineraryItemDto['booking'] =>
  serviceId ? { booking_id: null, service_id: serviceId, status: 'recommended' } : null;

const INTEREST_TAGS: Record<string, { tags: string[]; label: string }> = {
  temples: { tags: ['temples'], label: 'temple' },
  heritage: { tags: ['heritage', 'architecture', 'palace', 'fort', 'museum'], label: 'heritage' },
  food: { tags: ['food'], label: 'food' },
  nature: { tags: ['nature'], label: 'nature' },
  shopping: { tags: ['shopping', 'market'], label: 'shopping' },
  spiritual: { tags: ['spiritual', 'temples'], label: 'spiritual' },
  museums: { tags: ['museum'], label: 'museum' },
  wildlife: { tags: ['wildlife'], label: 'wildlife' },
  beaches: { tags: ['beaches'], label: 'beach' },
  culture: { tags: ['culture'], label: 'culture' },
};

const HYDERABAD_TEMPLATE: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Arrival & the Nizams’ palace',
    items: [
      ['plc_hyd_stay', '11:00'],
      ['plc_hyd_meal_biryani', '13:00'],
      ['plc_hyd_chowmahalla', '15:30'],
      ['plc_hyd_hussain_sagar', '18:00'],
      ['plc_hyd_meal_dinner', '19:45'],
    ],
  },
  {
    title: 'Tombs, treasures & temple views',
    items: [
      ['plc_hyd_qutb_shahi', '09:30'],
      ['plc_hyd_meal_biryani', '12:30'],
      ['plc_hyd_salar_jung', '14:00'],
      ['plc_hyd_birla_mandir', '16:00'],
      ['plc_hyd_necklace_road', '17:45'],
      ['plc_hyd_meal_dinner', '19:45'],
    ],
  },
  {
    title: 'Temples & the old city',
    items: [
      ['plc_hyd_chilkur', '09:30'],
      ['plc_hyd_meal_biryani', '13:00'],
      ['plc_hyd_charminar', '15:00'],
      ['plc_hyd_mecca_masjid', '16:15'],
      ['plc_hyd_meal_irani_chai', '17:00'],
      ['plc_hyd_meal_dinner', '19:45'],
    ],
  },
  {
    title: 'A museum morning & departure',
    items: [
      ['plc_hyd_nizams_museum', '10:00'],
      ['plc_hyd_meal_biryani', '12:30'],
      ['departure', '14:30'],
    ],
  },
];

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const toTime = (minutes: number) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes / 5) * 5));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

export function travelLeg(from: PlaceRecord | null, to: PlaceRecord | null): TravelLegDto | null {
  if (!from || !to) return null;
  const km = haversineKm(from.coordinates, to.coordinates) * 1.35;
  if (km < 0.05) return null;
  if (km < 0.7) return { mode: 'walk', duration_minutes: Math.max(5, Math.round((km * 1000) / 70 / 5) * 5), distance_meters: Math.round(km * 1000), route_id: null };
  return { mode: 'taxi', duration_minutes: Math.max(10, Math.round(((km / 22) * 60 + 6) / 5) * 5), distance_meters: Math.round(km * 1000), route_id: null };
}

function travellerCount(trip: TripDto) {
  const t = trip.intent.travellers;
  return t ? Math.max(1, t.adults + t.children + t.seniors) : 1;
}

function reasonsFor(place: PlaceRecord, trip: TripDto, previous: PlaceRecord | null, start: number): ReasonDto[] {
  const reasons: ReasonDto[] = [];
  if (place.kind === 'meal') {
    reasons.push({ code: 'meal_break', label: 'Keeps a comfortable meal break' });
    if (trip.intent.interests?.includes('food')) reasons.push({ code: 'matches_food', label: 'Matches your food interests' });
    return reasons;
  }
  for (const interest of trip.intent.interests ?? []) {
    const mapping = INTEREST_TAGS[interest];
    if (mapping && mapping.tags.some((tag) => place.tags.includes(tag))) {
      reasons.push({ code: `matches_${interest}`, label: `Matches your ${mapping.label} interests` });
      break;
    }
  }
  if (trip.intent.accessibility?.low_walking && place.walking === 'low') {
    reasons.push({ code: 'less_walking', label: 'Better for low walking' });
  }
  if (previous && haversineKm(previous.coordinates, place.coordinates) < 3) {
    reasons.push({ code: 'close_to_previous', label: 'Close to your previous stop' });
  }
  if (place.unesco) reasons.push({ code: 'unesco', label: 'UNESCO World Heritage Site' });
  if (place.best_slot === 'evening' && start >= 17 * 60) reasons.push({ code: 'evening_visit', label: 'Suited to an evening visit' });
  return reasons.slice(0, 3);
}

function costFor(place: PlaceRecord, trip: TripDto): CostDto {
  if (place.kind === 'meal') {
    const people = travellerCount(trip);
    const [min, max] = place.category === 'Café' ? [80, 180] : [300, 700];
    return {
      status: 'estimate',
      value: null,
      min: { amount_minor: min * people * 100, currency: 'INR' },
      max: { amount_minor: max * people * 100, currency: 'INR' },
      source_label: 'Typical local price range (estimate)',
      updated_at: null,
    };
  }
  return { status: 'unavailable', value: null };
}

export function makeItem(place: PlaceRecord, start: number, trip: TripDto, previous: PlaceRecord | null): ItineraryItemDto {
  const kind: ItineraryItemDto['kind'] = place.kind === 'meal' ? 'meal' : place.kind === 'stay' ? 'stay' : place.kind === 'experience' ? 'experience' : 'attraction';
  return {
    item_id: newId('itm'),
    kind,
    title: place.name,
    description: place.description,
    place: toPlaceRef(place),
    category: place.category,
    start_time: toTime(start),
    end_time: toTime(start + place.duration_minutes),
    duration_minutes: place.duration_minutes,
    travel_from_previous: travelLeg(previous, place),
    reasons: reasonsFor(place, trip, previous, start),
    status: 'planned',
    cost: costFor(place, trip),
    safety_note: place.safety_note ?? null,
    accessibility: { step_free: place.step_free, walking_level: place.walking, seating_available: null, notes: null },
    booking: place.kind === 'stay' ? recommendedBooking(offerSetFor(place.destination_slug)?.room) : null,
  };
}

function departureItem(start: number, slug: string): ItineraryItemDto {
  return {
    item_id: newId('itm'),
    kind: 'transfer',
    title: 'Departure transfer',
    description: 'Leave time for traffic on the way to the airport or station.',
    place: null,
    category: 'Transfer',
    start_time: toTime(start),
    end_time: toTime(start + 60),
    duration_minutes: 60,
    travel_from_previous: null,
    reasons: [],
    status: 'planned',
    cost: { status: 'unavailable', value: null },
    safety_note: null,
    accessibility: null,
    booking: recommendedBooking(offerSetFor(slug)?.transfer),
  };
}

function freeTimeItem(start: number, title = 'Free time at your own pace'): ItineraryItemDto {
  return {
    item_id: newId('itm'),
    kind: 'free_time',
    title,
    description: 'Unscheduled time to rest or explore nearby.',
    place: null,
    category: 'Free time',
    start_time: toTime(start),
    end_time: toTime(start + 90),
    duration_minutes: 90,
    travel_from_previous: null,
    reasons: [{ code: 'rest', label: 'Leaves room to rest' }],
    status: 'planned',
    cost: { status: 'unavailable', value: null },
    safety_note: null,
    accessibility: null,
    booking: null,
  };
}

function score(place: PlaceRecord, trip: TripDto) {
  let value = 0;
  for (const interest of trip.intent.interests ?? []) {
    const mapping = INTEREST_TAGS[interest];
    if (mapping?.tags.some((tag) => place.tags.includes(tag))) value += 3;
  }
  if (trip.intent.accessibility?.low_walking) value -= place.walking === 'high' ? 6 : place.walking === 'moderate' ? 1 : -1;
  if (trip.intent.avoid?.includes('crowds') && place.tags.includes('crowded')) value -= 4;
  if (place.unesco) value += 1;
  return value;
}

function dateFor(trip: TripDto, dayIndex: number) {
  if (!trip.start_date) return null;
  const d = new Date(`${trip.start_date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayIndex);
  return d.toISOString().slice(0, 10);
}

function buildHyderabad(trip: TripDto, dayCount: number): ItineraryDayDto[] {
  const places = placesForDestination('hyderabad');
  const lowWalking = trip.intent.accessibility?.low_walking ?? false;
  return HYDERABAD_TEMPLATE.slice(0, dayCount).map((template, dayIndex) => {
    const items: ItineraryItemDto[] = [];
    let previous: PlaceRecord | null = null;
    for (const [placeId, start] of template.items) {
      if (placeId === 'departure') {
        if (dayIndex === dayCount - 1) items.push(departureItem(toMinutes(start), 'hyderabad'));
        continue;
      }
      const place = places.find((p) => p.place_id === placeId);
      if (!place || (lowWalking && place.walking === 'high')) continue;
      items.push(makeItem(place, toMinutes(start), trip, previous));
      previous = place;
    }
    return { day_number: dayIndex + 1, date: dateFor(trip, dayIndex), title: template.title, summary: null, items };
  });
}

function buildGeneric(trip: TripDto, slug: string, dayCount: number): ItineraryDayDto[] {
  const places = placesForDestination(slug);
  const attractions = places
    .filter((p) => p.kind === 'attraction' || p.kind === 'experience')
    .filter((p) => !(trip.intent.accessibility?.low_walking && p.walking === 'high'))
    .sort((a, b) => score(b, trip) - score(a, trip));
  const lunch = places.find((p) => p.place_id.endsWith('_lunch'));
  const dinner = places.find((p) => p.place_id.endsWith('_dinner'));
  const stay = places.find((p) => p.kind === 'stay');
  const perDay = trip.intent.pace === 'active' ? 3 : trip.intent.pace === 'relaxed' ? 1 : 2;
  const queue = [...attractions];
  const days: ItineraryDayDto[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const items: ItineraryItemDto[] = [];
    let previous: PlaceRecord | null = null;
    let cursor = dayIndex === 0 ? 11 * 60 : 9 * 60 + 30;
    const push = (place: PlaceRecord, start: number) => {
      const leg = travelLeg(previous, place);
      const at = Math.max(start, cursor + (leg?.duration_minutes ?? 0));
      items.push(makeItem(place, at, trip, previous));
      cursor = at + place.duration_minutes;
      previous = place;
    };
    const last = dayIndex === dayCount - 1 && dayCount > 1;

    if (dayIndex === 0 && stay) push(stay, 11 * 60);
    const morning = dayIndex === 0 ? 0 : 1;
    for (let i = 0; i < morning && queue.length; i++) push(queue.shift()!, 9 * 60 + 30);
    if (lunch) push(lunch, 13 * 60);
    if (last) {
      items.push(departureItem(Math.max(cursor + 30, 14 * 60 + 30), slug));
    } else {
      const afternoon = Math.max(1, perDay - morning);
      let added = 0;
      for (let i = 0; i < afternoon && queue.length; i++) {
        push(queue.shift()!, 15 * 60);
        added++;
      }
      if (added === 0) items.push(freeTimeItem(Math.max(cursor + 30, 15 * 60)));
      if (dinner) push(dinner, 19 * 60 + 45);
    }
    days.push({
      day_number: dayIndex + 1,
      date: dateFor(trip, dayIndex),
      title: dayIndex === 0 ? 'Arrival' : last ? 'Final morning & departure' : `Day ${dayIndex + 1}`,
      summary: null,
      items,
    });
  }
  return days;
}

const sum = (values: Array<MoneyDto | null | undefined>): MoneyDto => ({
  amount_minor: values.reduce((total, v) => total + (v?.amount_minor ?? 0), 0),
  currency: 'INR',
});

export function summariseBudget(days: ItineraryDayDto[], trip: TripDto): BudgetSummaryDto {
  const items = days.flatMap((d) => d.items);
  const authoritative = items.filter((i) => i.cost.status === 'authoritative');
  const estimates = items.filter((i) => i.cost.status === 'estimate');
  const known = sum(authoritative.map((i) => i.cost.value));
  const ceiling = trip.intent.budget?.per === 'trip' ? (trip.intent.budget.ceiling ?? null) : null;
  return {
    ceiling,
    known_total: known,
    estimated_min: estimates.length ? sum(estimates.map((i) => i.cost.min ?? i.cost.value)) : null,
    estimated_max: estimates.length ? sum(estimates.map((i) => i.cost.max ?? i.cost.value)) : null,
    unknown_items_count: items.filter((i) => i.cost.status === 'unavailable' && i.kind !== 'free_time').length,
    remaining: ceiling ? { amount_minor: ceiling.amount_minor - known.amount_minor, currency: 'INR' } : null,
  };
}

export function validate(days: ItineraryDayDto[], trip: TripDto): ItineraryDto['validation'] {
  const warnings: string[] = [];
  const places = trip.destination ? placesForDestination(trip.destination.slug) : [];
  if (!trip.start_date) warnings.push('Dates aren’t set yet, so opening days haven’t been checked.');
  if (trip.intent.accessibility?.low_walking) {
    const moderate = days.flatMap((d) => d.items).filter((i) => i.accessibility?.walking_level === 'moderate');
    if (moderate.length) warnings.push('Some stops involve moderate walking. Ask for a lighter day if needed.');
  }
  for (const day of days) {
    if (!day.date) continue;
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    for (const item of day.items) {
      const place = places.find((p) => p.place_id === item.place?.place_id);
      if (place?.closed_days?.includes(weekday)) {
        warnings.push(`${place.name} is usually closed on this weekday (Day ${day.day_number}) — check before you go.`);
      }
    }
  }
  return { status: warnings.length ? 'warnings' : 'valid', warnings };
}

export function buildItinerary(trip: TripDto, version = 1): ItineraryDto {
  const slug = trip.destination?.slug ?? 'hyderabad';
  const dayCount = Math.max(1, Math.min(10, trip.intent.days ?? (trip.intent.nights ? trip.intent.nights + 1 : 3)));
  const days = slug === 'hyderabad' ? buildHyderabad(trip, Math.min(dayCount, 4)) : buildGeneric(trip, slug, dayCount);
  const interests = trip.intent.interests?.length ? trip.intent.interests.join(', ') : 'your preferences';
  return {
    trip_id: trip.trip_id,
    version,
    created_at: new Date().toISOString(),
    created_by: 'generator',
    summary: `${days.length}-day ${trip.destination?.name ?? 'journey'} plan built around ${interests}.`,
    days,
    budget: summariseBudget(days, trip),
    validation: validate(days, trip),
  };
}
