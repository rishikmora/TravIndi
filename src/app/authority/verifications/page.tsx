import type { Metadata } from 'next';
import { VerificationsScreen } from '@/components/authority/VerificationsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = { title: en.meta.titles.verifications };

export default function AuthorityVerificationsPage() {
  return <VerificationsScreen />;
}
