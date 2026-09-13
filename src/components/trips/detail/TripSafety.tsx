'use client';

import { EmergencyNumbers } from '@/components/safety/EmergencyNumbers';
import { IncidentsPanel, SafetyContextPanel } from '@/components/safety/SafetyScreen';
import { ButtonLink } from '@/components/ui/Button';
import { useTrip } from '@/lib/query/hooks/trips';

export function TripSafety({ tripId }: { tripId: string }) {
  const trip = useTrip(tripId);
  const name = trip.data?.destination?.name ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-8">
        <SafetyContextPanel tripId={tripId} tripName={name} />
        <IncidentsPanel tripId={tripId} />
      </div>
      <aside className="grid content-start gap-4">
        <EmergencyNumbers compact />
        <ButtonLink href="/sos" variant="danger" size="lg">
          SOS
        </ButtonLink>
        <ButtonLink href={`/location-sharing?trip=${tripId}`} variant="secondary">
          Share my location with this trip
        </ButtonLink>
        <ButtonLink href="/trusted-contacts" variant="subtle">
          Trusted contacts
        </ButtonLink>
      </aside>
    </div>
  );
}
