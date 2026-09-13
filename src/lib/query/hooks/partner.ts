'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '../keys';

export function usePartnerDashboard(enabled = true) {
  return useQuery({ queryKey: queryKeys.partner.dashboard, queryFn: ({ signal }) => api.partner.dashboard({ signal }), enabled });
}

function usePartnerMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.partner.dashboard }),
  });
}

export const useUpdatePartnerProfile = () =>
  usePartnerMutation((input: { description?: string; languages?: string[] }) => api.partner.updateProfile(input));

export const useUpdatePartnerService = () =>
  usePartnerMutation((input: { serviceId: string; patch: { name?: string; description?: string; bookable?: boolean } }) =>
    api.partner.updateService(input.serviceId, input.patch),
  );

export const useSetAvailability = () =>
  usePartnerMutation((input: { serviceId: string; date: string; timeSlot: string; capacity: number; status: 'open' | 'closed' }) =>
    api.partner.setAvailability(input),
  );

export const useSubmitKyc = () => usePartnerMutation((documentKinds: string[]) => api.partner.submitKyc({ documentKinds }));

export const useRespondToComplaint = () =>
  usePartnerMutation((input: { complaintId: string; response: string }) => api.partner.respondToComplaint(input.complaintId, input.response));
