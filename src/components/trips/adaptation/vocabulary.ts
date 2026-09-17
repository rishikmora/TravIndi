import type { Tone } from '@/components/ui/StatusPill';
import { translatedLabels, withTranslations } from '@/i18n/vocabulary';
import type { AdaptationChange, AdaptationProposal, AdaptationStatus, Freshness } from '@/types/domain';
import type { AdaptationTrigger } from '@/types/api';

/** Every status keeps its own name in the UI — never collapsed into a generic "updated". */
export const ADAPTATION_STATUS = withTranslations<AdaptationStatus, { tone: Tone }>(
  {
    proposed: { tone: 'warning' },
    approved: { tone: 'info' },
    applied: { tone: 'success' },
    rejected: { tone: 'neutral' },
    expired: { tone: 'neutral' },
    failed: { tone: 'danger' },
    stale: { tone: 'neutral' },
  },
  (status) => ({ label: `adaptation.status.${status}.label`, description: `adaptation.status.${status}.description` }),
);

export const CHANGE_TYPE = withTranslations<AdaptationChange['changeType'], { tone: Tone }>(
  {
    unchanged: { tone: 'neutral' },
    moved: { tone: 'info' },
    removed: { tone: 'danger' },
    added: { tone: 'success' },
  },
  (type) => ({ label: `adaptation.changeType.${type}` }),
);

export const TRIGGER_LABEL: Record<AdaptationTrigger, string> = translatedLabels(
  ['crowd', 'weather', 'closure', 'transport', 'safety', 'schedule', 'user_request', 'other'] as const,
  (trigger) => `adaptation.trigger.${trigger}`,
);

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
