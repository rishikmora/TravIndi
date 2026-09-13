import type { Metadata } from 'next';
import { TripsScreen } from '@/components/trips/TripsScreen';

export const metadata: Metadata = {
  title: 'Your trips',
  robots: { index: false, follow: false },
};

export default function TripsPage() {
  return <TripsScreen />;
}
