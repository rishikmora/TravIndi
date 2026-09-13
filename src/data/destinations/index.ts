import type { Attraction, Destination, DestinationTag, RegionId } from '../types';
import { haversineKm } from '@/utils/geo';
import { eastDestinations } from './east';
import { northDestinations } from './north';
import { southDestinations } from './south';
import { westDestinations } from './west';

export const destinations: Destination[] = [
  ...northDestinations,
  ...westDestinations,
  ...southDestinations,
  ...eastDestinations,
];

const bySlug = new Map(destinations.map((d) => [d.slug, d]));

export function getDestination(slug: string): Destination | undefined {
  return bySlug.get(slug);
}

export function requireDestination(slug: string): Destination {
  const destination = bySlug.get(slug);
  if (!destination) throw new Error(`Unknown destination: ${slug}`);
  return destination;
}

export function getDestinations(slugs: readonly string[]): Destination[] {
  return slugs.map((s) => bySlug.get(s)).filter((d): d is Destination => Boolean(d));
}

export interface AttractionRef {
  attraction: Attraction;
  destination: Destination;
}

export const allAttractions: AttractionRef[] = destinations.flatMap((destination) =>
  destination.attractions.map((attraction) => ({ attraction, destination })),
);

export function findAttraction(destinationSlug: string, attractionSlug: string): AttractionRef | undefined {
  const destination = bySlug.get(destinationSlug);
  const attraction = destination?.attractions.find((a) => a.slug === attractionSlug);
  return destination && attraction ? { destination, attraction } : undefined;
}

export function getNearbyDestinations(slug: string, limit = 4): Array<Destination & { distanceKm: number }> {
  const origin = bySlug.get(slug);
  if (!origin) return [];
  return destinations
    .filter((d) => d.slug !== slug)
    .map((d) => ({ ...d, distanceKm: Math.round(haversineKm(origin.coordinates, d.coordinates)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export const popularDestinations = [...destinations].sort((a, b) => b.popularity - a.popularity);

export const hiddenGems = destinations.filter((d) => d.hiddenGem);

export function destinationsByRegion(region: RegionId) {
  return destinations.filter((d) => d.region === region);
}

export function destinationsWithTag(tag: DestinationTag) {
  return destinations.filter((d) => d.tags.includes(tag));
}

export const REGION_LABELS: Record<RegionId, string> = {
  north: 'North',
  west: 'West',
  south: 'South',
  east: 'East',
  northeast: 'Northeast',
  central: 'Central',
  islands: 'Islands',
};
