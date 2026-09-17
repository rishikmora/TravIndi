import type { Metadata } from 'next';
import { PartnerScreen } from '@/components/partner/PartnerScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.partner,
  robots: { index: false, follow: false },
};

export default function PartnerPage() {
  return <PartnerScreen />;
}
