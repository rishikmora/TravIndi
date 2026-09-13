import type { Metadata } from 'next';
import { LocationSharingScreen } from '@/components/location/LocationSharingScreen';

export const metadata: Metadata = {
  title: 'Location sharing',
  robots: { index: false, follow: false },
};

export default async function LocationSharingPage({ searchParams }: { searchParams: Promise<{ trip?: string | string[] }> }) {
  const { trip } = await searchParams;
  const tripId = Array.isArray(trip) ? trip[0] : trip;
  return <LocationSharingScreen initialTripId={tripId && /^[\w-]{1,80}$/.test(tripId) ? tripId : null} />;
}
