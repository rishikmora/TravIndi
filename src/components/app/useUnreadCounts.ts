'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/provider';
import { queryKeys } from '@/lib/query/keys';

/** Badge counts for the navigation. Zero when signed out; realtime events keep them fresh. */
export function useUnreadCounts() {
  const { status } = useAuth();
  const enabled = status === 'authenticated';

  const notifications = useQuery({
    queryKey: queryKeys.notifications.list(true),
    queryFn: () => api.notifications.list({ unreadOnly: true }),
    enabled,
    staleTime: 60_000,
  });

  const conversations = useQuery({
    queryKey: queryKeys.chat.conversations,
    queryFn: () => api.chat.conversations(),
    enabled,
    staleTime: 30_000,
  });

  return {
    notifications: enabled && notifications.data ? (notifications.data.total ?? notifications.data.items.length) : 0,
    messages: enabled && conversations.data ? conversations.data.filter((c) => !c.muted).reduce((sum, c) => sum + c.unreadCount, 0) : 0,
  };
}
