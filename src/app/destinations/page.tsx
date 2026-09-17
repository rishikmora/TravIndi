import type { Metadata } from 'next';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { DestinationsExplorer } from '@/components/destinations/DestinationsExplorer';
import en from '@/i18n/locales/en';
import { T } from '@/i18n/react';
import { listPublicDestinations } from '@/lib/api/server';

export const revalidate = 300;

export const metadata: Metadata = {
  title: en.destinations.list.metaTitle,
  description: 'Heritage cities, mountains, backwaters, beaches and hidden places across India — with honest guidance on access, safety and when to go.',
  alternates: { canonical: '/destinations' },
};

export default async function DestinationsPage() {
  const initial = await listPublicDestinations();
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={<T k="destinations.list.eyebrow" />}
        title={<T k="destinations.list.title" />}
        description={<T k="destinations.list.description" />}
      />
      <DestinationsExplorer initial={initial} />
    </PageShell>
  );
}
