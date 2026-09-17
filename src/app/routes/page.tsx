import type { Metadata } from 'next';
import { RoutesScreen } from '@/components/map/RoutesScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.routes,
  robots: { index: false, follow: true },
};

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ trip?: string | string[] }> }) {
  const { trip } = await searchParams;
  const tripId = Array.isArray(trip) ? trip[0] : trip;
  return <RoutesScreen initialTripId={tripId && /^[\w-]{1,80}$/.test(tripId) ? tripId : null} />;
}
