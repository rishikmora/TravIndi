'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '../keys';

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.chat.conversations,
    queryFn: ({ signal }) => api.chat.conversations({ signal }),
    enabled,
  });
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.chat.conversation(conversationId ?? 'none'),
    queryFn: ({ signal }) => api.chat.conversation(conversationId!, { signal }),
    enabled: Boolean(conversationId),
  });
}

/** Newest page first; `fetchNextPage` loads older history. */
export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.chat.messages(conversationId ?? 'none'),
    queryFn: ({ pageParam, signal }) => api.chat.messages(conversationId!, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(conversationId),
    staleTime: 10_000,
  });
}

export function useMarkRead(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lastReadMessageId: string) => api.chat.markRead(conversationId, lastReadMessageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.list });
    },
  });
}

export function useToggleReaction(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; emoji: string }) => api.chat.toggleReaction(conversationId, input.messageId, input.emoji),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversationId) }),
  });
}
