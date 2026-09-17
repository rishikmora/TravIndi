import type { Metadata } from 'next';
import { ProviderDirectory } from '@/components/providers/ProviderDirectory';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.businesses,
  description: 'Stays, tours, transport and experiences across India, with the verification evidence TravIndi holds for each.',
  alternates: { canonical: '/businesses' },
};

export default function BusinessesPage() {
  return <ProviderDirectory kind="business" />;
}
