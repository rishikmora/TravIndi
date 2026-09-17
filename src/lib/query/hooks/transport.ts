'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CabOptionsQuery, MetroFareQuery, TransportQuoteInput, TransportSearchQuery } from '@/types/domain';

/*
 * Transport lookups. Keys live here rather than in `keys.ts` because nothing
 * else invalidates them; every key starts with `transport`.
 */
export const transportKeys = {
  all: ['transport'] as const,
  places: ['transport', 'places'] as const,
  search: (query: TransportSearchQuery) => ['transport', 'search', query] as const,
  metroNetworks: ['transport', 'metro', 'networks'] as const,
  metroNetwork: (networkId: string) => ['transport', 'metro', 'network', networkId] as const,
  metroFare: (query: MetroFareQuery) => ['transport', 'metro', 'fare', query] as const,
  cabPlaces: (destinationId: string) => ['transport', 'cabs', 'places', destinationId] as const,
  cabOptions: (query: CabOptionsQuery) => ['transport', 'cabs', 'options', query] as const,
};

const TEN_MINUTES = 10 * 60_000;

export function useTransportPlaces(enabled = true) {
  return useQuery({
    queryKey: transportKeys.places,
    queryFn: ({ signal }) => api.transport.places({ signal }),
    staleTime: TEN_MINUTES,
    enabled,
  });
}

/** Departures for a submitted search; idle until `query` is set. Seats change, so results go stale quickly. */
export function useTransportSearch(query: TransportSearchQuery | null) {
  return useQuery({
    queryKey: transportKeys.search(query ?? { category: 'AIRLINE' }),
    queryFn: ({ signal }) => api.transport.search(query!, { signal }),
    enabled: Boolean(query),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useMetroNetworks(enabled = true) {
  return useQuery({
    queryKey: transportKeys.metroNetworks,
    queryFn: ({ signal }) => api.transport.metroNetworks({ signal }),
    staleTime: TEN_MINUTES,
    enabled,
  });
}

export function useMetroNetwork(networkId: string | null) {
  return useQuery({
    queryKey: transportKeys.metroNetwork(networkId ?? 'none'),
    queryFn: ({ signal }) => api.transport.metroNetwork(networkId!, { signal }),
    enabled: Boolean(networkId),
    staleTime: TEN_MINUTES,
  });
}

export function useMetroFare(query: MetroFareQuery | null) {
  return useQuery({
    queryKey: transportKeys.metroFare(query ?? { networkId: '', fromStationId: '', toStationId: '' }),
    queryFn: ({ signal }) => api.transport.metroFare(query!, { signal }),
    enabled: Boolean(query),
    staleTime: 5 * 60_000,
  });
}

export function useCabPlaces(destinationId: string | null) {
  return useQuery({
    queryKey: transportKeys.cabPlaces(destinationId ?? 'none'),
    queryFn: ({ signal }) => api.transport.cabPlaces(destinationId!, { signal }),
    enabled: Boolean(destinationId),
    staleTime: TEN_MINUTES,
  });
}

export function useCabOptions(query: CabOptionsQuery | null) {
  return useQuery({
    queryKey: transportKeys.cabOptions(query ?? { destinationId: '', date: '', time: '', passengers: 1 }),
    queryFn: ({ signal }) => api.transport.cabOptions(query!, { signal }),
    enabled: Boolean(query),
    staleTime: 60_000,
  });
}

/** Sign-in required. Confirm the returned quote with `useCreateBooking`. */
export function useTransportQuote() {
  return useMutation({ mutationFn: (input: TransportQuoteInput) => api.transport.quote(input) });
}
