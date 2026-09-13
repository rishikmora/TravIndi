import type { Metadata } from 'next';
import { VerificationsScreen } from '@/components/authority/VerificationsScreen';

export const metadata: Metadata = { title: 'Verifications' };

export default function AuthorityVerificationsPage() {
  return <VerificationsScreen />;
}
