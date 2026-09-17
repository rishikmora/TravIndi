import type { Metadata } from 'next';
import { AnalyticsScreen } from '@/components/authority/AnalyticsScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = { title: en.meta.titles.analytics };

export default function AuthorityAnalyticsPage() {
  return <AnalyticsScreen />;
}
