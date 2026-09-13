import type { Metadata } from 'next';
import { PlanJourneyScreen } from '@/components/trips/plan/PlanJourneyScreen';

export const metadata: Metadata = {
  title: 'Plan a journey',
  robots: { index: false, follow: true },
};

/** Entry point from the home page's "Tell us about your trip" input (`?q=`). */
export default async function PlanFromTextPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const text = (Array.isArray(q) ? q[0] : q)?.slice(0, 1000);
  return <PlanJourneyScreen initialText={text} />;
}
