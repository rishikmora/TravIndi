'use client';

import { Dialog } from '@/components/ui/Dialog';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from '@/i18n/react';
import { relativeTime } from '@/lib/format/freshness';
import { useAdaptations, useItineraryVersions } from '@/lib/query/hooks/trips';
import { ADAPTATION_STATUS, TRIGGER_LABEL } from './vocabulary';

export function VersionHistory({ tripId, open, currentVersion, onClose }: { tripId: string; open: boolean; currentVersion: number | null; onClose: () => void }) {
  const now = useNow();
  const { t } = useTranslation();
  const versions = useItineraryVersions(tripId, open);
  const proposals = useAdaptations(tripId, open);

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title={t('adaptation.history.title')} description={t('adaptation.history.description')}>
      <div className="grid gap-8 pb-2">
        <section aria-labelledby="versions-title" className="grid gap-3">
          <h3 id="versions-title" className="label text-[var(--text-subtle)]">
            {t('adaptation.history.versions')}
          </h3>
          {versions.isPending ? (
            <LoadingBlock label={t('adaptation.history.loadingVersions')} />
          ) : versions.isError ? (
            <ErrorState error={versions.error} compact onRetry={() => void versions.refetch()} />
          ) : (
            <ol className="grid gap-2">
              {versions.data.map((version) => (
                <li key={version.version} className="grid gap-1 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t('itinerary.view.version', { version: version.version })}</span>
                    {version.version === currentVersion && <StatusPill tone="success">{t('adaptation.history.currentVersion')}</StatusPill>}
                    <StatusPill>{t(`adaptation.history.trigger.${version.trigger}`)}</StatusPill>
                    {now > 0 && <span className="text-[0.8125rem] text-[var(--text-subtle)]">{relativeTime(version.createdAt, now)}</span>}
                  </div>
                  <p className="font-medium">{version.title}</p>
                  <p className="text-[0.875rem] text-[var(--text-muted)]">
                    {version.reason}
                    {version.changeCount > 0 && ` · ${t('adaptation.history.changes', { count: version.changeCount })}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="suggestions-title" className="grid gap-3">
          <h3 id="suggestions-title" className="label text-[var(--text-subtle)]">
            {t('adaptation.history.suggestions')}
          </h3>
          {proposals.isPending ? (
            <LoadingBlock label={t('adaptation.history.loadingSuggestions')} />
          ) : proposals.isError ? (
            <ErrorState error={proposals.error} compact onRetry={() => void proposals.refetch()} />
          ) : proposals.data.length === 0 ? (
            <p className="text-[var(--text-muted)]">{t('adaptation.history.none')}</p>
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
                      {proposal.resultingVersion ? ` ${t('adaptation.history.createdVersion', { version: proposal.resultingVersion })}` : ''}
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
