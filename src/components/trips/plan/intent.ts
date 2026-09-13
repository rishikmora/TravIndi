import { formatDateRange } from '@/lib/format/dates';
import { formatMoney } from '@/lib/format/money';
import type { TransportMode, TripType } from '@/types/api';
import type { Ambiguity, IntentExtraction, Travellers, TripIntent, TripIntentField } from '@/types/domain';

/*
 * Pure helpers for the trip intent. The backend's extraction is a proposal:
 * everything it produced is shown back to the traveller, editable and removable.
 */

export const INTEREST_OPTIONS = ['heritage', 'temples', 'food', 'nature', 'museums', 'shopping', 'art & crafts', 'photography', 'spiritual', 'wildlife', 'beaches', 'trekking', 'culture'] as const;

export const AVOID_OPTIONS = [
  { value: 'crowds', label: 'Crowds' },
  { value: 'long drives', label: 'Long drives' },
  { value: 'late-night travel', label: 'Late-night travel' },
] as const;

export const PACE_LABEL = { relaxed: 'Relaxed pace', balanced: 'Balanced pace', active: 'Full days' } as const;
export const SAFETY_LABEL = { standard: 'Standard care', high: 'Extra safety care', maximum: 'Maximum safety care' } as const;

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  leisure: 'Leisure',
  family: 'Family trip',
  heritage: 'Heritage trip',
  pilgrimage: 'Pilgrimage',
  adventure: 'Adventure',
  honeymoon: 'Honeymoon',
  solo: 'Solo',
  friends: 'With friends',
  business: 'Business',
};

export const DIET_LABEL = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
  non_vegetarian: 'Non-vegetarian',
  eggetarian: 'Eggetarian',
  halal: 'Halal',
  no_preference: 'No food preference',
} as const;

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  walk: 'Walking',
  car: 'Own car',
  taxi: 'Taxi or cab',
  auto_rickshaw: 'Auto-rickshaw',
  metro: 'Metro',
  bus: 'Bus',
  train: 'Train',
  flight: 'Flight',
  boat: 'Boat',
};

export const ACCOMMODATION_LABEL = {
  budget: 'Budget stays',
  mid_range: 'Mid-range hotels',
  premium: 'Premium hotels',
  heritage: 'Heritage stays',
  homestay: 'Homestays',
} as const;

/** Wire field names ("start_date") → intent keys ("startDate"). */
export const toIntentKey = (field: string) => field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as TripIntentField;

