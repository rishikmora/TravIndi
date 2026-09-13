import { TripMap } from '@/components/trips/detail/TripMap';

export default async function TripMapPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ place?: string | string[] }> }) {
  const [{ id }, { place }] = await Promise.all([params, searchParams]);
  const placeId = Array.isArray(place) ? place[0] : place;
  return <TripMap tripId={id} placeId={placeId && /^[\w-]{1,80}$/.test(placeId) ? placeId : null} />;
}
