import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GuideProfileScreen } from '@/components/providers/ProviderProfile';
import en from '@/i18n/locales/en';

export const metadata: Metadata = { title: en.meta.titles.guide };

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{1,80}$/.test(id)) notFound();
  return <GuideProfileScreen guideId={id} />;
}
