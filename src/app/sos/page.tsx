import type { Metadata } from 'next';
import { SosScreen } from '@/components/safety/SosScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.sos,
  robots: { index: false, follow: false },
};

export default function SosPage() {
  return <SosScreen />;
}
