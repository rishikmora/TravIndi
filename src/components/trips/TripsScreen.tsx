'use client';

import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { PlusIcon, SuitcaseIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
import { useTrips } from '@/lib/query/hooks/trips';
import type { TripSummary } from '@/types/domain';
import { TripCard } from './TripCard';

function Grid({ trips }: { trips: TripSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip) => (
        <li key={trip.tripId} className="flex">
          <TripCard trip={trip} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

function TripsContent() {
  const { t } = useTranslation();
  const trips = useTrips();

  if (trips.isPending) {
    return (
      <LoadingBlock label={t('trips.list.loading')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-[1.25rem]" />
        ))}
      </LoadingBlock>
    );
  }

  if (trips.isError) {
    return <ErrorState error={trips.error} context="trip.load" onRetry={() => void trips.refetch()} retrying={trips.isFetching} />;
  }

  const upcoming = trips.data.filter((trip) => ['active', 'ready', 'planning'].includes(trip.status));
  const drafts = trips.data.filter((trip) => trip.status === 'draft');
  const past = trips.data.filter((trip) => trip.status === 'completed' || trip.status === 'cancelled');

  if (trips.data.length === 0) {
    return (
      <EmptyState
        icon={<SuitcaseIcon />}
        title={t('trips.list.emptyTitle')}
        description={t('trips.list.emptyDescription')}
        action={
          <ButtonLink href="/trips/new" variant="accent">
            {t('trips.list.planMyJourney')}
          </ButtonLink>
        }
        className="surface-card"
      />
    );
  }

  return (
    <div className="grid gap-12">
      {upcoming.length > 0 && (
        <Section title={t('trips.list.upcoming')} id="upcoming">
          <Grid trips={upcoming} />
        </Section>
      )}
      {drafts.length > 0 && (
        <Section title={t('trips.list.drafts')} description={t('trips.list.draftsDescription')} id="drafts">
          <Grid trips={drafts} />
        </Section>
      )}
      {past.length > 0 && (
        <Section title={t('trips.list.past')} id="past">
          <Grid trips={past} />
        </Section>
      )}
    </div>
  );
}

export function TripsScreen() {
  const { t } = useTranslation();
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={t('trips.list.eyebrow')}
        title={t('trips.list.title')}
        actions={
          <ButtonLink href="/trips/new" variant="accent">
            <PlusIcon size={18} />
            {t('trips.list.planJourney')}
          </ButtonLink>
        }
      />
      <RequireAuth description={t('trips.list.signIn')}>
        <TripsContent />
      </RequireAuth>
    </PageShell>
  );
}
