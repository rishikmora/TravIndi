import { sessionEvents, tokenStore } from '@/lib/auth/session-events';
import { env } from '@/lib/config/env';
import { createRepositories, type Repositories } from '@/lib/repositories';
import { createFetchTransport } from './fetch-transport';
import { createMockTransport } from './mock-transport';
import type { Transport } from './transport';

/**
 * Chooses the transport from a single switch: `NEXT_PUBLIC_DATA_MODE`.
 *  - `api`  → the FastAPI backend at NEXT_PUBLIC_API_BASE_URL
 *  - `mock` → the development backend in `src/lib/mock-backend`, which serves
 *             the documented contract and is never bundled into the API path.
 */
export function createDefaultTransport(): Transport {
  if (env.dataMode === 'mock') return createMockTransport();

  let refreshing: Promise<boolean> | null = null;
  const transport: Transport = createFetchTransport({
    baseUrl: env.apiBaseUrl,
    authMode: env.authMode,
    timeoutMs: env.requestTimeoutMs,
    getAccessToken: tokenStore.get,
    refreshSession: () => {
      // Collapse concurrent 401s into a single refresh.
      refreshing ??= repositories.auth.refresh().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },
    onUnauthorized: sessionEvents.emitUnauthorized,
  });
  const repositories = createRepositories(transport);
  return transport;
}

let singleton: Repositories | null = null;

/** The app-wide API. Usage: `api.trips.get(id)`, `api.adaptations.accept(id, …)`. */
export const api: Repositories = new Proxy({} as Repositories, {
  get(_target, domain: keyof Repositories) {
    singleton ??= createRepositories(createDefaultTransport());
    return singleton[domain];
  },
});

/** Test/storybook hook to supply a custom transport. */
export function setApiTransport(transport: Transport) {
  singleton = createRepositories(transport);
}

export { ApiError, isApiError } from './errors';
export { describeError, type ErrorContext, type ErrorDescription, type RecoveryAction } from './error-messages';
