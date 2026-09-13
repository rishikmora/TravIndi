import type { Metadata } from 'next';
import { ProfileScreen } from '@/components/account/ProfileScreen';

export const metadata: Metadata = {
  title: 'Your profile',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
