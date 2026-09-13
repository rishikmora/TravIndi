import type { ApiRequest } from '@/lib/api/transport';
import type { UserDto } from '@/types/api';
import { startLiveLocationSimulation } from './effects';
import { mockFlags } from './flags';
import { routes } from './handlers';
import { runHousekeeping, strip } from './handlers/shared';
import { fail, HttpError, type MockResponse } from './http';
import { mockNetwork } from './network';
import { RealtimeHub } from './realtime';
import { compileRoutes, flattenQuery, type HandlerContext } from './router';
import { createScenarios, type MockScenarios } from './scenarios';
import { createSeed } from './seed';
import { MockStore } from './store';

/**
 * In-browser development backend implementing FRONTEND_BACKEND_CONTRACT.md.
 * Loaded only when NEXT_PUBLIC_DATA_MODE=mock; the API build never imports it.
 */
export interface MockBackend {
  handle(request: ApiRequest): Promise<MockResponse>;
  readonly hub: RealtimeHub;
  readonly store: MockStore;
  readonly scenarios: MockScenarios;
  /** Restores the seeded dataset and signs out. */
  reset(): void;
}

export { DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed/ids';
export { MOCK_NETWORK_EVENT, mockNetwork } from './network';

const match = compileRoutes(routes);
let instance: MockBackend | null = null;

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The request was aborted.', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function getMockBackend(): MockBackend {
  if (instance) return instance;

  const store = new MockStore(createSeed);
  const hub = new RealtimeHub({
    currentUserId: () => store.sessionUser?.user_id ?? null,
    canSubscribe: (userId, channel) => store.canSubscribe(userId, channel),
    displayName: (userId) => store.displayName(userId),
  });

  async function handle(request: ApiRequest): Promise<MockResponse> {
    if (request.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    await delay(120 + Math.random() * 220 + mockFlags.extraLatencyMs, request.signal);
    // Behaves like fetch() without a network: a TypeError, normalised to kind `network`.
    if (!mockNetwork.online) throw new TypeError('Failed to fetch');

    const found = match(request.method, request.path.split('?')[0]!);
    if (!found) {
      return { status: 404, body: { error: { code: 'route_not_found', message: `No handler for ${request.method} ${request.path}.` } } };
    }

    runHousekeeping(store, hub);
    const record = store.sessionUser;
    const user: UserDto | null = record ? strip(record) : null;

    const ctx: HandlerContext = {
      request,
      params: found.params,
      query: flattenQuery(request.query),
      body: request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {},
      store,
      hub,
      user,
      requireUser: () => {
        if (!user) {
          if (store.sessionExpiresAt) fail(401, 'session_expired', 'Your session has ended. Please sign in again.');
          fail(401, 'unauthenticated', 'Please sign in to continue.');
        }
        return user;
      },
      requireRole: (role) => {
        const current = ctx.requireUser();
        if (!current.roles.includes(role) && !current.roles.includes('admin')) fail(403, 'forbidden', 'You don’t have access to this area.');
        return current;
      },
    };

    try {
      return await found.route.handler(ctx);
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: error.body };
      console.error('[mock-backend]', request.method, request.path, error);
      return { status: 500, body: { error: { code: 'internal_error', message: 'Something went wrong on our side.' } } };
    }
  }

  instance = {
    handle,
    hub,
    store,
    scenarios: createScenarios(store, hub),
    reset() {
      store.reset();
      store.endSession();
      hub.disconnectAll(4401, 'data reset');
    },
  };

  if (typeof window !== 'undefined') {
    startLiveLocationSimulation(store, hub);
    setInterval(() => runHousekeeping(store, hub), 20_000);
    // Handle for end-to-end tests and the dev tools panel.
    (window as unknown as { __travindiMock?: MockBackend }).__travindiMock = instance;
  }
  return instance;
}
