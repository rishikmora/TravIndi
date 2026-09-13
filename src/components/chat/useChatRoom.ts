'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { camelizeKeys } from '@/lib/api/case';
import { ApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { isBrowserOnline } from '@/lib/offline/connectivity';
import { useConversation, useMarkRead, useMessages } from '@/lib/query/hooks/chat';
import { queryKeys } from '@/lib/query/keys';
import { useChannel, useRealtimeClient, useRealtimeEvents } from '@/lib/realtime/provider';
import type { Message, MessageCard, Page } from '@/types/domain';
import type { MessageType } from '@/types/api';

export type LocalMessage = Omit<Message, 'status'> & {
  delivery: 'local';
  status: 'sending' | 'failed';
  error: unknown;
};

export type RoomMessage = (Message & { delivery: 'server' }) | LocalMessage;

type MessagesData = InfiniteData<Page<Message>, string | null>;

function upsert(data: MessagesData | undefined, message: Message): MessagesData | undefined {
  if (!data || data.pages.length === 0) return data;
  const exists = data.pages.some((page) => page.items.some((m) => m.messageId === message.messageId));
  if (exists) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        // Keep the per-viewer status we already have; realtime copies are viewer-neutral.
        items: page.items.map((m) => (m.messageId === message.messageId ? { ...message, status: m.status, reactions: message.reactions.map((r) => ({ ...r, reactedByMe: m.reactions.find((x) => x.emoji === r.emoji)?.reactedByMe ?? false })) } : m)),
      })),
    };
  }
  const [first, ...rest] = data.pages;
  return { ...data, pages: [{ ...first!, items: [message, ...first!.items] }, ...rest] };
}

export interface SendInput {
  content: string;
  messageType: MessageType;
  card?: MessageCard | null;
  replyToId?: string | null;
}

export function useChatRoom(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const markRead = useMarkRead(conversationId);
  const [locals, setLocals] = useState<Map<string, LocalMessage>>(new Map());
  const [typing, setTyping] = useState<Map<string, string>>(new Map());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const key = queryKeys.chat.messages(conversationId);

  useChannel(`conversation:${conversationId}`);

  const clearLocal = useCallback((clientMessageId: string | null) => {
    if (!clientMessageId) return;
    setLocals((current) => {
      if (!current.has(clientMessageId)) return current;
      const next = new Map(current);
      next.delete(clientMessageId);
      return next;
    });
  }, []);

  useRealtimeEvents((event) => {
    switch (event.name) {
      case 'message.created':
      case 'message.updated': {
        if (event.payload.message.conversation_id !== conversationId) return;
        const message = camelizeKeys(event.payload.message) as Message;
        queryClient.setQueryData<MessagesData>(key, (data) => upsert(data, message));
        if (message.senderId === user?.userId) clearLocal(message.clientMessageId);
        setTyping((current) => {
          if (!current.has(message.senderId)) return current;
          const next = new Map(current);
          next.delete(message.senderId);
          return next;
        });
        return;
      }
      case 'message.read':
        if (event.payload.conversation_id === conversationId && event.payload.user_id !== user?.userId) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        return;
      case 'typing.started':
      case 'typing.stopped': {
        const { conversation_id, user_id } = event.payload;
        if (conversation_id !== conversationId || user_id === user?.userId) return;
        clearTimeout(typingTimers.current.get(user_id));
        setTyping((current) => {
          const next = new Map(current);
          if (event.name === 'typing.started') next.set(user_id, event.payload.display_name);
          else next.delete(user_id);
          return next;
        });
        if (event.name === 'typing.started') {
          typingTimers.current.set(
            user_id,
            setTimeout(() => setTyping((current) => {
              const next = new Map(current);
              next.delete(user_id);
              return next;
            }), 6000),
          );
        }
        return;
      }
      default:
    }
  });

  useEffect(() => {
    const timers = typingTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const serverMessages = useMemo(
    () => (messages.data ? messages.data.pages.flatMap((page) => page.items).slice().reverse() : []),
    [messages.data],
  );

  const list: RoomMessage[] = useMemo(() => {
    const confirmed = new Set(serverMessages.map((m) => m.clientMessageId).filter(Boolean));
    return [
      ...serverMessages.map((m) => ({ ...m, delivery: 'server' as const })),
      ...[...locals.values()].filter((m) => !confirmed.has(m.clientMessageId)),
    ];
  }, [serverMessages, locals]);

  // Mark as read when the newest message is from someone else and the page is visible.
  const newest = serverMessages[serverMessages.length - 1];
  const lastMarked = useRef<string | null>(null);
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (!newest || newest.senderId === user?.userId || lastMarked.current === newest.messageId) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      lastMarked.current = newest.messageId;
      markReadMutate(newest.messageId);
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [newest, user?.userId, markReadMutate]);

  const send = useCallback(
    async (input: SendInput, retryOf?: LocalMessage) => {
      if (!user) return;
      const clientMessageId = retryOf?.clientMessageId ?? crypto.randomUUID();
      const local: LocalMessage = retryOf
        ? { ...retryOf, status: 'sending', error: null }
        : {
            delivery: 'local',
            messageId: `local-${clientMessageId}`,
            clientMessageId,
            conversationId,
            senderId: user.userId,
            senderName: user.displayName,
            content: input.content,
            messageType: input.messageType,
            card: input.card ?? null,
            attachment: null,
            replyTo: null,
            reactions: [],
            createdAt: new Date().toISOString(),
            editedAt: null,
            deletedAt: null,
            status: 'sending',
            error: null,
          };
      setLocals((current) => new Map(current).set(clientMessageId, local));
      realtime?.sendTyping(conversationId, 'stopped');

      if (!isBrowserOnline()) {
        const offline = new ApiError({ kind: 'network', message: 'You’re offline.' });
        setLocals((current) => new Map(current).set(clientMessageId, { ...local, status: 'failed', error: offline }));
        return;
      }
      try {
        const message = await api.chat.send(conversationId, {
          clientMessageId,
          content: local.content,
          messageType: local.messageType,
          card: local.card,
          replyToId: input.replyToId ?? null,
        });
        queryClient.setQueryData<MessagesData>(key, (data) => upsert(data, message));
        clearLocal(clientMessageId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      } catch (error) {
        setLocals((current) => new Map(current).set(clientMessageId, { ...local, status: 'failed', error }));
      }
    },
    [user, conversationId, queryClient, key, clearLocal, realtime],
  );

  const retry = useCallback((message: LocalMessage) => void send({ content: message.content, messageType: message.messageType, card: message.card }, message), [send]);

  const discard = useCallback((message: LocalMessage) => clearLocal(message.clientMessageId), [clearLocal]);

  /** Throttled typing signal while composing. */
  const notifyTyping = useCallback(() => {
    if (!realtime || Date.now() - lastTypingSent.current < 3000) return;
    lastTypingSent.current = Date.now();
    realtime.sendTyping(conversationId, 'started');
  }, [realtime, conversationId]);

  return {
    conversation,
    messages,
    list,
    typing: [...typing.values()],
    send,
    retry,
    discard,
    notifyTyping,
    currentUserId: user?.userId ?? null,
  };
}
