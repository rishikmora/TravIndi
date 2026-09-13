import { TripPeople } from '@/components/trips/detail/TripPeople';

export default async function TripPeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripPeople tripId={id} />;
}
