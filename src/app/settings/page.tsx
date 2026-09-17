import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/account/SettingsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.settings,
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
