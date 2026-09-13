'use client';

import { Dialog } from '@/components/ui/Dialog';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format/freshness';
import { useAdaptations, useItineraryVersions } from '@/lib/query/hooks/trips';
import type { ItineraryVersion } from '@/types/domain';
import { ADAPTATION_STATUS, TRIGGER_LABEL } from './vocabulary';

const VERSION_TRIGGER: Record<ItineraryVersion['trigger'], string> = {
  generated: 'Generated',
  adaptation: 'Travel update',
  user_edit: 'Edited',
  replan: 'Your request',
};

export function VersionHistory({ tripId, open, currentVersion, onClose }: { tripId: string; open: boolean; currentVersion: number | null; onClose: () => void }) {
  const now = useNow();
  const versions = useItineraryVersions(tripId, open);
  const proposals = useAdaptations(tripId, open);

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title="Trip history" description="Every version of your itinerary, and every change that was suggested.">
      <div className="grid gap-8 pb-2">
        <section aria-labelledby="versions-title" className="grid gap-3">
          <h3 id="versions-title" className="label text-[var(--text-subtle)]">
            Versions
          </h3>
          {versions.isPending ? (
            <LoadingBlock label="Loading versions" />
          ) : versions.isError ? (
            <ErrorState error={versions.error} compact onRetry={() => void versions.refetch()} />
          ) : (
            <ol className="grid gap-2">
              {versions.data.map((version) => (
                <li key={version.version} className="grid gap-1 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">Version {version.version}</span>
                    {version.version === currentVersion && <StatusPill tone="success">Current</StatusPill>}
                    <StatusPill>{VERSION_TRIGGER[version.trigger]}</StatusPill>
                    {now > 0 && <span className="text-[0.8125rem] text-[var(--text-subtle)]">{relativeTime(version.createdAt, now)}</span>}
                  </div>
                  <p className="font-medium">{version.title}</p>
                  <p className="text-[0.875rem] text-[var(--text-muted)]">
                    {version.reason}
                    {version.changeCount > 0 && ` · ${version.changeCount} change${version.changeCount === 1 ? '' : 's'}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="suggestions-title" className="grid gap-3">
          <h3 id="suggestions-title" className="label text-[var(--text-subtle)]">
            Suggestions
          </h3>
          {proposals.isPending ? (
            <LoadingBlock label="Loading suggestions" />
          ) : proposals.isError ? (
            <ErrorState error={proposals.error} compact onRetry={() => void proposals.refetch()} />
          ) : proposals.data.length === 0 ? (
            <p className="text-[var(--text-muted)]">No changes have been suggested for this trip.</p>
          ) : (
            <ol className="grid gap-2">
              {proposals.data.map((proposal) => {
                const status = ADAPTATION_STATUS[proposal.status];
                return (
                  <li key={proposal.proposalId} className="grid gap-1 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      <StatusPill>{TRIGGER_LABEL[proposal.triggerType]}</StatusPill>
                      {now > 0 && <span className="text-[0.8125rem] text-[var(--text-subtle)]">{relativeTime(proposal.createdAt, now)}</span>}
                    </div>
                    <p className="font-medium">{proposal.title ?? proposal.summary}</p>
                    <p className="text-[0.875rem] text-[var(--text-muted)]">
                      {status.description}
                      {proposal.resultingVersion ? ` Created version ${proposal.resultingVersion}.` : ''}
                      {proposal.failureReason ? ` ${proposal.failureReason}` : ''}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  );
}
