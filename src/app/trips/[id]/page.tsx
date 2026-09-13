import { TripOverview } from '@/components/trips/detail/TripOverview';

export default async function TripOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripOverview tripId={id} />;
}
