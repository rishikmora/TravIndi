import type { Metadata } from 'next';
import { PlanJourneyScreen } from '@/components/trips/plan/PlanJourneyScreen';

export const metadata: Metadata = {
  title: 'Plan a journey',
  description: 'Describe your trip in your own words and review a plan built around who you’re travelling with.',
};

export default function NewTripPage() {
  return <PlanJourneyScreen />;
}
