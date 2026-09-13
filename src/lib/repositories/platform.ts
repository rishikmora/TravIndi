import { endpoints } from '@/lib/api/endpoints';
import type { CapabilitiesDto, PlatformMetricsDto } from '@/types/api';
import type { Capabilities, PlatformMetrics } from '@/types/domain';
import type { RepositoryClient } from './client';

export interface PlatformRepository {
  capabilities(): Promise<Capabilities>;
  metrics(): Promise<PlatformMetrics>;
}

export function createPlatformRepository(client: RepositoryClient): PlatformRepository {
  return {
    capabilities: () => client.get<CapabilitiesDto>(endpoints.platform.capabilities),
    metrics: () => client.get<PlatformMetricsDto>(endpoints.platform.metrics),
  };
}
