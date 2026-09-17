import { getTranslator, translate } from '@/i18n/runtime';
import { translatedLabels } from '@/i18n/vocabulary';
import { formatDateRange } from '@/lib/format/dates';
import { formatMoney } from '@/lib/format/money';
import type { TransportMode, TripType } from '@/types/api';
import type { Ambiguity, IntentExtraction, Travellers, TripIntent, TripIntentField } from '@/types/domain';

/*
 * Pure helpers for the trip intent. The backend's extraction is a proposal:
 * everything it produced is shown back to the traveller, editable and removable.
 */

export const INTEREST_OPTIONS = ['heritage', 'temples', 'food', 'nature', 'museums', 'shopping', 'art & crafts', 'photography', 'spiritual', 'wildlife', 'beaches', 'trekking', 'culture'] as const;

/** Interest and avoid values stay in English on the wire; only their labels are translated. */
const valueKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const interestLabel = (interest: string) =>
  getTranslator().dynamic(`planner.interests.${valueKey(interest)}`, undefined, { fallback: interest[0]!.toUpperCase() + interest.slice(1) });

export const avoidLabel = (value: string) => getTranslator().dynamic(`planner.avoid.${valueKey(value)}`, undefined, { fallback: value });

export const AVOID_OPTIONS = [
  {
    value: 'crowds',
    get label() {
      return translate('planner.avoid.crowds');
    },
  },
  {
    value: 'long drives',
    get label() {
      return translate('planner.avoid.long_drives');
    },
  },
  {
    value: 'late-night travel',
    get label() {
      return translate('planner.avoid.late_night_travel');
    },
  },
] as const;

export const PACE_LABEL = translatedLabels(['relaxed', 'balanced', 'active'] as const, (pace) => `planner.pace.${pace}`);
export const SAFETY_LABEL = translatedLabels(['standard', 'high', 'maximum'] as const, (level) => `planner.safety.${level}`);

export const TRIP_TYPE_LABEL: Record<TripType, string> = translatedLabels(
  ['leisure', 'family', 'heritage', 'pilgrimage', 'adventure', 'honeymoon', 'solo', 'friends', 'business'] as const,
  (type) => `planner.tripType.${type}`,
);

export const DIET_LABEL = translatedLabels(
  ['vegetarian', 'vegan', 'jain', 'non_vegetarian', 'eggetarian', 'halal', 'no_preference'] as const,
  (diet) => `planner.diet.${diet}`,
);

export const TRANSPORT_LABEL: Record<TransportMode, string> = translatedLabels(
  ['walk', 'car', 'taxi', 'auto_rickshaw', 'metro', 'bus', 'train', 'flight', 'boat'] as const,
  (mode) => `planner.transport.${mode}`,
);

export const ACCOMMODATION_LABEL = translatedLabels(
  ['budget', 'mid_range', 'premium', 'heritage', 'homestay'] as const,
  (kind) => `planner.accommodation.${kind}`,
);

/** Wire field names ("start_date") → intent keys ("startDate"). */
export const toIntentKey = (field: string) => field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as TripIntentField;

