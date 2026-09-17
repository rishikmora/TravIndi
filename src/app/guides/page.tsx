import type { Metadata } from 'next';
import { ProviderDirectory } from '@/components/providers/ProviderDirectory';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.guides,
  description: 'Find local guides across India, with the verification evidence TravIndi holds for each.',
  alternates: { canonical: '/guides' },
};

export default function GuidesPage() {
  return <ProviderDirectory kind="guide" />;
}
