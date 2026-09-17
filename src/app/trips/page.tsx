import type { Metadata } from 'next';
import { TripsScreen } from '@/components/trips/TripsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.trips,
  robots: { index: false, follow: false },
};

export default function TripsPage() {
  return <TripsScreen />;
}
