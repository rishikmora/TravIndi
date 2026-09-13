import type { Metadata } from 'next';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { DestinationsExplorer } from '@/components/destinations/DestinationsExplorer';
import { listPublicDestinations } from '@/lib/api/server';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Destinations across India',
  description: 'Heritage cities, mountains, backwaters, beaches and hidden places across India — with honest guidance on access, safety and when to go.',
  alternates: { canonical: '/destinations' },
};

export default async function DestinationsPage() {
  const initial = await listPublicDestinations();
  return (
    <PageShell width="wide">
      <PageHeader eyebrow="Discover" title="Where in India?" description="Start with a place, then shape the journey around who you’re travelling with." />
      <DestinationsExplorer initial={initial} />
    </PageShell>
  );
}
