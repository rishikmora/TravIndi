import type { Metadata } from 'next';
import { ReportScreen } from '@/components/safety/ReportScreen';

export const metadata: Metadata = {
  title: 'Report an incident',
  robots: { index: false, follow: false },
};

export default function ReportPage() {
  return <ReportScreen />;
}
