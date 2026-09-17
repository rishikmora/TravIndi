'use client';

import Link from 'next/link';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageShell } from '@/components/app/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { ChevronLeftIcon, LocateIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { locationFreshness, locationFreshnessLabel, relativeTime } from '@/lib/format/freshness';
import { useShare } from '@/lib/query/hooks/location';
import { useChannel } from '@/lib/realtime/provider';

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null);

function Viewer({ shareId }: { shareId: string }) {
  const now = useNow();
  const { user } = useAuth();
  const share = useShare(shareId);
  useChannel(`location_share:${shareId}`);

  if (share.isPending) {
    return (
      <LoadingBlock label="Loading shared location" className="grid gap-3">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full rounded-[1.25rem]" />
      </LoadingBlock>
    );
  }

  if (share.isError) {
    if (isApiError(share.error) && share.error.kind === 'not_found') {
      return (
        <EmptyState
          as="h1"
          icon={<LocateIcon />}
          title="This location isn’t shared with you"
          description="The share may have ended, or it was never shared with your account."
          action={
            <ButtonLink href="/location-sharing" variant="secondary">
              Location sharing
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorState error={share.error} onRetry={() => void share.refetch()} />;
  }

  const s = share.data;
  const own = s.ownerId === user?.userId;
  const ended = s.status !== 'active' && s.status !== 'paused';
  const freshness = now ? locationFreshness(s.lastLocationAt, now) : 'none';
  const location = ended ? null : s.lastLocation;
  const minutesLeft = s.expiresAt && now ? Math.max(0, Math.round((Date.parse(s.expiresAt) - now) / 60_000)) : null;

  return (
    <div className="grid gap-6">
      <Link href="/location-sharing" className="inline-flex w-fit items-center gap-1 text-[0.875rem] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ChevronLeftIcon size={16} />
        Location sharing
      </Link>
      <header className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          {ended ? (
            <StatusPill>Ended</StatusPill>
          ) : s.status === 'paused' ? (
            <StatusPill tone="warning">Paused</StatusPill>
          ) : (
            <StatusPill tone={freshness === 'live' || freshness === 'recent' ? 'live' : 'warning'}>{locationFreshnessLabel(freshness)}</StatusPill>
          )}
          <StatusPill>{s.precisionMode === 'approximate' ? 'Approximate location' : 'Precise location'}</StatusPill>
        </div>
        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.03em]">{own ? 'Your shared location' : `${s.ownerName}’s location`}</h1>
        <p className="text-[var(--text-muted)]">
          Shared with {s.audienceLabel}
          {s.expiresAt && !ended ? ` · until ${clock(s.expiresAt)}${minutesLeft !== null ? ` (${minutesLeft} min left)` : ''}` : ''}
        </p>
      </header>

      {ended ? (
        <InlineNotice tone="neutral" title="No longer shared">
          This share has ended, so the location is no longer available.
        </InlineNotice>
      ) : !location ? (
        <InlineNotice tone="neutral" title="No location yet">
          {own ? 'Your device hasn’t sent a location for this share yet.' : `${s.ownerName} hasn’t sent a location yet.`}
        </InlineNotice>
      ) : (
        <section aria-labelledby="position-title" className="surface-card grid gap-4 p-5">
          <h2 id="position-title" className="sr-only">
            Last known position
          </h2>
          {(freshness === 'stale' || freshness === 'last_known') && (
            <InlineNotice tone="warning" title={freshness === 'stale' ? 'This location may be out of date' : 'Last known location'}>
              It was updated {relativeTime(s.lastLocationAt, now)}. {s.ownerName.split(' ')[0]} may have moved since.
            </InlineNotice>
          )}
          {s.status === 'paused' && <InlineNotice tone="warning">Sharing is paused. This is where they were when they paused it.</InlineNotice>}
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="label text-[var(--text-subtle)]">Updated</dt>
              <dd className="font-semibold">{now ? relativeTime(s.lastLocationAt, now) : clock(s.lastLocationAt)}</dd>
            </div>
            <div>
              <dt className="label text-[var(--text-subtle)]">Accuracy</dt>
              <dd className="font-semibold">{location.accuracy ? `Within about ${location.accuracy >= 1000 ? `${Math.round(location.accuracy / 100) / 10} km` : `${location.accuracy} m`}` : 'Unknown'}</dd>
            </div>
            <div>
              <dt className="label text-[var(--text-subtle)]">Coordinates</dt>
              <dd className="font-mono text-[0.9375rem]">
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </dd>
            </div>
          </dl>
          <ButtonLink href={`/map?lat=${location.latitude}&lng=${location.longitude}&label=${encodeURIComponent(s.ownerName)}`} variant="navy" className="justify-self-start">
            Show on map
          </ButtonLink>
        </section>
      )}
    </div>
  );
}

export function ShareViewer({ shareId }: { shareId: string | null }) {
  return (
    <PageShell width="narrow">
      <RequireAuth description="Shared locations are only visible to the people they were shared with.">
        {shareId ? <Viewer shareId={shareId} /> : <EmptyState as="h1" title="No share selected" description="Open a shared location from a message or your sharing page." />}
      </RequireAuth>
    </PageShell>
  );
}
