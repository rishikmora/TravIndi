'use client';

import Link from 'next/link';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { MessageIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format/freshness';
import { useConversations } from '@/lib/query/hooks/chat';
import type { Conversation } from '@/types/domain';
import { cn } from '@/utils/cn';

const CARD_PREVIEW: Record<string, string> = {
  place: 'Shared a place',
  itinerary_item: 'Shared an itinerary stop',
  location: 'Shared a location',
  live_location: 'Shared live location',
  meeting_point: 'Shared a meeting point',
  attachment: 'Sent an attachment',
};

function preview(conversation: Conversation) {
  const last = conversation.lastMessage;
  if (!last) return 'No messages yet';
  if (last.deletedAt) return 'Message deleted';
  const body = last.content || CARD_PREVIEW[last.messageType] || '';
  return conversation.kind === 'direct' ? body : `${last.senderName.split(' ')[0]}: ${body}`;
}

function ConversationRow({ conversation, now }: { conversation: Conversation; now: number }) {
  const unread = conversation.unreadCount;
  return (
    <li>
      <Link href={`/messages/${conversation.conversationId}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]">
        <Avatar name={conversation.title} size="md" decorative />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('truncate', unread ? 'font-semibold' : 'font-medium')}>{conversation.title}</span>
            {now > 0 && conversation.lastMessage && (
              <span className="shrink-0 text-[0.75rem] text-[var(--text-subtle)]">{relativeTime(conversation.lastMessage.createdAt, now)}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={cn('truncate text-[0.875rem]', unread ? 'text-[var(--text)]' : 'text-[var(--text-muted)]')}>{preview(conversation)}</span>
            {unread > 0 && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-terracotta px-1.5 text-[0.6875rem] font-bold text-white">
                {unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
            {conversation.muted && unread === 0 && <span className="shrink-0 text-[0.75rem] text-[var(--text-subtle)]">Muted</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function ConversationGroup({ title, description, items, now }: { title: string; description: string; items: Conversation[]; now: number }) {
  if (items.length === 0) return null;
  return (
    <Section title={title} description={description} level={2}>
      <ul className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
        {items.map((conversation) => (
          <ConversationRow key={conversation.conversationId} conversation={conversation} now={now} />
        ))}
      </ul>
    </Section>
  );
}

function Conversations() {
  const now = useNow();
  const conversations = useConversations();

  if (conversations.isPending) {
    return (
      <LoadingBlock label="Loading conversations" className="grid gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </LoadingBlock>
    );
  }
  if (conversations.isError) {
    return <ErrorState error={conversations.error} context="chat.load" onRetry={() => void conversations.refetch()} retrying={conversations.isFetching} />;
  }
  if (conversations.data.length === 0) {
    return (
      <EmptyState
        icon={<MessageIcon />}
        title="No conversations yet"
        description="Trip chats appear here when you plan or join a trip. You can also message verified guides from their profile."
        className="surface-card"
      />
    );
  }

  const byKind = (kind: Conversation['kind']) => conversations.data.filter((c) => c.kind === kind);
  return (
    <div className="grid gap-10">
      <ConversationGroup title="Trips" description="Everyone travelling together." items={byKind('trip')} now={now} />
      <ConversationGroup title="Direct messages" description="Guides, hosts and friends." items={byKind('direct')} now={now} />
      <ConversationGroup title="Community" description="Travellers and locals for the places you’re visiting." items={byKind('community')} now={now} />
    </div>
  );
}

export function MessagesScreen() {
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Messages" title="Conversations" description="Trip chats, direct messages and community channels in one place." />
      <RequireAuth description="Your conversations are private to the people in them.">
        <Conversations />
      </RequireAuth>
    </PageShell>
  );
}

export function ConversationScreen({ conversationId, children }: { conversationId: string; children: React.ReactNode }) {
  return (
    <PageShell width="default">
      <RequireAuth description="Your conversations are private to the people in them.">
        <div data-conversation={conversationId}>{children}</div>
      </RequireAuth>
    </PageShell>
  );
}
