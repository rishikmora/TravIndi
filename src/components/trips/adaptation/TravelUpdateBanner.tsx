'use client';

import { Button } from '@/components/ui/Button';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { ArrowRightIcon } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import type { AdaptationProposal } from '@/types/domain';
import { cn } from '@/utils/cn';
import { eventFreshness, headlineSwap, TRIGGER_LABEL } from './vocabulary';

interface TravelUpdateBannerProps {
  proposal: AdaptationProposal;
  onReview: () => void;
  onKeepCurrent: () => void;
  keeping?: boolean;
  canReview: boolean;
  className?: string;
}

/** The moment a live change reaches the traveller: what happened, what we suggest, and a clear choice. */
export function TravelUpdateBanner({ proposal, onReview, onKeepCurrent, keeping, canReview, className }: TravelUpdateBannerProps) {
  const now = useNow();
  const { current, recommended } = headlineSwap(proposal);
  const minutesLeft = proposal.expiresAt && now ? Math.max(0, Math.round((Date.parse(proposal.expiresAt) - now) / 60_000)) : null;

  return (
    <section
      aria-labelledby={`update-${proposal.proposalId}`}
      className={cn('theme-app-dark relative overflow-hidden rounded-3xl p-5 md:p-6', className)}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[var(--color-gold)]" />
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="warning" dot>
            Travel update
          </StatusPill>
          <StatusPill>{TRIGGER_LABEL[proposal.triggerType]}</StatusPill>
          {proposal.event && <FreshnessBadge freshness={eventFreshness(proposal)} />}
        </div>

        <div className="grid gap-1.5">
          <h2 id={`update-${proposal.proposalId}`} className="text-[1.375rem] font-semibold leading-snug tracking-[-0.02em]">
            {proposal.event?.summary ?? proposal.summary}
          </h2>
          {current && recommended && (
            <p className="flex flex-wrap items-center gap-x-2 text-[var(--text-muted)]">
              <span>
                <span className="label mr-1.5 text-[var(--text-subtle)]">Current</span>
                {current.title}
              </span>
              <ArrowRightIcon size={16} aria-hidden="true" />
              <span>
                <span className="label mr-1.5 text-[var(--text-subtle)]">Recommended</span>
                <span className="font-semibold text-[var(--text)]">{recommended.title}</span>
              </span>
            </p>
          )}
        </div>

        {canReview ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" onClick={onReview}>
              Review change
            </Button>
            <Button variant="glass" onClick={onKeepCurrent} loading={keeping}>
              Keep current plan
            </Button>
            {minutesLeft !== null && (
              <span className="text-[0.875rem] text-[var(--text-muted)]">
                {minutesLeft > 0 ? `Valid for about ${minutesLeft} more min` : 'About to expire'}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[0.9375rem] text-[var(--text-muted)]">The trip owner or an editor can review this change.</p>
        )}
      </div>
    </section>
  );
}
