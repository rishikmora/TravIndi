import type { Metadata } from 'next';
import { ConsentsScreen } from '@/components/account/ConsentsScreen';

export const metadata: Metadata = {
  title: 'Privacy & consents',
  robots: { index: false, follow: false },
};

export default function ConsentsPage() {
  return <ConsentsScreen />;
}
