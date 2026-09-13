import type { Tone } from '@/components/ui/StatusPill';
import type { AdaptationChange, AdaptationProposal, AdaptationStatus, Freshness } from '@/types/domain';
import type { AdaptationTrigger } from '@/types/api';

/** Every status keeps its own name in the UI — never collapsed into a generic "updated". */
export const ADAPTATION_STATUS: Record<AdaptationStatus, { label: string; tone: Tone; description: string }> = {
  proposed: { label: 'Proposed', tone: 'warning', description: 'Waiting for your review.' },
  approved: { label: 'Approved', tone: 'info', description: 'Approved and being applied.' },
  applied: { label: 'Applied', tone: 'success', description: 'Your itinerary was updated.' },
  rejected: { label: 'Rejected', tone: 'neutral', description: 'You kept your current plan.' },
  expired: { label: 'Expired', tone: 'neutral', description: 'No longer valid. Nothing was changed.' },
  failed: { label: 'Failed', tone: 'danger', description: 'Couldn’t be applied. Nothing was changed.' },
  stale: { label: 'Stale', tone: 'neutral', description: 'Your itinerary changed after this was suggested.' },
};

export const CHANGE_TYPE: Record<AdaptationChange['changeType'], { label: string; tone: Tone }> = {
  unchanged: { label: 'Unchanged', tone: 'neutral' },
  moved: { label: 'Moved', tone: 'info' },
  removed: { label: 'Removed', tone: 'danger' },
  added: { label: 'Added', tone: 'success' },
};

export const TRIGGER_LABEL: Record<AdaptationTrigger, string> = {
  crowd: 'Crowds',
  weather: 'Weather',
  closure: 'Closure',
  transport: 'Transport',
  safety: 'Safety',
  schedule: 'Schedule',
  user_request: 'Your request',
  other: 'Update',
};

export function eventFreshness(proposal: AdaptationProposal): Freshness | null {
  if (!proposal.event) return null;
  return {
    sourceKind: proposal.event.sourceKind,
    updatedAt: proposal.event.observedAt,
    sourceLabel: proposal.event.sourceLabel,
    staleAfterSeconds: 3600,
  };
}

/** The headline swap, e.g. { current: "Birla Mandir", recommended: "Sri Jagannath Temple" }. */
export function headlineSwap(proposal: AdaptationProposal) {
  const removed = proposal.changes.find((c) => c.changeType === 'removed')?.before;
  const added = proposal.changes.find((c) => c.changeType === 'added')?.after;
  return { current: removed ?? null, recommended: added ?? null };
}
