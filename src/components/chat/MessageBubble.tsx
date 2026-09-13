'use client';

import { useState } from 'react';
import { describeError } from '@/lib/api/error-messages';
import { cn } from '@/utils/cn';
import { MessageCardView } from './MessageCardView';
import type { LocalMessage, RoomMessage } from './useChatRoom';

const REACTIONS = ['👍', '❤️', '😄', '🙏', '🎉', '😮'];

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

const STATUS_LABEL = { sending: 'Sending…', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Not sent' } as const;

interface MessageBubbleProps {
  message: RoomMessage;
  own: boolean;
  showSender: boolean;
  onRetry: (message: LocalMessage) => void;
  onDiscard: (message: LocalMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
}

export function MessageBubble({ message, own, showSender, onRetry, onDiscard, onReact }: MessageBubbleProps) {
  const [picking, setPicking] = useState(false);

  if (message.messageType === 'system') {
    return <li className="py-2 text-center text-[0.8125rem] text-[var(--text-muted)]">{message.content}</li>;
  }

  const failed = message.delivery === 'local' && message.status === 'failed';
  const status = STATUS_LABEL[message.status];
  const canReact = message.delivery === 'server' && !message.deletedAt;

  return (
    <li className={cn('group flex flex-col gap-1', own ? 'items-end' : 'items-start')}>
      {showSender && !own && <span className="px-3 text-[0.8125rem] font-medium text-[var(--text-muted)]">{message.senderName}</span>}
      <div
        className={cn(
          'grid max-w-[min(34rem,85%)] gap-2 rounded-3xl px-4 py-2.5',
          own ? 'rounded-br-lg bg-navy text-ivory' : 'rounded-bl-lg bg-[var(--surface-raised)] ring-1 ring-inset ring-[var(--hairline)]',
          failed && 'ring-2 ring-[var(--color-danger)]',
          message.delivery === 'local' && message.status === 'sending' && 'opacity-75',
        )}
      >
        <span className="sr-only">{own ? 'You' : message.senderName}: </span>
        {message.deletedAt ? (
          <p className="italic opacity-70">Message deleted</p>
        ) : (
          <>
            {message.content && <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{message.content}</p>}
            {message.card && <MessageCardView card={message.card} own={own} />}
          </>
        )}
      </div>

      <div className={cn('flex flex-wrap items-center gap-2 px-2 text-[0.75rem] text-[var(--text-subtle)]', own && 'justify-end')}>
        <time dateTime={message.createdAt}>{clock(message.createdAt)}</time>
        {own && <span className={cn('font-mono uppercase tracking-[0.06em]', failed && 'font-semibold text-[var(--tone-danger-fg)]')}>{status}</span>}
        {failed && (
          <>
            <span className="text-[var(--text-muted)]">{describeError(message.error, 'chat.send').message}</span>
            <button type="button" onClick={() => onRetry(message)} className="font-semibold text-[var(--link)] underline underline-offset-2">
              Retry
            </button>
            <button type="button" onClick={() => onDiscard(message)} className="text-[var(--text-muted)] underline underline-offset-2">
              Discard
            </button>
          </>
        )}
      </div>

      {(message.reactions.length > 0 || canReact) && (
        <div className={cn('flex flex-wrap items-center gap-1 px-1', own && 'justify-end')}>
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              disabled={!canReact}
              onClick={() => onReact(message.messageId, reaction.emoji)}
              aria-pressed={reaction.reactedByMe}
              aria-label={`${reaction.emoji} ${reaction.count}${reaction.reactedByMe ? ', including you' : ''}`}
              className={cn('inline-flex h-7 items-center gap-1 rounded-full px-2 text-[0.8125rem] ring-1 ring-inset', reaction.reactedByMe ? 'bg-[var(--tone-accent-bg)] ring-terracotta/40' : 'bg-[var(--surface-raised)] ring-[var(--hairline)]')}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              <span aria-hidden="true" className="tabular-nums">
                {reaction.count}
              </span>
            </button>
          ))}
          {canReact && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPicking((open) => !open)}
                aria-expanded={picking}
                className="inline-flex h-7 items-center rounded-full px-2 text-[0.75rem] text-[var(--text-subtle)] opacity-100 ring-1 ring-inset ring-transparent hover:ring-[var(--hairline)] md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
              >
                React
              </button>
              {picking && (
                <div role="group" aria-label="Choose a reaction" className={cn('absolute bottom-8 z-10 flex gap-1 rounded-full bg-[var(--surface-raised)] p-1 shadow-lg ring-1 ring-[var(--hairline)]', own ? 'right-0' : 'left-0')}>
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(message.messageId, emoji);
                        setPicking(false);
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-full text-[1.125rem] hover:bg-[var(--tone-neutral-bg)]"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
