import type { Metadata } from 'next';
import { TrustedContactsScreen } from '@/components/safety/TrustedContactsScreen';

export const metadata: Metadata = {
  title: 'Trusted contacts',
  robots: { index: false, follow: false },
};

export default function TrustedContactsPage() {
  return <TrustedContactsScreen />;
}
