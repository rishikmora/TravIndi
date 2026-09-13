'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageShell } from '@/components/app/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { isApiError } from '@/lib/api/errors';
import { formatDateRange } from '@/lib/format/dates';
import { useTrip } from '@/lib/query/hooks/trips';
import { useChannel } from '@/lib/realtime/provider';
import { cn } from '@/utils/cn';
import { TRIP_STATUS } from '../tripStatus';

function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const trip = useTrip(tripId);
  useChannel(`trip:${tripId}`);

  if (trip.isPending) {
    return (
      <LoadingBlock label="Loading trip" className="mb-8 grid gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-10 w-full" />
      </LoadingBlock>
    );
  }

  if (trip.isError) {
    if (isApiError(trip.error) && trip.error.kind === 'not_found') {
      return (
        <EmptyState
          as="h1"
          title="We couldn’t find this trip"
          description="It may have been deleted, or you may not be a member of it."
          action={
            <ButtonLink href="/trips" variant="secondary">
              Back to your trips
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorState error={trip.error} context="trip.load" onRetry={() => void trip.refetch()} retrying={trip.isFetching} />;
  }

  const t = trip.data;
  const base = `/trips/${tripId}`;
  const tabs = [
    { label: 'Overview', href: base, exact: true },
    { label: 'Itinerary', href: `${base}/itinerary`, badge: t.pendingAdaptations },
    { label: 'Map', href: `${base}/map` },
    { label: 'Chat', href: `${base}/chat`, badge: t.unreadMessages },
    { label: 'People', href: `${base}/people` },
    { label: 'Bookings', href: `${base}/bookings` },
    { label: 'Safety', href: `${base}/safety` },
  ];
  const status = TRIP_STATUS[t.status];

  return (
    <header className="mb-8 grid gap-5">
      <Link href="/trips" className="inline-flex w-fit items-center gap-1 rounded-full text-[0.875rem] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ChevronLeftIcon size={16} />
        All trips
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {t.currentItineraryVersion && <StatusPill>Version {t.currentItineraryVersion}</StatusPill>}
          </div>
          <h1 className="text-balance text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{t.title}</h1>
          <p className="text-[var(--text-muted)]">
            {[t.destination ? `${t.destination.name}, ${t.destination.state}` : 'Destination not set', formatDateRange(t.startDate, t.endDate) ?? 'Dates not set', t.days ? `${t.days} days` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <ul className="flex items-center" aria-label={`${t.members.length} travellers`}>
          {t.members.slice(0, 5).map((member, index) => (
            <li key={member.userId} className={cn(index > 0 && '-ml-2')} title={member.displayName}>
              <Avatar name={member.displayName} src={member.avatarUrl} size="sm" presence={member.presence} className="rounded-full ring-2 ring-[var(--surface)]" />
            </li>
          ))}
          {t.members.length > 5 && <li className="-ml-2 inline-flex size-8 items-center justify-center rounded-full bg-[var(--tone-neutral-bg)] text-[0.75rem] font-semibold ring-2 ring-[var(--surface)]">+{t.members.length - 5}</li>}
        </ul>
      </div>
      <nav aria-label="Trip sections" className="-mx-[var(--page-gutter)] overflow-x-auto px-[var(--page-gutter)] [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1 border-b border-[var(--hairline)]">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[0.9375rem] font-medium transition-colors',
                    active ? 'border-terracotta text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  {tab.label}
                  {tab.badge ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1.5 text-[0.6875rem] font-bold text-white">
                      {tab.badge}
                      <span className="sr-only"> {tab.label === 'Chat' ? 'unread' : 'to review'}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

/** Shared frame for every trip screen: privacy guard, header, contextual navigation, realtime channel. */
export function TripFrame({ tripId, children }: { tripId: string; children: ReactNode }) {
  return (
    <PageShell width="wide">
      <RequireAuth description="Trips are private to the people travelling on them.">
        <TripHeader tripId={tripId} />
        {children}
      </RequireAuth>
    </PageShell>
  );
}
