import { ItineraryView } from '@/components/trips/detail/ItineraryView';

export default async function TripItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItineraryView tripId={id} />;
}
