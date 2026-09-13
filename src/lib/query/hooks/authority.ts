'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthorityIncidentAction, AuthoritySosAction } from '@/types/api';
import { queryKeys } from '../keys';

/* Operational data refreshes on realtime events; the intervals are a fallback, not the primary signal. */

export function useAuthorityOverview() {
  return useQuery({ queryKey: queryKeys.authority.overview, queryFn: ({ signal }) => api.authority.overview({ signal }), refetchInterval: 30_000 });
}

export function useAuthoritySos(status: string[] = []) {
  return useQuery({
    queryKey: queryKeys.authority.sos(status.join(',')),
    queryFn: ({ signal }) => api.authority.sosQueue({ status }, { signal }),
    refetchInterval: 30_000,
  });
}

export function useSosAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { alertId: string; action: AuthoritySosAction; note?: string }) => api.authority.sosAction(input.alertId, input.action, input.note),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['authority', 'sos'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.authority.overview });
    },
  });
}

export function useAuthorityIncidents(filters: { severity?: string[]; status?: string[] } = {}) {
  return useQuery({
    queryKey: queryKeys.authority.incidents(JSON.stringify(filters)),
    queryFn: ({ signal }) => api.authority.incidents(filters, { signal }),
    refetchInterval: 60_000,
  });
}

export function useIncidentAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { incidentId: string; action: AuthorityIncidentAction; note?: string }) => api.authority.incidentAction(input.incidentId, input.action, input.note),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['authority', 'incidents'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.authority.overview });
    },
  });
}

export function useVerifications(status: string[] = []) {
  return useQuery({
    queryKey: queryKeys.authority.verifications(status.join(',')),
    queryFn: ({ signal }) => api.authority.verifications({ status }, { signal }),
  });
}

export function useDecideVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; decision: 'approve' | 'reject' | 'request_info'; note: string }) =>
      api.authority.decideVerification(input.requestId, { decision: input.decision, note: input.note }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['authority', 'verifications'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.authority.overview });
    },
  });
}

export function useAuthorityAnalytics(range: '24h' | '7d' | '30d') {
  return useQuery({ queryKey: queryKeys.authority.analytics(range), queryFn: ({ signal }) => api.authority.analytics(range, { signal }) });
}
