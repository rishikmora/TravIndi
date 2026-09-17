import type { Metadata } from 'next';
import { TrustedContactsScreen } from '@/components/safety/TrustedContactsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.trustedContacts,
  robots: { index: false, follow: false },
};

export default function TrustedContactsPage() {
  return <TrustedContactsScreen />;
}
