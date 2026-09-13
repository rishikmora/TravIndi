import { camelizeKeys, snakeizeKeys } from '@/lib/api/case';
import type { QueryParams, Transport } from '@/lib/api/transport';
import type { Camelize } from '@/types/domain/case';

export interface RequestOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
  timeoutMs?: number;
}

/**
 * Thin typed wrapper used by repositories: converts domain (camelCase) inputs
 * to wire shape and wire responses back to domain shape.
 */
export function createRepositoryClient(transport: Transport) {
  const query = (params?: Record<string, unknown>) =>
    params ? (snakeizeKeys(params) as unknown as QueryParams) : undefined;
  const body = (value: unknown) => (value === undefined ? undefined : snakeizeKeys(value));

  return {
    async get<Dto>(path: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<Camelize<Dto>> {
      const data = await transport.request<Dto>({ method: 'GET', path, query: query(params), ...options });
      return camelizeKeys(data);
    },
    async post<Dto>(path: string, payload?: unknown, options?: RequestOptions): Promise<Camelize<Dto>> {
      const data = await transport.request<Dto>({ method: 'POST', path, body: body(payload), ...options });
      return camelizeKeys(data);
    },
    async put<Dto>(path: string, payload?: unknown, options?: RequestOptions): Promise<Camelize<Dto>> {
      const data = await transport.request<Dto>({ method: 'PUT', path, body: body(payload), ...options });
      return camelizeKeys(data);
    },
    async patch<Dto>(path: string, payload?: unknown, options?: RequestOptions): Promise<Camelize<Dto>> {
      const data = await transport.request<Dto>({ method: 'PATCH', path, body: body(payload), ...options });
      return camelizeKeys(data);
    },
    async delete<Dto = void>(path: string, options?: RequestOptions): Promise<Camelize<Dto>> {
      const data = await transport.request<Dto>({ method: 'DELETE', path, ...options });
      return camelizeKeys(data);
    },
  };
}

export type RepositoryClient = ReturnType<typeof createRepositoryClient>;
