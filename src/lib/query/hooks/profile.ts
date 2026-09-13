'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProfileUpdate } from '@/types/domain';
import { queryKeys } from '../keys';

export function useProfile(enabled = true) {
  return useQuery({ queryKey: queryKeys.me.profile, queryFn: () => api.profile.get(), enabled });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => api.profile.update(patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me.profile, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useConsents(enabled = true) {
  return useQuery({ queryKey: queryKeys.me.consents, queryFn: () => api.profile.consents(), enabled });
}

export function useUpdateConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { consentId: string; granted: boolean }) => api.profile.updateConsent(input.consentId, input.granted),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.consents });
      // Withdrawing location consent ends active shares on the server.
      void queryClient.invalidateQueries({ queryKey: queryKeys.location.all });
    },
  });
}

export function useDataRequests(enabled = true) {
  return useQuery({ queryKey: queryKeys.me.dataRequests, queryFn: () => api.profile.dataRequests(), enabled });
}

export function useCreateDataRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: 'export' | 'deletion') => api.profile.createDataRequest(kind),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me.dataRequests }),
  });
}
