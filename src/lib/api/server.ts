import { cache } from 'react';
import { env } from '@/lib/config/env';
import { createRepositoryClient } from '@/lib/repositories/client';
import { createDestinationRepository } from '@/lib/repositories/destinations';
import type { Destination, DestinationSummary, Page } from '@/types/domain';
import { camelizeKeys } from './case';
import { isApiError } from './errors';
import { createFetchTransport } from './fetch-transport';

/*
 * Server-side reads of public, unauthenticated data for SEO pages. Never used
 * for private data: no credentials or cookies are forwarded from here.
 * In mock mode the same contract is served from the static catalogue.
 */

function publicDestinations() {
  const transport = createFetchTransport({ baseUrl: env.apiBaseUrl, authMode: 'bearer', timeoutMs: 8000 });
  return createDestinationRepository(createRepositoryClient(transport));
}

/** Cached per request, so metadata and the page share one lookup. */
export const getPublicDestination = cache(async (slug: string): Promise<Destination | null> => {
  if (env.dataMode === 'mock') {
    const { destinationDetail } = await import('@/lib/mock-backend/catalog/destinations');
    const detail = destinationDetail(slug);
    return detail ? (camelizeKeys(detail) as Destination) : null;
  }
  try {
    return await publicDestinations().get(slug);
  } catch (error) {
    if (isApiError(error) && error.kind === 'not_found') return null;
    throw error;
  }
});

export async function listPublicDestinations(limit = 60): Promise<Page<DestinationSummary>> {
  if (env.dataMode === 'mock') {
    const [{ allDestinationSummaries }, { popularDestinations }] = await Promise.all([
      import('@/lib/mock-backend/catalog/destinations'),
      import('@/data/destinations'),
    ]);
    const order = new Map(popularDestinations.map((d, i) => [d.slug, i]));
    const items = allDestinationSummaries().sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
    return { items: camelizeKeys(items.slice(0, limit)) as DestinationSummary[], nextCursor: items.length > limit ? String(limit) : null, total: items.length };
  }
  return publicDestinations().list({ limit });
}
