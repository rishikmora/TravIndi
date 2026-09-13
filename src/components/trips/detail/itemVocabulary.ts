import type { Tone } from '@/components/ui/StatusPill';
import { formatDistance, formatDuration } from '@/lib/format/dates';
import type { ItineraryItem } from '@/types/domain';
import { TRANSPORT_LABEL } from '../plan/intent';

export const ITEM_STATUS: Record<ItineraryItem['status'], { label: string; tone: Tone } | null> = {
  planned: null,
  in_progress: { label: 'Now', tone: 'live' },
  done: { label: 'Done', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  changed: { label: 'Changed', tone: 'info' },
  at_risk: { label: 'At risk', tone: 'warning' },
};

export const WALKING_LABEL = { low: 'Little walking', moderate: 'Some walking', high: 'A lot of walking' } as const;

export function stepFreeLabel(stepFree: boolean | null | undefined) {
  if (stepFree === true) return 'Step-free';
  if (stepFree === false) return 'Has steps';
  return 'Step-free access not confirmed';
}

export function travelLegLabel(leg: ItineraryItem['travelFromPrevious']) {
  if (!leg) return null;
  return [formatDuration(leg.durationMinutes), `by ${TRANSPORT_LABEL[leg.mode].toLowerCase()}`, formatDistance(leg.distanceMeters)].filter(Boolean).join(' · ');
}
