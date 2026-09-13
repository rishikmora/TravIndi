'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LocationShare, LocationShareInput } from '@/types/domain';
import { queryKeys } from '../keys';

export function useMyShares(enabled = true) {
  return useQuery({ queryKey: queryKeys.location.mine, queryFn: ({ signal }) => api.location.myShares({ signal }), enabled, refetchInterval: 60_000 });
}

export function useVisibleShares(enabled = true) {
  return useQuery({ queryKey: queryKeys.location.visible, queryFn: ({ signal }) => api.location.visibleShares({ signal }), enabled, refetchInterval: 60_000 });
}

export function useShare(shareId: string | null) {
  return useQuery({
    queryKey: queryKeys.location.share(shareId ?? 'none'),
    queryFn: ({ signal }) => api.location.get(shareId!, { signal }),
    enabled: Boolean(shareId),
    refetchInterval: 30_000,
  });
}

export function useShareHistory(enabled = true) {
  return useQuery({ queryKey: queryKeys.location.history, queryFn: ({ signal }) => api.location.history({ signal }), enabled });
}

function useShareMutation<TInput>(run: (input: TInput) => Promise<LocationShare | { stoppedCount: number }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.location.all }),
  });
}

export const useCreateShare = () => useShareMutation((input: LocationShareInput) => api.location.create(input));
export const usePauseShare = () => useShareMutation((shareId: string) => api.location.pause(shareId));
export const useResumeShare = () => useShareMutation((shareId: string) => api.location.resume(shareId));
export const useExtendShare = () => useShareMutation((input: { shareId: string; minutes: number }) => api.location.extend(input.shareId, input.minutes));
export const useStopShare = () => useShareMutation((shareId: string) => api.location.stop(shareId));
export const useStopAllShares = () => useShareMutation(() => api.location.stopAll());
