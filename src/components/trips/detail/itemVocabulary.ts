import type { Tone } from '@/components/ui/StatusPill';
import { translate } from '@/i18n/runtime';
import { translatedLabels } from '@/i18n/vocabulary';
import { formatDistance, formatDuration } from '@/lib/format/dates';
import type { ItineraryItem } from '@/types/domain';

const status = (key: Exclude<ItineraryItem['status'], 'planned'>, tone: Tone) => ({
  get label() {
    return translate(`itinerary.itemStatus.${key}`);
  },
  tone,
});

export const ITEM_STATUS: Record<ItineraryItem['status'], { label: string; tone: Tone } | null> = {
  planned: null,
  in_progress: status('in_progress', 'live'),
  done: status('done', 'neutral'),
  skipped: status('skipped', 'neutral'),
  changed: status('changed', 'info'),
  at_risk: status('at_risk', 'warning'),
};

export const WALKING_LABEL = translatedLabels(['low', 'moderate', 'high'] as const, (level) => `itinerary.walking.${level}`);

export const walkingLabel = (level: keyof typeof WALKING_LABEL) => WALKING_LABEL[level];

export function stepFreeLabel(stepFree: boolean | null | undefined) {
  if (stepFree === true) return translate('itinerary.stepFree.yes');
  if (stepFree === false) return translate('itinerary.stepFree.no');
  return translate('itinerary.stepFree.unknown');
}

export function travelLegLabel(leg: ItineraryItem['travelFromPrevious']) {
  if (!leg) return null;
  return [
    formatDuration(leg.durationMinutes),
    translate(`itinerary.travelBy.${leg.mode}`),
    formatDistance(leg.distanceMeters),
  ]
    .filter(Boolean)
    .join(' · ');
}
