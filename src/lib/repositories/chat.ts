import { endpoints } from '@/lib/api/endpoints';
import type { ConversationDto, MessageDto, PageDto } from '@/types/api';
import type { Conversation, Message, Page, SendMessageInput } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface ChatRepository {
  conversations(options?: RequestOptions): Promise<Conversation[]>;
  conversation(conversationId: string, options?: RequestOptions): Promise<Conversation>;
  /** Newest first. Pass `before` (a cursor) to load older history. */
  messages(conversationId: string, before?: string | null, options?: RequestOptions): Promise<Page<Message>>;
  /** Idempotent on `clientMessageId` — retries never duplicate a message. */
  send(conversationId: string, input: SendMessageInput): Promise<Message>;
  markRead(conversationId: string, lastReadMessageId: string): Promise<void>;
  toggleReaction(conversationId: string, messageId: string, emoji: string): Promise<Message>;
}

export function createChatRepository(client: RepositoryClient): ChatRepository {
  return {
    conversations: async (options) =>
      (await client.get<{ items: ConversationDto[] }>(endpoints.chat.conversations, undefined, options)).items,
    conversation: (conversationId, options) =>
      client.get<ConversationDto>(endpoints.chat.conversation(conversationId), undefined, options),
    messages: (conversationId, before, options) =>
      client.get<PageDto<MessageDto>>(
        endpoints.chat.messages(conversationId),
        { before: before ?? undefined, limit: 30 },
        options,
      ),
    send: (conversationId, input) =>
      client.post<MessageDto>(endpoints.chat.messages(conversationId), input, {
        idempotencyKey: input.clientMessageId,
      }),
    markRead: (conversationId, lastReadMessageId) =>
      client.post<void>(endpoints.chat.read(conversationId), { lastReadMessageId }),
    toggleReaction: (conversationId, messageId, emoji) =>
      client.post<MessageDto>(endpoints.chat.reactions(conversationId, messageId), { emoji }),
  };
}
