import type { Metadata } from 'next';
import { AnalyticsScreen } from '@/components/authority/AnalyticsScreen';

export const metadata: Metadata = { title: 'Analytics' };

export default function AuthorityAnalyticsPage() {
  return <AnalyticsScreen />;
}
