import type { Metadata } from 'next';
import { NotificationsScreen } from '@/components/account/NotificationsScreen';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsScreen />;
}
