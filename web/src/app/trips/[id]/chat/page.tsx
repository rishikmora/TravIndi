"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

/**
 * Trip chatrooms reuse the same unified conversation model as every other
 * chat — this route only ever resolves-or-creates the trip's own `TRIP`
 * conversation (membership synced from real trip_members server-side)
 * and hands off to the real chatroom UI at /messages/[conversationId],
 * rather than duplicating that UI here.
 */
function TripChatResolver() {
  const { token } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params.id) return;
    api
      .getOrCreateTripConversation(params.id, token)
      .then((conv) => router.replace(`/messages/${conv.id}`))
      .catch(() => setError("Could not open this trip's chat — you may not be part of this trip."));
  }, [token, params.id, router]);

  if (error) {
    return <p className="mx-auto max-w-sm pt-12 text-center text-sm text-danger">{error}</p>;
  }
  return <p className="mx-auto max-w-sm pt-12 text-center text-sm text-foreground/60">Opening trip chat…</p>;
}

export default function TripChatPage() {
  return (
    <RequireAuth>
      <TripChatResolver />
    </RequireAuth>
  );
}
