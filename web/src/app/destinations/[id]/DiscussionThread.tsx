"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type DiscussionPost } from "@/lib/api";
import { UsersIcon } from "@/components/icons";

export function DiscussionThread({ destinationId }: { destinationId: string }) {
  const { token } = useAuth();
  const [posts, setPosts] = useState<DiscussionPost[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.listDiscussionPosts(destinationId).then(setPosts).catch(() => setPosts([]));
  }

  useEffect(refresh, [destinationId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.createDiscussionPost(destinationId, body, token);
      setBody("");
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not post this.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-lg font-medium">
        <UsersIcon width={16} height={16} />
        Traveler discussion
      </h2>

      {token && (
        <form onSubmit={onSubmit} className="mb-3 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="Share a tip for other travelers…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {posts === null && <p className="text-sm text-foreground/60">Loading…</p>}
      {posts?.length === 0 && <p className="text-sm text-foreground/60">No discussion yet — be the first to share a tip.</p>}
      {posts && posts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
              <p className="text-foreground/85">{p.body}</p>
              <p className="mt-1 text-xs text-foreground/45">{new Date(p.created_at).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
