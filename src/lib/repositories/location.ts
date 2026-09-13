import { endpoints } from '@/lib/api/endpoints';
import type { LocationShareDto, LocationShareHistoryItemDto } from '@/types/api';
import type { LocationShare, LocationShareHistoryItem, LocationShareInput, LocationUpdate } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface LocationRepository {
  /** Shares the current user owns. */
  myShares(options?: RequestOptions): Promise<LocationShare[]>;
  /** Shares other people have granted to the current user. */
  visibleShares(options?: RequestOptions): Promise<LocationShare[]>;
  get(shareId: string, options?: RequestOptions): Promise<LocationShare>;
  create(input: LocationShareInput): Promise<LocationShare>;
  pause(shareId: string): Promise<LocationShare>;
  resume(shareId: string): Promise<LocationShare>;
  extend(shareId: string, minutes: number): Promise<LocationShare>;
  changeRecipients(shareId: string, recipientIds: string[]): Promise<LocationShare>;
  stop(shareId: string): Promise<LocationShare>;
  stopAll(): Promise<{ stoppedCount: number }>;
  postUpdates(shareId: string, updates: LocationUpdate[]): Promise<LocationShare>;
  history(options?: RequestOptions): Promise<LocationShareHistoryItem[]>;
}

export function createLocationRepository(client: RepositoryClient): LocationRepository {
  const patch = (shareId: string, body: Record<string, unknown>) =>
    client.patch<LocationShareDto>(endpoints.location.share(shareId), body);

  return {
    myShares: async (options) =>
      (await client.get<{ items: LocationShareDto[] }>(endpoints.location.shares, undefined, options)).items,
    visibleShares: async (options) =>
      (await client.get<{ items: LocationShareDto[] }>(endpoints.location.visible, undefined, options)).items,
    get: (shareId, options) => client.get<LocationShareDto>(endpoints.location.share(shareId), undefined, options),
    create: (input) => client.post<LocationShareDto>(endpoints.location.shares, input),
    pause: (shareId) => patch(shareId, { status: 'paused' }),
    resume: (shareId) => patch(shareId, { status: 'active' }),
    extend: (shareId, minutes) => patch(shareId, { extendMinutes: minutes }),
    changeRecipients: (shareId, recipientIds) => patch(shareId, { recipientIds }),
    stop: (shareId) => client.delete<LocationShareDto>(endpoints.location.share(shareId)),
    stopAll: () => client.post<{ stopped_count: number }>(endpoints.location.stopAll),
    postUpdates: (shareId, updates) => client.post<LocationShareDto>(endpoints.location.updates(shareId), { updates }),
    history: async (options) =>
      (await client.get<{ items: LocationShareHistoryItemDto[] }>(endpoints.location.history, undefined, options)).items,
  };
}
