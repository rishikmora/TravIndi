'use client';

import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { PlusIcon, SuitcaseIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
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
  const trips = useTrips();

  if (trips.isPending) {
    return (
      <LoadingBlock label="Loading your trips" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-[1.25rem]" />
        ))}
      </LoadingBlock>
    );
  }

  if (trips.isError) {
    return <ErrorState error={trips.error} context="trip.load" onRetry={() => void trips.refetch()} retrying={trips.isFetching} />;
  }

  const upcoming = trips.data.filter((t) => ['active', 'ready', 'planning'].includes(t.status));
  const drafts = trips.data.filter((t) => t.status === 'draft');
  const past = trips.data.filter((t) => t.status === 'completed' || t.status === 'cancelled');

  if (trips.data.length === 0) {
    return (
      <EmptyState
        icon={<SuitcaseIcon />}
        title="No trips yet"
        description="Tell us where you’d like to go and who’s coming. We’ll build a plan you can change at any time."
        action={
          <ButtonLink href="/trips/new" variant="accent">
            Plan my journey
          </ButtonLink>
        }
        className="surface-card"
      />
    );
  }

  return (
    <div className="grid gap-12">
      {upcoming.length > 0 && (
        <Section title="Current and upcoming" id="upcoming">
          <Grid trips={upcoming} />
        </Section>
      )}
      {drafts.length > 0 && (
        <Section title="Drafts" description="Finish the details and we’ll build the itinerary." id="drafts">
          <Grid trips={drafts} />
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Past trips" id="past">
          <Grid trips={past} />
        </Section>
      )}
    </div>
  );
}

export function TripsScreen() {
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Trips"
        title="Your journeys"
        actions={
          <ButtonLink href="/trips/new" variant="accent">
            <PlusIcon size={18} />
            Plan a journey
          </ButtonLink>
        }
      />
      <RequireAuth description="Sign in to see your trips, itineraries and travel updates.">
        <TripsContent />
      </RequireAuth>
    </PageShell>
  );
}
