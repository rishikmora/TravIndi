import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BusinessProfileScreen } from '@/components/providers/ProviderProfile';

export const metadata: Metadata = { title: 'Local business' };

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{1,80}$/.test(id)) notFound();
  return <BusinessProfileScreen businessId={id} />;
}
