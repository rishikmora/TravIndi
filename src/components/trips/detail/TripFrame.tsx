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
import { useTranslation } from '@/i18n/react';
import { isApiError } from '@/lib/api/errors';
import { formatDateRange } from '@/lib/format/dates';
import { useTrip } from '@/lib/query/hooks/trips';
import { useChannel } from '@/lib/realtime/provider';
import { cn } from '@/utils/cn';
import { TRIP_STATUS } from '../tripStatus';

function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const trip = useTrip(tripId);
  useChannel(`trip:${tripId}`);

  if (trip.isPending) {
    return (
      <LoadingBlock label={t('trips.frame.loading')} className="mb-8 grid gap-3">
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
          title={t('trips.frame.notFoundTitle')}
          description={t('trips.frame.notFoundDescription')}
          action={
            <ButtonLink href="/trips" variant="secondary">
              {t('trips.frame.backToTrips')}
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorState error={trip.error} context="trip.load" onRetry={() => void trip.refetch()} retrying={trip.isFetching} />;
  }

  const data = trip.data;
  const base = `/trips/${tripId}`;
  const tabs: Array<{ id: 'overview' | 'itinerary' | 'map' | 'chat' | 'people' | 'bookings' | 'safety'; href: string; exact?: boolean; badge?: number }> = [
    { id: 'overview', href: base, exact: true },
    { id: 'itinerary', href: `${base}/itinerary`, badge: data.pendingAdaptations },
    { id: 'map', href: `${base}/map` },
    { id: 'chat', href: `${base}/chat`, badge: data.unreadMessages },
    { id: 'people', href: `${base}/people` },
    { id: 'bookings', href: `${base}/bookings` },
    { id: 'safety', href: `${base}/safety` },
  ];
  const status = TRIP_STATUS[data.status];

  return (
    <header className="mb-8 grid gap-5">
      <Link href="/trips" className="inline-flex w-fit items-center gap-1 rounded-full text-[0.875rem] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ChevronLeftIcon size={16} />
        {t('trips.frame.allTrips')}
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {data.currentItineraryVersion && <StatusPill>{t('trips.frame.version', { version: data.currentItineraryVersion })}</StatusPill>}
          </div>
          <h1 className="text-balance text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{data.title}</h1>
          <p className="text-[var(--text-muted)]">
            {[
              data.destination ? t('trips.frame.place', { name: data.destination.name, state: data.destination.state }) : t('trips.frame.destinationNotSet'),
              formatDateRange(data.startDate, data.endDate) ?? t('trips.card.datesNotSet'),
              data.days ? t('planner.duration.days', { count: data.days }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <ul className="flex items-center" aria-label={t('trips.card.travellers', { count: data.members.length })}>
          {data.members.slice(0, 5).map((member, index) => (
            <li key={member.userId} className={cn(index > 0 && '-ml-2')} title={member.displayName}>
              <Avatar name={member.displayName} src={member.avatarUrl} size="sm" presence={member.presence} className="rounded-full ring-2 ring-[var(--surface)]" />
            </li>
          ))}
          {data.members.length > 5 && <li className="-ml-2 inline-flex size-8 items-center justify-center rounded-full bg-[var(--tone-neutral-bg)] text-[0.75rem] font-semibold ring-2 ring-[var(--surface)]">+{data.members.length - 5}</li>}
        </ul>
      </div>
      <nav aria-label={t('trips.frame.sectionsLabel')} className="-mx-[var(--page-gutter)] overflow-x-auto px-[var(--page-gutter)] [scrollbar-width:none]">
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
                  {t(`trips.frame.tabs.${tab.id}`)}
                  {tab.badge ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1.5 text-[0.6875rem] font-bold text-white">
                      {tab.badge}
                      <span className="sr-only"> {tab.id === 'chat' ? t('trips.frame.badgeUnread') : t('trips.frame.badgeToReview')}</span>
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
  const { t } = useTranslation();
  return (
    <PageShell width="wide">
      <RequireAuth description={t('trips.frame.signIn')}>
        <TripHeader tripId={tripId} />
        {children}
      </RequireAuth>
    </PageShell>
  );
}
