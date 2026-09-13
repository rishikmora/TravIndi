'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GeoPoint, IncidentReportInput, SosAlert, TrustedContactInput } from '@/types/domain';
import { queryKeys } from '../keys';

export function useSafetyContext(input: { point?: GeoPoint | null; tripId?: string | null }) {
  const lat = input.point ? Math.round(input.point.lat * 1000) / 1000 : null;
  const lng = input.point ? Math.round(input.point.lng * 1000) / 1000 : null;
  return useQuery({
    queryKey: queryKeys.safety.context(lat, lng, input.tripId ?? null),
    queryFn: ({ signal }) => api.safety.context({ point: lat !== null && lng !== null ? { lat, lng } : null, tripId: input.tripId }, { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useIncidents(input: { tripId?: string | null; mine?: boolean }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.safety.incidents(input.tripId ?? null, Boolean(input.mine)),
    queryFn: ({ signal }) => api.safety.incidents(input, { signal }),
    enabled,
  });
}

export function useReportIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentReportInput) => api.safety.reportIncident(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.safety.all }),
  });
}

export function useTrustedContacts(enabled = true) {
  return useQuery({ queryKey: queryKeys.safety.trustedContacts, queryFn: ({ signal }) => api.safety.trustedContacts({ signal }), enabled });
}

export function useAddTrustedContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TrustedContactInput) => api.safety.addTrustedContact(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.safety.trustedContacts }),
  });
}

export function useUpdateTrustedContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; patch: Partial<TrustedContactInput> }) => api.safety.updateTrustedContact(input.contactId, input.patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.safety.trustedContacts }),
  });
}

export function useRemoveTrustedContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => api.safety.removeTrustedContact(contactId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.safety.trustedContacts }),
  });
}

export function useCheckIns(tripId: string | null, enabled = true) {
  return useQuery({ queryKey: queryKeys.safety.checkIns(tripId), queryFn: () => api.safety.checkIns(tripId), enabled });
}

export function useScheduleCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tripId: string | null; dueAt: string; note: string | null }) => api.safety.scheduleCheckIn(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['safety', 'check-ins'] }),
  });
}

export function useCompleteCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (checkInId: string) => api.safety.completeCheckIn(checkInId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['safety', 'check-ins'] }),
  });
}

export function useActiveSos(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sos.active,
    queryFn: ({ signal }) => api.sos.active({ signal }),
    enabled,
    // Realtime pushes updates; polling is a slow fallback while an alert is open.
    refetchInterval: (query) => ((query.state.data as SosAlert | null | undefined) ? 20_000 : false),
  });
}

/** A specific alert, kept current by `sos.updated` realtime events. */
export function useSosAlert(alertId: string | null) {
  return useQuery({
    queryKey: queryKeys.sos.detail(alertId ?? 'none'),
    queryFn: ({ signal }) => api.sos.get(alertId!, { signal }),
    enabled: Boolean(alertId),
    refetchInterval: (query) => {
      const status = (query.state.data as SosAlert | undefined)?.status;
      return status === 'resolved' || status === 'cancelled' ? false : 20_000;
    },
  });
}

export function useCancelSos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => api.sos.cancel(alertId),
    onSuccess: (alert) => {
      queryClient.setQueryData(queryKeys.sos.detail(alert.alertId), alert);
      queryClient.setQueryData(queryKeys.sos.active, null);
    },
  });
}