export function travellersLabel(t: Travellers | null | undefined) {
  if (!t) return null;
  const parts = [
    t.adults ? translate('planner.travellers.adults', { count: t.adults }) : null,
    t.seniors ? translate('planner.travellers.seniors', { count: t.seniors }) : null,
    t.children ? translate('planner.travellers.children', { count: t.children }) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function durationLabel(intent: TripIntent) {
  const range = formatDateRange(intent.startDate, intent.endDate);
  const days = intent.days
    ? translate('planner.duration.days', { count: intent.days })
    : intent.nights
      ? translate('planner.duration.nights', { count: intent.nights })
      : null;
  if (range && days) return translate('planner.duration.withRange', { range, days });
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

  if (intent.destination) push({ id: 'destination', field: 'destination', kind: translate('planner.chips.destination'), label: intent.destination, remove: (i) => ({ ...i, destination: null, destinationId: null }) });
  const duration = durationLabel(intent);
  if (duration) push({ id: 'duration', field: 'days', kind: translate('planner.chips.when'), label: duration, remove: (i) => ({ ...i, days: null, nights: null, startDate: null, endDate: null }) });
  const travellers = travellersLabel(intent.travellers);
  if (travellers) push({ id: 'travellers', field: 'travellers', kind: translate('planner.chips.who'), label: travellers, remove: without('travellers') });
  if (intent.tripType) push({ id: 'tripType', field: 'tripType', kind: translate('planner.chips.tripType'), label: TRIP_TYPE_LABEL[intent.tripType], remove: without('tripType') });
  if (intent.pace) push({ id: 'pace', field: 'pace', kind: translate('planner.chips.pace'), label: PACE_LABEL[intent.pace], remove: without('pace') });
  for (const interest of intent.interests ?? []) {
    push({ id: `interest-${interest}`, field: 'interests', kind: translate('planner.chips.interest'), label: interestLabel(interest), remove: withoutItem('interests', interest) });
  }
  const access = intent.accessibility;
  if (access?.lowWalking) push({ id: 'lowWalking', field: 'accessibility', kind: translate('planner.chips.access'), label: translate('planner.chips.lessWalking'), remove: (i) => ({ ...i, accessibility: { ...i.accessibility!, lowWalking: false } }) });
  if (access?.wheelchair) push({ id: 'wheelchair', field: 'accessibility', kind: translate('planner.chips.access'), label: translate('planner.chips.wheelchair'), remove: (i) => ({ ...i, accessibility: { ...i.accessibility!, wheelchair: false } }) });
  if (access?.stepFreeAccess) push({ id: 'stepFree', field: 'accessibility', kind: translate('planner.chips.access'), label: translate('planner.chips.stepFree'), remove: (i) => ({ ...i, accessibility: { ...i.accessibility!, stepFreeAccess: false } }) });
  for (const avoid of intent.avoid ?? []) {
    push({ id: `avoid-${avoid}`, field: 'avoid', kind: translate('planner.chips.avoid'), label: translate('planner.avoid.chip', { value: avoidLabel(avoid) }), remove: withoutItem('avoid', avoid) });
  }
  if (intent.budget) {
    const amount = formatMoney(intent.budget.ceiling);
    const label = amount
      ? translate('planner.chips.upTo', { amount, per: translate(`planner.chips.per.${intent.budget.per}`) })
      : intent.budget.level
        ? translate(`planner.chips.budgetLevel.${intent.budget.level}`)
        : null;
    if (label) push({ id: 'budget', field: 'budget', kind: translate('planner.chips.budget'), label, remove: without('budget') });
  }
  if (intent.safetyPreference && intent.safetyPreference !== 'standard') {
    push({ id: 'safety', field: 'safetyPreference', kind: translate('planner.chips.safety'), label: SAFETY_LABEL[intent.safetyPreference], remove: without('safetyPreference') });
  }
  if (intent.food?.diet && intent.food.diet !== 'no_preference') push({ id: 'diet', field: 'food', kind: translate('planner.chips.food'), label: DIET_LABEL[intent.food.diet], remove: without('food') });
  for (const mode of intent.transport ?? []) {
    push({ id: `transport-${mode}`, field: 'transport', kind: translate('planner.chips.gettingAround'), label: TRANSPORT_LABEL[mode], remove: withoutItem('transport', mode) });
  }
  if (intent.accommodation) push({ id: 'accommodation', field: 'accommodation', kind: translate('planner.chips.stay'), label: ACCOMMODATION_LABEL[intent.accommodation], remove: without('accommodation') });
  if (intent.bookingPreferences?.verifiedProvidersOnly) {
    push({ id: 'verified', field: 'bookingPreferences', kind: translate('planner.chips.bookings'), label: translate('planner.chips.verifiedOnly'), remove: without('bookingPreferences') });
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
