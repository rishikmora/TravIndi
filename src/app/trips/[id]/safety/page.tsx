import { TripSafety } from '@/components/trips/detail/TripSafety';

export default async function TripSafetyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripSafety tripId={id} />;
}
