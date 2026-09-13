'use client';

import { useNow } from '@/hooks/useNow';
import { describeFreshness, type FreshnessTone } from '@/lib/format/freshness';
import type { Freshness } from '@/types/domain';
import { cn } from '@/utils/cn';
import { StatusPill, type Tone } from './StatusPill';

const TONE: Record<FreshnessTone, Tone> = {
  live: 'live',
  application: 'info',
  estimate: 'warning',
  snapshot: 'neutral',
  unavailable: 'neutral',
  stale: 'warning',
};

/** "LIVE · Updated just now · Visitor reports" — where a value came from and how current it is. */
export function FreshnessBadge({ freshness, className, hideDetail }: { freshness: Freshness | null | undefined; className?: string; hideDetail?: boolean }) {
  const now = useNow();
  const described = describeFreshness(freshness, now || undefined);
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <StatusPill tone={TONE[described.tone]}>{described.label}</StatusPill>
      {!hideDetail && described.detail && now > 0 && (
        <span className="text-[0.8125rem] text-[var(--text-muted)]">{described.detail}</span>
      )}
    </span>
  );
}
