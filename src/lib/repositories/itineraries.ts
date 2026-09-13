import { endpoints } from '@/lib/api/endpoints';
import type { ItineraryDto, ItineraryVersionDto } from '@/types/api';
import type { Itinerary, ItineraryVersion } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface ItineraryRepository {
  current(tripId: string, options?: RequestOptions): Promise<Itinerary>;
  version(tripId: string, version: number, options?: RequestOptions): Promise<Itinerary>;
  versions(tripId: string, options?: RequestOptions): Promise<ItineraryVersion[]>;
}

export function createItineraryRepository(client: RepositoryClient): ItineraryRepository {
  return {
    current: (tripId, options) => client.get<ItineraryDto>(endpoints.itineraries.current(tripId), undefined, options),
    version: (tripId, version, options) =>
      client.get<ItineraryDto>(endpoints.itineraries.version(tripId, version), undefined, options),
    versions: async (tripId, options) =>
      (await client.get<{ items: ItineraryVersionDto[] }>(endpoints.itineraries.versions(tripId), undefined, options)).items,
  };
}
