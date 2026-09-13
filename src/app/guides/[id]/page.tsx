import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GuideProfileScreen } from '@/components/providers/ProviderProfile';

export const metadata: Metadata = { title: 'Local guide' };

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{1,80}$/.test(id)) notFound();
  return <GuideProfileScreen guideId={id} />;
}
