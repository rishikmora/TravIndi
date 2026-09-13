import type { Metadata } from 'next';
import { MapScreen } from '@/components/map/MapScreen';

export const metadata: Metadata = {
  title: 'Map',
  description: 'Places, help points and safety information across India, with every map feature also listed as text.',
};

const coordinate = (value: string | string[] | undefined, limit: number) => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const lat = coordinate(params.lat, 90);
  const lng = coordinate(params.lng, 180);
  const rawLabel = Array.isArray(params.label) ? params.label[0] : params.label;
  const destination = Array.isArray(params.destination) ? params.destination[0] : params.destination;
  return (
    <MapScreen
      focus={lat !== null && lng !== null ? { lat, lng, label: rawLabel?.slice(0, 80) || 'Shared location' } : null}
      destinationSlug={destination && /^[a-z0-9-]{1,80}$/.test(destination) ? destination : null}
    />
  );
}
