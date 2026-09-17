import type { Metadata } from 'next';
import { ConsentsScreen } from '@/components/account/ConsentsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.consents,
  robots: { index: false, follow: false },
};

export default function ConsentsPage() {
  return <ConsentsScreen />;
}