export function travellersLabel(t: Travellers | null | undefined) {
  if (!t) return null;
  const parts = [
    t.adults ? `${t.adults} adult${t.adults === 1 ? '' : 's'}` : null,
    t.seniors ? `${t.seniors} senior${t.seniors === 1 ? '' : 's'}` : null,
    t.children ? `${t.children} child${t.children === 1 ? '' : 'ren'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function durationLabel(intent: TripIntent) {
  const range = formatDateRange(intent.startDate, intent.endDate);
  const days = intent.days ? `${intent.days} day${intent.days === 1 ? '' : 's'}` : intent.nights ? `${intent.nights} nights` : null;
  if (range && days) return `${range} (${days})`;
  return range ?? days;
}

export interface IntentChip {
  id: string;
  field: TripIntentField;
  /** Short category, read before the value by screen readers. */
  kind: string;
  label: string;
  fromProfile: boolean;
  remove: (intent: TripIntent) => TripIntent;
}

const without = <K extends keyof TripIntent>(key: K) => (intent: TripIntent): TripIntent => ({ ...intent, [key]: null });
const withoutItem = (key: 'interests' | 'avoid' | 'transport', value: string) => (intent: TripIntent): TripIntent => ({
  ...intent,
  [key]: ((intent[key] as string[] | undefined) ?? []).filter((v) => v !== value),
});

export function intentChips(intent: TripIntent, extraction?: IntentExtraction | null): IntentChip[] {
  const profileFields = new Set((extraction?.extractedFields ?? []).filter((f) => f.fromProfile).map((f) => toIntentKey(f.field)));
  const chips: IntentChip[] = [];
  const push = (chip: Omit<IntentChip, 'fromProfile'>) => chips.push({ ...chip, fromProfile: profileFields.has(chip.field) });

  if (intent.destination) push({ id: 'destination', field: 'destination', kind: 'Destination', label: intent.destination, remove: (i) => ({ ...i, destination: null, destinationId: null }) });
  const duration = durationLabel(intent);
  if (duration) push({ id: 'duration', field: 'days', kind: 'When', label: duration, remove: (i) => ({ ...i, days: null, nights: null, startDate: null, endDate: null }) });
  const travellers = travellersLabel(intent.travellers);
  if (travellers) push({ id: 'travellers', field: 'travellers', kind: 'Who', label: travellers, remove: without('travellers') });
  if (intent.tripType) push({ id: 'tripType', field: 'tripType', kind: 'Trip type', label: TRIP_TYPE_LABEL[intent.tripType], remove: without('tripType') });
  if (intent.pace) push({ id: 'pace', field: 'pace', kind: 'Pace', label: PACE_LABEL[intent.pace], remove: without('pace') });
  for (const interest of intent.interests ?? []) {
    push({ id: `interest-${interest}`, field: 'interests', kind: 'Interest', label: interest[0]!.toUpperCase() + interest.slice(1), remove: withoutItem('interests', interest) });
  }
  const access = intent.accessibility;
  if (access?.lowWalking) push({ id: 'lowWalking', field: 'accessibility', kind: 'Access', label: 'Less walking', remove: (i) => ({ ...i, accessibility: { ...i.accessibility!, lowWalking: false } }) });
  if (access?.wheelchair) push({ id: 'wheelchair', field: 'accessibility', kind: 'Access', label: 'Wheelchair access', remove: (i) => ({ ...i, accessibility: { ...i.accessibility!, wheelchair: false } }) });
  if (access?.stepFreeAccess) push({ id: 'stepFree', field: 'accessibility', kind: 'Access', label: 'Step-free access', remove: (i) => ({ ...i, accessibility: { ...i.accessibility!, stepFreeAccess: false } }) });
  for (const avoid of intent.avoid ?? []) {
    push({ id: `avoid-${avoid}`, field: 'avoid', kind: 'Avoid', label: `Avoid ${avoid}`, remove: withoutItem('avoid', avoid) });
  }
  if (intent.budget) {
    const amount = formatMoney(intent.budget.ceiling);
    const label = amount ? `Up to ${amount} per ${intent.budget.per}` : intent.budget.level ? `${intent.budget.level[0]!.toUpperCase()}${intent.budget.level.slice(1)} budget` : null;
    if (label) push({ id: 'budget', field: 'budget', kind: 'Budget', label, remove: without('budget') });
  }
  if (intent.safetyPreference && intent.safetyPreference !== 'standard') {
    push({ id: 'safety', field: 'safetyPreference', kind: 'Safety', label: SAFETY_LABEL[intent.safetyPreference], remove: without('safetyPreference') });
  }
  if (intent.food?.diet && intent.food.diet !== 'no_preference') push({ id: 'diet', field: 'food', kind: 'Food', label: DIET_LABEL[intent.food.diet], remove: without('food') });
  for (const mode of intent.transport ?? []) {
    push({ id: `transport-${mode}`, field: 'transport', kind: 'Getting around', label: TRANSPORT_LABEL[mode], remove: withoutItem('transport', mode) });
  }
  if (intent.accommodation) push({ id: 'accommodation', field: 'accommodation', kind: 'Stay', label: ACCOMMODATION_LABEL[intent.accommodation], remove: without('accommodation') });
  if (intent.bookingPreferences?.verifiedProvidersOnly) {
    push({ id: 'verified', field: 'bookingPreferences', kind: 'Bookings', label: 'Verified providers only', remove: without('bookingPreferences') });
  }
  return chips;
}

/** Applies the traveller's answer to a clarifying question. */
export function applyAmbiguity(intent: TripIntent, ambiguity: Ambiguity, value: unknown): TripIntent {
  const key = toIntentKey(ambiguity.field);
  if (value && typeof value === 'object' && !Array.isArray(value) && key !== 'travellers') {
    return { ...intent, ...(value as Partial<TripIntent>) };
  }
  return { ...intent, [key]: value };
}

export function readiness(intent: TripIntent) {
  const missing: Array<'destination' | 'duration'> = [];
  if (!intent.destination && !intent.destinationId) missing.push('destination');
  if (!intent.days && !(intent.startDate && intent.endDate)) missing.push('duration');
  return { ready: missing.length === 0, missing };
}

/** Drops empty values so the backend receives only what the traveller actually chose. */
export function compactIntent(intent: TripIntent): TripIntent {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(intent)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as TripIntent;
}
