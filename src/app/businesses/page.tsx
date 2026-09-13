import type { Metadata } from 'next';
import { ProviderDirectory } from '@/components/providers/ProviderDirectory';

export const metadata: Metadata = {
  title: 'Local businesses',
  description: 'Stays, tours, transport and experiences across India, with the verification evidence TravIndi holds for each.',
  alternates: { canonical: '/businesses' },
};

export default function BusinessesPage() {
  return <ProviderDirectory kind="business" />;
}
