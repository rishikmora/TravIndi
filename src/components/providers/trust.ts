import type { Tone } from '@/components/ui/StatusPill';
import type { EvidenceKind } from '@/types/api';
import type { Reputation, VerificationEvidence } from '@/types/domain';

/** Trust is shown as evidence the backend holds — never as a score we invent. */
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  identity: 'Identity',
  business_registration: 'Business registration',
  credential: 'Guide licence',
  review_authenticity: 'Review authenticity',
  availability: 'Availability',
};

export const EVIDENCE_STATUS: Record<VerificationEvidence['status'], { label: string; tone: Tone }> = {
  verified: { label: 'Verified', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  expired: { label: 'Expired', tone: 'danger' },
  unverified: { label: 'Not verified', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function verificationSummary(evidence: VerificationEvidence[]): { label: string; tone: Tone } {
  const verified = evidence.filter((e) => e.status === 'verified' && e.kind !== 'review_authenticity');
  if (verified.some((e) => e.kind === 'credential' || e.kind === 'business_registration')) return { label: 'Verified', tone: 'success' };
  if (verified.some((e) => e.kind === 'identity')) return { label: 'Identity verified', tone: 'info' };
  if (evidence.some((e) => e.status === 'pending')) return { label: 'Verification pending', tone: 'warning' };
  return { label: 'Not verified', tone: 'neutral' };
}

export function reputationLabel(reputation: Reputation): string {
  if (reputation.reviewSignal === 'under_review') return 'Reviews are being checked';
  if (reputation.rating === null || reputation.reviewSignal === 'insufficient') {
    return reputation.reviewCount > 0 ? `Not enough reviews to rate yet (${reputation.reviewCount})` : 'No reviews yet';
  }
  const base = `${reputation.rating.toFixed(1)} from ${reputation.reviewCount} review${reputation.reviewCount === 1 ? '' : 's'}`;
  return reputation.reviewSignal === 'limited' ? `${base} · limited data` : base;
}
