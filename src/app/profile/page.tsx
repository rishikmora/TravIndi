import type { Metadata } from 'next';
import { ProfileScreen } from '@/components/account/ProfileScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.profile,
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
