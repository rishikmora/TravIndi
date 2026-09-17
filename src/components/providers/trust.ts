import type { Tone } from '@/components/ui/StatusPill';
import { translate } from '@/i18n/runtime';
import type { EvidenceKind } from '@/types/api';
import type { Reputation, VerificationEvidence } from '@/types/domain';

/** Trust is shown as evidence the backend holds — never as a score we invent. */
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  get identity() {
    return translate('providers.trust.evidence.identity');
  },
  get business_registration() {
    return translate('providers.trust.evidence.business_registration');
  },
  get credential() {
    return translate('providers.trust.evidence.credential');
  },
  get review_authenticity() {
    return translate('providers.trust.evidence.review_authenticity');
  },
  get availability() {
    return translate('providers.trust.evidence.availability');
  },
};

const status = (key: VerificationEvidence['status'], tone: Tone) => ({
  get label() {
    return translate(`providers.trust.evidenceStatus.${key}`);
  },
  tone,
});

export const EVIDENCE_STATUS: Record<VerificationEvidence['status'], { label: string; tone: Tone }> = {
  verified: status('verified', 'success'),
  pending: status('pending', 'warning'),
  expired: status('expired', 'danger'),
  unverified: status('unverified', 'neutral'),
  rejected: status('rejected', 'danger'),
};

export function verificationSummary(evidence: VerificationEvidence[]): { label: string; tone: Tone } {
  const verified = evidence.filter((e) => e.status === 'verified' && e.kind !== 'review_authenticity');
  if (verified.some((e) => e.kind === 'credential' || e.kind === 'business_registration')) return { label: translate('providers.trust.summary.verified'), tone: 'success' };
  if (verified.some((e) => e.kind === 'identity')) return { label: translate('providers.trust.summary.identity'), tone: 'info' };
  if (evidence.some((e) => e.status === 'pending')) return { label: translate('providers.trust.summary.pending'), tone: 'warning' };
  return { label: translate('providers.trust.summary.unverified'), tone: 'neutral' };
}

export function reputationLabel(reputation: Reputation): string {
  if (reputation.reviewSignal === 'under_review') return translate('providers.trust.reputation.underReview');
  if (reputation.rating === null || reputation.reviewSignal === 'insufficient') {
    return reputation.reviewCount > 0
      ? translate('providers.trust.reputation.notEnough', { count: reputation.reviewCount })
      : translate('providers.trust.reputation.none');
  }
  const base = translate('providers.trust.reputation.rating', { rating: reputation.rating.toFixed(1), count: reputation.reviewCount });
  return reputation.reviewSignal === 'limited' ? translate('providers.trust.reputation.limited', { base }) : base;
}
