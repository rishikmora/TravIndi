'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextInput } from '@/components/ui/Field';
import { ChevronLeftIcon, LocateIcon, MapPinIcon, SendIcon, UsersIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { useConnectivity } from '@/lib/offline/connectivity';
import { useToggleReaction } from '@/lib/query/hooks/chat';
import { getCurrentPosition, GeolocationError } from '@/lib/location/geolocation';
import { toast } from '@/lib/ui/toast';
import { cn } from '@/utils/cn';
import { MessageBubble } from './MessageBubble';
import { useChatRoom } from './useChatRoom';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

interface ChatRoomProps {
  conversationId: string;
  backHref?: string;
  /** Link for starting a live location share from this conversation. */
  liveLocationHref?: string;
  className?: string;
}

export function ChatRoom({ conversationId, backHref, liveLocationHref, className }: ChatRoomProps) {
  const room = useChatRoom(conversationId);
  const react = useToggleReaction(conversationId);
  const online = useConnectivity((s) => s.online);
  const [draft, setDraft] = useState('');
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingLabel, setMeetingLabel] = useState('');
  const [locating, setLocating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // Keep the newest message in view when the reader is already near the bottom.
  useEffect(() => {
    const list = listRef.current;
    if (!list || room.list.length === lastCount.current) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160 || lastCount.current === 0;
    lastCount.current = room.list.length;
    if (nearBottom) endRef.current?.scrollIntoView({ block: 'end' });
  }, [room.list.length]);

  const conversation = room.conversation.data;
  const canPost = conversation?.permissions.canPost ?? false;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    void room.send({ content, messageType: 'text' });
  };

  const shareCurrentLocation = async (asMeetingPoint: boolean) => {
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      if (asMeetingPoint) {
        await room.send({
          content: '',
          messageType: 'meeting_point',
          card: { cardType: 'meeting_point', label: meetingLabel.trim(), latitude: position.lat, longitude: position.lng, meetAt: null },
        });
        setMeetingOpen(false);
        setMeetingLabel('');
      } else {
        await room.send({
          content: '',
          messageType: 'location',
          card: { cardType: 'location', latitude: position.lat, longitude: position.lng, accuracy: position.accuracy, label: null, recordedAt: position.recordedAt },
        });
      }
    } catch (error) {
      toast.error('Couldn’t get your location', error instanceof GeolocationError ? error.message : undefined);
    } finally {
      setLocating(false);
    }
  };

  if (room.conversation.isError) {
    return <ErrorState error={room.conversation.error} context="chat.load" onRetry={() => void room.conversation.refetch()} />;
  }

  return (
    <section aria-label={conversation ? `Conversation: ${conversation.title}` : 'Conversation'} className={cn('surface-card flex min-h-[32rem] flex-col overflow-hidden', className)}>
      <header className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
        {backHref && (
          <Link href={backHref} className="tap-target -ml-2 inline-flex items-center justify-center rounded-full hover:bg-[var(--tone-neutral-bg)]" aria-label="Back to messages">
            <ChevronLeftIcon size={20} />
          </Link>
        )}
        {conversation ? (
          <>
            <Avatar name={conversation.title} size="md" decorative />
            <div className="grid min-w-0 flex-1">
              <h2 className="truncate font-semibold">{conversation.title}</h2>
              <p className="flex items-center gap-1 text-[0.8125rem] text-[var(--text-muted)]">
                <UsersIcon size={14} aria-hidden="true" />
                {conversation.kind === 'community' ? 'Community · be kind, share what you know' : `${conversation.membersCount} ${conversation.membersCount === 1 ? 'member' : 'members'}`}
              </p>
            </div>
          </>
        ) : (
          <Skeleton className="h-10 w-48" />
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5" data-lenis-prevent>
        {room.messages.isPending ? (
          <LoadingBlock label="Loading messages" className="grid gap-3">
            <Skeleton className="h-12 w-2/3 rounded-3xl" />
            <Skeleton className="ml-auto h-12 w-1/2 rounded-3xl" />
            <Skeleton className="h-16 w-3/5 rounded-3xl" />
          </LoadingBlock>
        ) : room.messages.isError ? (
          <ErrorState error={room.messages.error} context="chat.load" onRetry={() => void room.messages.refetch()} compact />
        ) : room.list.length === 0 ? (
          <EmptyState title="No messages yet" description="Say hello, share a meeting point or a place from your itinerary." />
        ) : (
          <>
            {room.messages.hasNextPage && (
              <div className="mb-4 flex justify-center">
                <Button variant="subtle" size="sm" onClick={() => void room.messages.fetchNextPage()} loading={room.messages.isFetchingNextPage}>
                  Load earlier messages
                </Button>
              </div>
            )}
            <ol role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions" className="grid gap-3">
              {room.list.map((message, index) => {
                const previous = room.list[index - 1];
                const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                const own = message.senderId === room.currentUserId;
                return (
                  <FragmentWithDay key={message.messageId} label={newDay ? dayLabel(message.createdAt) : null}>
                    <MessageBubble
                      message={message}
                      own={own}
                      showSender={conversation?.kind !== 'direct' && (newDay || previous?.senderId !== message.senderId)}
                      onRetry={room.retry}
                      onDiscard={room.discard}
                      onReact={(messageId, emoji) => react.mutate({ messageId, emoji })}
                    />
                  </FragmentWithDay>
                );
              })}
            </ol>
          </>
        )}
        <div ref={endRef} />
      </div>

      <p aria-live="polite" className="min-h-6 px-5 text-[0.8125rem] italic text-[var(--text-muted)]">
        {room.typing.length === 1 ? `${room.typing[0]} is typing…` : room.typing.length > 1 ? 'Several people are typing…' : ''}
      </p>

      <footer className="border-t border-[var(--hairline)] p-3">
        {!online && (
          <InlineNotice tone="warning" className="mb-3" title="You’re offline">
            Messages can’t be sent until you reconnect. Anything you send now will show as not sent.
          </InlineNotice>
        )}
        {conversation && !canPost ? (
          <p className="px-2 py-3 text-center text-[0.9375rem] text-[var(--text-muted)]">You can read this conversation but can’t post in it.</p>
        ) : (
          <form onSubmit={submit} className="flex items-end gap-2">
            <div className="flex shrink-0 gap-1">
              <Button variant="subtle" iconOnly size="md" aria-label="Share where I am now (not live)" onClick={() => void shareCurrentLocation(false)} disabled={locating || !conversation}>
                <MapPinIcon size={18} />
              </Button>
              <Button variant="subtle" iconOnly size="md" aria-label="Share a meeting point" onClick={() => setMeetingOpen(true)} disabled={!conversation} className="hidden sm:inline-flex">
                <UsersIcon size={18} />
              </Button>
              {liveLocationHref && conversation?.permissions.canShareLocation && (
                <Link href={liveLocationHref} aria-label="Share live location" className="tap-target hidden items-center justify-center rounded-full bg-[var(--tone-neutral-bg)] hover:bg-[var(--hairline)] sm:inline-flex">
                  <LocateIcon size={18} />
                </Link>
              )}
            </div>
            <label htmlFor={`composer-${conversationId}`} className="sr-only">
              Message
            </label>
            <textarea
              id={`composer-${conversationId}`}
              value={draft}
              rows={1}
              maxLength={4000}
              onChange={(event) => {
                setDraft(event.target.value);
                room.notifyTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
              }}
              placeholder="Write a message"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl bg-[var(--surface-sunken)] px-4 py-2.5 text-[1rem] ring-1 ring-inset ring-[var(--hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            />
            <Button type="submit" variant="navy" iconOnly aria-label="Send message" disabled={!draft.trim()}>
              <SendIcon size={18} />
            </Button>
          </form>
        )}
      </footer>

      <Dialog
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        title="Share a meeting point"
        description="Uses where you are now. Everyone in this conversation will see it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setMeetingOpen(false)}>
              Cancel
            </Button>
            <Button variant="navy" loading={locating} disabled={meetingLabel.trim().length < 2} onClick={() => void shareCurrentLocation(true)}>
              Share meeting point
            </Button>
          </>
        }
      >
        <Field label="Name this spot" hint="e.g. Main gate, by the ticket counter">
          {(control) => <TextInput {...control} value={meetingLabel} maxLength={80} onChange={(e) => setMeetingLabel(e.target.value)} />}
        </Field>
      </Dialog>
    </section>
  );
}

function FragmentWithDay({ label, children }: { label: string | null; children: React.ReactNode }) {
  return (
    <>
      {label && (
        <li aria-hidden="true" className="my-2 flex items-center gap-3 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          <span className="h-px flex-1 bg-[var(--hairline)]" />
          {label}
          <span className="h-px flex-1 bg-[var(--hairline)]" />
        </li>
      )}
      {children}
    </>
  );
}
