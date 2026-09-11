"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api, type Trip } from "@/lib/api";
import { ArrowRightIcon, CalendarIcon } from "@/components/icons";

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const msPerDay = 86_400_000;
  return Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / msPerDay);
}

function startLabel(startDate: string): string {
  const days = daysUntil(startDate);
  if (days === 0) return "starts today";
  if (days === 1) return "starts tomorrow";
  if (days > 1) return `starts in ${days} days`;
  if (days === -1) return "started yesterday";
  return `started ${Math.abs(days)} days ago`;
}

function pickRelevantTrip(trips: Trip[]): { trip: Trip; reason: string } | null {
  const active = trips.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  if (active.length === 0) return null;

  const inProgress = active.find((t) => t.status === "IN_PROGRESS");
  if (inProgress) return { trip: inProgress, reason: "in progress now" };

  const upcoming = active
    .filter((t) => t.status === "CONFIRMED" && t.start_date)
    .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())[0];
  if (upcoming) return { trip: upcoming, reason: startLabel(upcoming.start_date!) };

  const draft = active
    .filter((t) => t.status === "DRAFT")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (draft) return { trip: draft, reason: "still being planned" };

  return { trip: active[0]!, reason: active[0]!.status.toLowerCase() };
}

/**
 * "Continue your trip" — the one piece of real personalization a
 * returning, logged-in user with an active trip should see immediately,
 * instead of the exact same generic homepage every visitor gets. Renders
 * nothing for a first-time user or one with no active trip — an empty
 * banner would be a worse first impression than no banner at all.
 */
export function ReturningTripBanner() {
  const { token } = useAuth();
  const [picked, setPicked] = useState<{ trip: Trip; reason: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listTrips(token)
      .then((trips) => setPicked(pickRelevantTrip(trips)))
      .catch(() => setPicked(null));
  }, [token]);

  // Guarding on `token` too (not just `picked`) means a logout hides this
  // immediately even if a stale `picked` from the previous session is
  // still sitting in state — no separate reset-on-logout branch needed.
  if (!token || !picked) return null;
  const { trip, reason } = picked;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group flex items-center gap-3 rounded-card border border-primary/25 bg-primary/5 px-5 py-3.5 transition hover:bg-primary/10"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/15 text-primary">
        <CalendarIcon width={16} height={16} />
      </span>
      <span className="flex-1 text-sm">
        <span className="font-medium">{trip.title ?? "Your trip"}</span>
        <span className="text-foreground/60"> {reason}.</span>
      </span>
      <ArrowRightIcon width={14} height={14} className="shrink-0 text-primary transition group-hover:translate-x-0.5" />
    </Link>
  );
}
