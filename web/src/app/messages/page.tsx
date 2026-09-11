"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { api, type Conversation } from "@/lib/api";
import { useRealtimeConnection, type RealtimeEvent } from "@/lib/realtime/useRealtimeConnection";
import { ChatIcon, UsersIcon } from "@/components/icons";
import { ListSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

function conversationTitle(conv: Conversation, myUserId: string | undefined): string {
  if (conv.title) return conv.title;
  if (conv.type === "DIRECT") {
    const other = conv.members.find((m) => m.user_id !== myUserId);
    return other ? "Direct message" : "Direct message";
  }
  return conv.type === "TRIP" ? "Trip chat" : "Group chat";
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ConversationRow({ conv, myUserId }: { conv: Conversation; myUserId: string | undefined }) {
  const anyOnline = conv.members.some((m) => m.user_id !== myUserId && m.is_online);
  return (
    <Link
      href={`/messages/${conv.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-muted"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {conv.type === "DIRECT" ? <ChatIcon width={16} height={16} /> : <UsersIcon width={16} height={16} />}
        {anyOnline && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{conversationTitle(conv, myUserId)}</span>
          {conv.last_message_at && (
            <span className="whitespace-nowrap text-xs text-foreground/55">{timeAgo(conv.last_message_at)}</span>
          )}
        </div>
        <p className="truncate text-sm text-foreground/55">{conv.last_message_preview ?? "No messages yet"}</p>
      </div>
      {conv.unread_count > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
          {conv.unread_count}
        </span>
      )}
    </Link>
  );
}

function MessagesPanel() {
  const { token, me } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const { subscribe } = useRealtimeConnection(token ? { token } : null);

  function refresh() {
    if (!token) return;
    api.listConversations(token).then(setConversations).catch(() => setConversations([]));
  }

  useEffect(refresh, [token]);

  useEffect(() => {
    if (!conversations) return;
    const unsubscribes = conversations.map((conv) =>
      subscribe(`chat:conversation:${conv.id}`, (event: RealtimeEvent) => {
        if (event.type === "message.created" || event.type === "message.read" || event.type === "presence.updated") {
          refresh();
        }
      })
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations?.map((c) => c.id).join(",")]);

  async function onCreateGroup() {
    if (!token) return;
    const conv = await api.createConversation({ type: "GROUP", title: groupTitle || undefined, member_user_ids: [] }, token);
    setShowNewGroup(false);
    setGroupTitle("");
    router.push(`/messages/${conv.id}`);
  }

  const sorted = conversations
    ? [...conversations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Messages</h1>
        <button
          onClick={() => setShowNewGroup((v) => !v)}
          className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted"
        >
          New group
        </button>
      </div>

      {showNewGroup && (
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-3">
          <input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="Group name (optional)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button onClick={onCreateGroup} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
            Create
          </button>
        </div>
      )}

      {sorted === null && <ListSkeleton />}

      {sorted !== null && sorted.length === 0 && (
        <EmptyState
          icon={<ChatIcon width={22} height={22} />}
          title="No conversations yet."
          description="Trip chats appear automatically once you open a trip."
        />
      )}

      <div className="flex flex-col gap-2">
        {sorted?.map((conv) => (
          <ConversationRow key={conv.id} conv={conv} myUserId={me?.id} />
        ))}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <RequireAuth>
      <MessagesPanel />
    </RequireAuth>
  );
}
