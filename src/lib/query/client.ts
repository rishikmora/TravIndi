import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/errors';

const MAX_QUERY_RETRIES = 3;

/**
 * Query defaults:
 *  - Only retryable failures (network, timeout, 429, 5xx) are retried, with backoff
 *    that honours `Retry-After`.
 *  - Mutations never retry automatically: irreversible actions are retried only
 *    by explicit user intent or through an idempotent outbox.
 *  - A 401 anywhere reports the session as unauthorised exactly once.
 */
export function createQueryClient(onUnauthorized: () => void) {
  const handleError = (error: unknown) => {
    if (isApiError(error) && error.kind === 'unauthorized') onUnauthorized();
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => isApiError(error) && error.retryable && failureCount < MAX_QUERY_RETRIES,
        retryDelay: (attempt, error) => {
          if (isApiError(error) && error.retryAfterSeconds) return error.retryAfterSeconds * 1000;
          return Math.min(1000 * 2 ** attempt, 15_000);
        },
      },
      mutations: {
        retry: false,
        // Fail fast when offline instead of silently pausing an action the user thinks happened.
        networkMode: 'always',
      },
    },
  });
}
