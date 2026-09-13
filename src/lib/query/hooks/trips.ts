'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import type { ExtractIntentInput } from '@/lib/repositories/trips';
import type { ReplanRequest, TripIntent } from '@/types/domain';
import { queryKeys } from '../keys';

const retryUnlessMissing = (failureCount: number, error: unknown) =>
  isApiError(error) && error.kind !== 'not_found' && error.retryable && failureCount < 3;

export function useTrips(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trips.list,
    queryFn: ({ signal }) => api.trips.list({ signal }),
    enabled,
  });
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: queryKeys.trips.detail(tripId),
    queryFn: ({ signal }) => api.trips.get(tripId, { signal }),
    retry: retryUnlessMissing,
  });
}

export function useItinerary(tripId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trips.itinerary(tripId),
    queryFn: ({ signal }) => api.itineraries.current(tripId, { signal }),
    retry: retryUnlessMissing,
    enabled,
  });
}

export function useItineraryVersions(tripId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trips.versions(tripId),
    queryFn: ({ signal }) => api.itineraries.versions(tripId, { signal }),
    enabled,
  });
}

export function useItineraryVersion(tripId: string, version: number | null) {
  return useQuery({
    queryKey: queryKeys.trips.version(tripId, version ?? 0),
    queryFn: ({ signal }) => api.itineraries.version(tripId, version!, { signal }),
    enabled: version !== null,
    staleTime: Infinity,
  });
}

export function useAdaptations(tripId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trips.adaptations(tripId),
    queryFn: ({ signal }) => api.adaptations.listForTrip(tripId, undefined, { signal }),
    enabled,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { intent: TripIntent; title?: string | null }) => api.trips.create(input),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trips.detail(trip.tripId), trip);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.list });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.home });
    },
  });
}

export function useUpdateTrip(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { title?: string; intent?: TripIntent; basedOnUpdatedAt?: string }) => api.trips.update(tripId, patch),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trips.detail(tripId), trip);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.list });
    },
  });
}

/** Natural language → structured intent. The model runs on the backend; the result is only a proposal. */
export function useExtractIntent() {
  return useMutation({ mutationFn: (input: ExtractIntentInput) => api.trips.extractIntent(input) });
}

export function useStartGeneration(tripId: string | null) {
  return useMutation({ mutationFn: (id?: string) => api.trips.generateItinerary(id ?? tripId!) });
}

/** Polls a generation job until it completes or fails. */
export function useGenerationJob(jobId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.trips.job(jobId ?? 'none'),
    queryFn: async ({ signal }) => {
      const job = await api.trips.generationJob(jobId!, { signal });
      if (job.status === 'completed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(job.tripId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.list });
      }
      return job;
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'completed' || status === 'failed' ? false : 900;
    },
    refetchOnWindowFocus: false,
  });
}

export function useAcceptAdaptation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; basedOnVersion: number; alternativeId?: string | null }) =>
      api.adaptations.accept(input.proposalId, { basedOnVersion: input.basedOnVersion, alternativeId: input.alternativeId ?? null }),
    onSuccess: ({ itinerary }) => {
      queryClient.setQueryData(queryKeys.trips.itinerary(tripId), itinerary);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.adaptations(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.versions(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.home });
    },
    onError: () => {
      // Conflicts and failures change server state (stale/failed); always re-read.
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
    },
  });
}

export function useRejectAdaptation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => api.adaptations.reject(proposalId, 'keep_current'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.adaptations(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.home });
    },
  });
}

export function useReplan(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplanRequest) => api.adaptations.replan(tripId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.trips.adaptations(tripId) }),
  });
}

export function useHomeSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.me.home,
    queryFn: () => api.profile.home(),
    enabled,
  });
}

export function usePlatformMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: () => api.platform.metrics(),
    staleTime: 10 * 60_000,
  });
}
