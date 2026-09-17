import type { Metadata } from 'next';
import { NotificationsScreen } from '@/components/account/NotificationsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.notifications,
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsScreen />;
}
