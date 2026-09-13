import { normalizeHttpError, normalizeThrown } from './errors';
import type { ApiRequest, Transport } from './transport';

/**
 * Development transport. Lazily loads the mock backend (a separate chunk, never
 * fetched in API mode) and routes requests to it. Responses and errors flow
 * through exactly the same normalisation as real HTTP responses.
 */
export function createMockTransport(): Transport {
  let backend: Promise<import('@/lib/mock-backend').MockBackend> | null = null;
  const load = () => {
    backend ??= import('@/lib/mock-backend').then((module) => module.getMockBackend());
    return backend;
  };

  return {
    kind: 'mock',
    async request<T>(request: ApiRequest): Promise<T> {
      try {
        const mock = await load();
        const response = await mock.handle(request);
        if (response.status >= 400) throw normalizeHttpError(response.status, response.body, null);
        return response.body as T;
      } catch (error) {
        throw normalizeThrown(error);
      }
    },
  };
}
