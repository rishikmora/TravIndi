'use client';

import Link from 'next/link';
import { TripCard } from '@/components/trips/TripCard';
import { ButtonLink } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { useAuth } from '@/lib/auth/provider';
import { useHomeSummary } from '@/lib/query/hooks/trips';

/** Shown only to signed-in travellers, built only from their real data. */
export function HomeReturningPanel() {
  const { status, user } = useAuth();
  const home = useHomeSummary(status === 'authenticated');
  const { t } = useTranslation();
  if (status !== 'authenticated' || !user || !home.data) return null;

  const { upcomingTrip, draftTrip, pendingAdaptations, unreadTripMessages, savedPlaces } = home.data;
  const firstName = user.displayName.split(' ')[0];
  if (!upcomingTrip && !draftTrip && pendingAdaptations.length === 0 && savedPlaces.length === 0) return null;

  return (
    <section aria-labelledby="welcome-back-title" className="theme-app py-16 page-gutter" data-nav-theme="light">
      <div className="mx-auto grid max-w-6xl gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <p className="label text-[var(--text-subtle)]">{t('home.returning.eyebrow')}</p>
            <h2 id="welcome-back-title" className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.03em]">
              {t('home.returning.title', { name: firstName })}
            </h2>
          </div>
          <ButtonLink href="/trips" variant="secondary">
            {t('home.returning.allTrips')}
          </ButtonLink>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {upcomingTrip && <TripCard trip={upcomingTrip} />}
          <div className="grid content-start gap-3">
            {pendingAdaptations.map((pending) => (
              <Link key={pending.proposalId} href={`/trips/${pending.tripId}/itinerary`} className="surface-card grid gap-1 p-4 ring-2 ring-[var(--color-gold)] hover:bg-[var(--surface-sunken)]">
                <StatusPill tone="warning" className="justify-self-start" dot>
                  {t('home.returning.travelUpdate')}
                </StatusPill>
                <span className="font-semibold">{pending.tripTitle}</span>
                <span className="text-[0.9375rem] text-[var(--text-muted)]">{pending.summary}</span>
              </Link>
            ))}
            {draftTrip && (
              <Link href={`/trips/${draftTrip.tripId}`} className="surface-card grid gap-1 p-4 hover:bg-[var(--surface-sunken)]">
                <span className="label text-[var(--text-subtle)]">{t('home.returning.continuePlanning')}</span>
                <span className="font-semibold">{draftTrip.title}</span>
              </Link>
            )}
            {unreadTripMessages > 0 && (
              <Link href="/messages" className="surface-card flex items-center justify-between gap-3 p-4 hover:bg-[var(--surface-sunken)]">
                <span className="font-semibold">{t('home.returning.unreadMessages')}</span>
                <StatusPill tone="info">{unreadTripMessages}</StatusPill>
              </Link>
            )}
            {savedPlaces.length > 0 && (
              <div className="surface-card grid gap-2 p-4">
                <span className="label text-[var(--text-subtle)]">{t('home.returning.savedPlaces')}</span>
                <ul className="flex flex-wrap gap-2">
                  {savedPlaces.map((place) => (
                    <li key={place.placeId}>
                      <Link href={`/destinations/${place.destinationSlug}`} className="inline-flex min-h-9 items-center rounded-full px-3 text-[0.875rem] ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]">
                        {place.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
