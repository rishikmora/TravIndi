import type { Metadata } from 'next';
import { ReportScreen } from '@/components/safety/ReportScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.report,
  robots: { index: false, follow: false },
};

export default function ReportPage() {
  return <ReportScreen />;
}
