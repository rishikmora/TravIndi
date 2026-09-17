import type { Metadata } from 'next';
import { PlanJourneyScreen } from '@/components/trips/plan/PlanJourneyScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.planJourney,
  description: 'Describe your trip in your own words and review a plan built around who you’re travelling with.',
};

export default function NewTripPage() {
  return <PlanJourneyScreen />;
}
