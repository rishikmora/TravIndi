"use client";

import { useState } from "react";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type HeritageStory as HeritageStoryData } from "@/lib/api";
import { SparkleIcon } from "@/components/icons";

export function HeritageStory({ destinationId }: { destinationId: string }) {
  const { token } = useAuth();
  const [story, setStory] = useState<HeritageStoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onGenerate() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getHeritageStory(destinationId, token);
      setStory(result);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not generate a heritage story right now.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SparkleIcon width={16} height={16} className="text-accent" />
          <h2 className="font-medium">Heritage story</h2>
        </div>
        {!story && (
          <button
            onClick={onGenerate}
            disabled={loading}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Writing…" : "Tell the story"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {story && (
        <div className="mt-2">
          <p className="text-sm leading-relaxed text-foreground/80">{story.story}</p>
          <p className="mt-2 text-xs text-foreground/55">
            {story.grounded
              ? `Grounded in ${story.sources.length} real reference source${story.sources.length === 1 ? "" : "s"} — a real Claude call, not a canned blurb.`
              : "Not enough verified material yet — shown honestly rather than invented."}
          </p>
        </div>
      )}
    </section>
  );
}
