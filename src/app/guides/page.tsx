import type { Metadata } from 'next';
import { ProviderDirectory } from '@/components/providers/ProviderDirectory';

export const metadata: Metadata = {
  title: 'Local guides',
  description: 'Find local guides across India, with the verification evidence TravIndi holds for each.',
  alternates: { canonical: '/guides' },
};

export default function GuidesPage() {
  return <ProviderDirectory kind="guide" />;
}
