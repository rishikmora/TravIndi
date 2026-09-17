import type { Metadata } from 'next';
import { VerifyScreen } from '@/components/providers/VerifyScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.verify,
  description: 'Check the verification evidence TravIndi holds for a guide or business, or confirm a ticket code.',
  alternates: { canonical: '/verify' },
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  return <VerifyScreen initialQuery={(Array.isArray(q) ? q[0] : q)?.slice(0, 100) ?? ''} />;
}
