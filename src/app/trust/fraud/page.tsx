import type { Metadata } from 'next';
import { FraudReportScreen } from '@/components/providers/FraudReportScreen';

export const metadata: Metadata = {
  title: 'Report fraud',
  robots: { index: false, follow: true },
};

export default async function FraudPage({ searchParams }: { searchParams: Promise<{ provider?: string | string[] }> }) {
  const { provider } = await searchParams;
  return <FraudReportScreen providerReference={(Array.isArray(provider) ? provider[0] : provider)?.slice(0, 200) ?? ''} />;
}
