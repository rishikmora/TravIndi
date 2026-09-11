"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type ChatMessage, type Conversation } from "@/lib/api";
import { useRealtimeConnection, type RealtimeEvent } from "@/lib/realtime/useRealtimeConnection";
import { ArrowRightIcon, CloseIcon, UsersIcon } from "@/components/icons";
import { Skeleton } from "@/components/Skeleton";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮"];
const TYPING_IDLE_MS = 2500;

function conversationTitle(conv: Conversation): string {
  if (conv.title) return conv.title;
  if (conv.type === "DIRECT") return "Direct message";
  return conv.type === "TRIP" ? "Trip chat" : "Group chat";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function MessageRow({
  message,
  isMine,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: {
  message: ChatMessage;
  isMine: boolean;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`group flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          message.deleted_at
            ? "border border-dashed border-border bg-surface text-foreground/55 italic"
            : isMine
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-surface"
        }`}
      >
        {message.reply_to_message_id && (
          <div className={`mb-1 rounded-lg px-2 py-1 text-xs ${isMine ? "bg-primary-foreground/15" : "bg-surface-muted"}`}>
            {message.reply_preview}
          </div>
        )}
        {message.deleted_at ? "This message was deleted." : message.content}
        {message.edited_at && !message.deleted_at && (
          <span className={`ml-1.5 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-foreground/55"}`}>
            (edited)
          </span>
        )}
      </div>

      {Object.keys(message.reactions).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(message.reactions).map(([emoji, userIds]) => (
            <button
              key={emoji}
              onClick={() => onReact(message, emoji)}
              className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-xs hover:bg-surface-muted"
            >
              {emoji} {userIds.length}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-foreground/55">
        <span>{timeLabel(message.created_at)}</span>
        {isMine && message.seen_by_count > 0 && <span>Seen by {message.seen_by_count}</span>}
        {showActions && !message.deleted_at && (
          <div className="flex items-center gap-2">
            {REACTION_EMOJIS.slice(0, 3).map((emoji) => (
              <button key={emoji} onClick={() => onReact(message, emoji)} className="hover:opacity-70">
                {emoji}
              </button>
            ))}
            <button onClick={() => onReply(message)} className="font-medium hover:text-foreground/70">
              Reply
            </button>
            {isMine && (
              <>
                <button onClick={() => onEdit(message)} className="font-medium hover:text-foreground/70">
                  Edit
                </button>
                <button onClick={() => onDelete(message)} className="font-medium text-danger/70 hover:text-danger">
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatroomPanel() {
  const { token, me } = useAuth();
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;

  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const lastReadSentRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);

  const { connected, subscribe, sendTyping } = useRealtimeConnection(token ? { token } : null);
  const channel = `chat:conversation:${conversationId}`;

  const loadInitial = useCallback(() => {
    if (!token || !conversationId) return;
    api.getConversation(conversationId, token).then(setConv).catch(() => setConv(null));
    api.listMessages(conversationId, token, { limit: 30 }).then((res) => {
      setMessages(res.data);
      setNextCursor(res.meta.next_cursor);
    });
  }, [token, conversationId]);

  useEffect(loadInitial, [loadInitial]);

  useEffect(() => {
    if (!token || !conversationId) return;
    return subscribe(channel, (event: RealtimeEvent) => {
      if (event.type === "message.created") {
        const incoming = event.message as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      } else if (event.type === "message.updated") {
        const updated = event.message as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      } else if (event.type === "message.deleted") {
        const id = event.message_id as string;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString(), content: null } : m))
        );
      } else if (event.type === "typing.started" && event.user_id !== me?.id) {
        setTypingUsers((prev) => new Set(prev).add(event.user_id as string));
      } else if (event.type === "typing.stopped") {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(event.user_id as string);
          return next;
        });
      } else if (event.type === "presence.updated") {
        setConv((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) =>
                  m.user_id === event.user_id ? { ...m, is_online: event.is_online as boolean } : m
                ),
              }
            : prev
        );
      }
    });
  }, [token, conversationId, channel, subscribe, me?.id]);

  // Mark the latest message read once, whenever it changes.
  useEffect(() => {
    if (!token || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (lastReadSentRef.current === last.id) return;
    lastReadSentRef.current = last.id;
    api.markConversationRead(conversationId, last.id, token).catch(() => {});
  }, [token, conversationId, messages]);

  async function loadOlder() {
    if (!token || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await api.listMessages(conversationId, token, { cursor: nextCursor, limit: 30 });
      setMessages((prev) => [...res.data, ...prev]);
      setNextCursor(res.meta.next_cursor);
    } finally {
      setLoadingOlder(false);
    }
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (!wasTypingRef.current) {
      wasTypingRef.current = true;
      sendTyping(channel, "started");
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wasTypingRef.current = false;
      sendTyping(channel, "stopped");
    }, TYPING_IDLE_MS);
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!token || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    setError(null);
    const clientMessageId = crypto.randomUUID();
    try {
      const sent = await api.sendMessage(
        conversationId,
        { client_message_id: clientMessageId, content, reply_to_message_id: replyTo?.id },
        token
      );
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setReplyTo(null);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not send this message.");
      setDraft(content);
    }
  }

  async function onSaveEdit(newContent: string) {
    if (!token || !editing) return;
    const updated = await api.editMessage(editing.id, newContent, token);
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setEditing(null);
  }

  async function onDelete(message: ChatMessage) {
    if (!token) return;
    await api.deleteMessage(message.id, token);
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, deleted_at: new Date().toISOString(), content: null } : m))
    );
  }

  async function onReact(message: ChatMessage, emoji: string) {
    if (!token || !me) return;
    const alreadyReacted = message.reactions[emoji]?.includes(me.id);
    const updated = alreadyReacted
      ? await api.removeReaction(message.id, emoji, token)
      : await api.addReaction(message.id, emoji, token);
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  if (!conv) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading conversation…</span>
        <Skeleton className="ml-auto h-10 w-2/5" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="ml-auto h-10 w-1/3" />
        <Skeleton className="h-10 w-3/5" />
      </div>
    );
  }

  const otherTypingLabel =
    typingUsers.size > 0
      ? `${conv.members.filter((m) => typingUsers.has(m.user_id)).length || typingUsers.size} typing…`
      : null;

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-2xl flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 font-medium">
            <UsersIcon width={16} height={16} className="text-foreground/50" />
            {conversationTitle(conv)}
          </h1>
          <p className="text-xs text-foreground/55">
            {conv.members.length} member{conv.members.length === 1 ? "" : "s"} ·{" "}
            {conv.members.filter((m) => m.is_online).length} online
            {!connected && " · Reconnecting…"}
          </p>
        </div>
        {conv.trip_id && (
          <Link href={`/trips/${conv.trip_id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted">
            View trip
          </Link>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-surface/40 p-4">
        {nextCursor && (
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            className="self-center rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
          >
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {messages.length === 0 && <p className="text-center text-sm text-foreground/50">No messages yet — say hello.</p>}
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            isMine={message.sender_id === me?.id}
            onReply={setReplyTo}
            onEdit={(m) => {
              setEditing(m);
              setDraft(m.content ?? "");
            }}
            onDelete={onDelete}
            onReact={onReact}
          />
        ))}
      </div>

      {otherTypingLabel && <p className="px-1 text-xs text-foreground/55">{otherTypingLabel}</p>}
      {error && <p className="px-1 text-xs text-danger">{error}</p>}

      {replyTo && (
        <div className="flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2 text-xs">
          <span className="truncate text-foreground/60">Replying to: {replyTo.content}</span>
          <button onClick={() => setReplyTo(null)}>
            <CloseIcon width={12} height={12} />
          </button>
        </div>
      )}

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSaveEdit(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
          />
          <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDraft("");
            }}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            Cancel
          </button>
        </form>
      ) : (
        <form onSubmit={onSend} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Write a message…"
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <ArrowRightIcon width={14} height={14} />
          </button>
        </form>
      )}
    </div>
  );
}

export default function ChatroomPage() {
  return (
    <RequireAuth>
      <ChatroomPanel />
    </RequireAuth>
  );
}
