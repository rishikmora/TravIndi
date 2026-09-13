'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DestinationListQuery } from '@/lib/repositories/destinations';
import type { SearchResultType } from '@/types/api';
import type { CommunityPostInput } from '@/types/domain';
import { queryKeys } from '../keys';

export function useDestinations(params: DestinationListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.destinations.list({ ...params }),
    queryFn: ({ signal }) => api.destinations.list(params, { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useDestination(slug: string) {
  return useQuery({
    queryKey: queryKeys.destinations.detail(slug),
    queryFn: ({ signal }) => api.destinations.get(slug, { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Typed search. Callers debounce `q`; previous results stay visible while the next arrive. */
export function useSearch(q: string, types?: SearchResultType[]) {
  const query = q.trim();
  return useQuery({
    queryKey: queryKeys.search(query, types?.join(',') ?? ''),
    queryFn: ({ signal }) => api.destinations.search(query, types, { signal }),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useCommunityChannels(destinationId: string | null) {
  return useQuery({
    queryKey: queryKeys.destinations.channels(destinationId ?? 'none'),
    queryFn: () => api.destinations.communityChannels(destinationId!),
    enabled: Boolean(destinationId),
  });
}

export function useCommunityPosts(channelId: string | null) {
  return useQuery({
    queryKey: queryKeys.destinations.posts(channelId ?? 'none'),
    queryFn: () => api.destinations.communityPosts(channelId!),
    enabled: Boolean(channelId),
  });
}

export function useCreateCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CommunityPostInput) => api.destinations.createCommunityPost(input),
    onSuccess: (post) => void queryClient.invalidateQueries({ queryKey: queryKeys.destinations.posts(post.channelId) }),
  });
}

export function useToggleHelpful(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.destinations.toggleHelpful(postId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.destinations.posts(channelId) }),
  });
}
