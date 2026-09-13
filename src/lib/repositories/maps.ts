import { endpoints } from '@/lib/api/endpoints';
import type { MapLayersResponseDto, RoutePlanResponseDto } from '@/types/api';
import type { MapLayerId, MapLayers, RoutePlan, RoutePlanRequest } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface MapRepository {
  planRoutes(input: RoutePlanRequest, options?: RequestOptions): Promise<RoutePlan>;
  layers(
    input: { bbox: [number, number, number, number]; layers: MapLayerId[]; tripId?: string | null },
    options?: RequestOptions,
  ): Promise<MapLayers>;
}

export function createMapRepository(client: RepositoryClient): MapRepository {
  return {
    planRoutes: (input, options) => client.post<RoutePlanResponseDto>(endpoints.routes.plan, input, options),
    layers: (input, options) =>
      client.get<MapLayersResponseDto>(
        endpoints.map.layers,
        { bbox: input.bbox.join(','), layers: input.layers.join(','), tripId: input.tripId ?? undefined },
        options,
      ),
  };
}
