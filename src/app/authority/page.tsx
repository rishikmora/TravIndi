import type { Metadata } from 'next';
import { OperationsScreen } from '@/components/authority/OperationsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = { title: en.meta.titles.operations };

export default function AuthorityPage() {
  return <OperationsScreen />;
}
