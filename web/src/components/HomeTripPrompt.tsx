"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SparkleIcon, ArrowRightIcon } from "@/components/icons";

// The one-time carry between this page and /trips/plan's CapturePanel —
// not a backend contract, just surviving a same-tab navigation. Read once
// and cleared there so a stale value never resurfaces on a later visit.
export const PENDING_TRIP_PROMPT_KEY = "travindi:pending_trip_prompt";

/**
 * Real natural-language trip input — replaces the decorative "ASK THE AI
 * PLANNER" quote card, which only ever linked to /trips/plan without
 * carrying what the user typed anywhere. This is the exact same real
 * extraction flow /trips/plan already runs; the box here only captures
 * the text and hands it off, so there's no duplicated AI-calling logic.
 */
export function HomeTripPrompt() {
  const { token } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    try {
      sessionStorage.setItem(PENDING_TRIP_PROMPT_KEY, trimmed);
    } catch {
      // Private-browsing or storage-disabled — the navigation below still
      // works, the user just re-types on /trips/plan instead of a silent
      // failure.
    }
    router.push(token ? "/trips/plan" : "/login");
  }

  return (
    <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-gold/40 bg-ink-2/90 p-4 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-gold">
        <SparkleIcon width={11} height={11} />
        ASK THE AI PLANNER
      </div>
      <form onSubmit={onSubmit} className="mt-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Something peaceful and local, 3 days, under ₹15,000…"
          className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-2.5 py-2 font-display text-base leading-snug text-[#F5EFE3] placeholder:font-sans placeholder:text-sm placeholder:text-[#8AA0B0] focus:outline-none focus:ring-2 focus:ring-gold/50"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-full bg-gold py-2 text-xs font-bold text-ink disabled:opacity-50"
        >
          {token ? "Create journey" : "Log in to create this journey"}
          <ArrowRightIcon width={12} height={12} />
        </button>
      </form>
    </div>
  );
}
