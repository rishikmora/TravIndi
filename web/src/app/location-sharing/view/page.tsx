"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { isApiError } from "@/lib/auth-context";
import { api, type LocationShareRecipientView } from "@/lib/api";
import { AlertTriangleIcon, ClockIcon, LocateIcon, MapPinIcon } from "@/components/icons";

const LocationShareMap = dynamic(() => import("@/components/LocationShareMap").then((m) => m.LocationShareMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading map…</div>
  ),
});

// Unlike verify/page.tsx's one-shot SOS check, this must show real movement
// over time, so it polls — same 5s idiom as ActiveSosCard, the only "live"
// precedent in this codebase (no WebSocket/push infra exists anywhere).
const POLL_INTERVAL_MS = 5000;
const STALE_AFTER_SECONDS = 90;

function timeAgo(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function VerifyPanel() {
  const params = useSearchParams();
  const shareId = params.get("share");
  const accessToken = params.get("token");

  const [result, setResult] = useState<LocationShareRecipientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(shareId && accessToken));
  const [nowMs, setNowMs] = useState(() => Date.now());

  const pollingRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!shareId || !accessToken) return;

    function fetchOnce() {
      api
        .getLocationShareRecipientView(shareId!, accessToken!)
        .then((view) => {
          setResult(view);
          setError(null);
          setConnectionLost(false);
        })
        .catch((err) => {
          if (isApiError(err)) {
            // A real rejection (invalid/expired/revoked token) — stop
            // polling, this share is genuinely over, not a network blip.
            pollingRef.current = false;
            setError(err.message);
            setResult(null);
          } else {
            // A real network failure — never pretend the last-known state
            // is still live; say so honestly and keep retrying.
            setConnectionLost(true);
          }
        })
        .finally(() => setLoading(false));
    }

    fetchOnce();
    const interval = setInterval(() => {
      if (pollingRef.current) fetchOnce();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [shareId, accessToken]);

  if (!shareId || !accessToken) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-2 pt-12 text-center">
        <h1 className="font-display text-xl">Invalid link</h1>
        <p className="text-sm text-foreground/60">This location-sharing link is missing its share id or token.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-12 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-foreground/60">Checking this link…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-2 pt-12 text-center">
        <AlertTriangleIcon width={28} height={28} className="text-foreground/30" />
        <h1 className="font-display text-xl">This link has ended</h1>
        <p className="text-sm text-foreground/60">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const secondsSinceUpdate = result.last_location_at
    ? Math.floor((nowMs - new Date(result.last_location_at).getTime()) / 1000)
    : null;
  const isStale = secondsSinceUpdate != null && secondsSinceUpdate > STALE_AFTER_SECONDS;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-4">
      <div className="text-center">
        <h1 className="font-display text-xl">Live location</h1>
        <p className="mt-1 text-sm text-foreground/60">
          You&apos;re seeing this because someone chose to share their location with you — no account needed.
        </p>
      </div>

      {connectionLost && (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary">
          Connection unavailable — showing the last known status.
        </p>
      )}

      {result.status !== "ACTIVE" ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-6 text-center">
          <AlertTriangleIcon width={24} height={24} className="text-foreground/30" />
          <p className="text-sm font-medium">Location sharing has ended.</p>
          <p className="text-xs text-foreground/50">
            {result.status === "REVOKED" ? "The person sharing stopped it." : "This share's time limit was reached."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 text-sm">
            <span className="flex items-center gap-2 font-medium">
              {result.last_location_at == null ? (
                <ClockIcon width={16} height={16} className="text-foreground/50" />
              ) : result.is_live && !isStale ? (
                <LocateIcon width={16} height={16} className="text-success" />
              ) : (
                <ClockIcon width={16} height={16} className="text-primary" />
              )}
              {result.last_location_at == null ? "NOT STARTED" : result.is_live && !isStale ? "LIVE" : "STALE"}
            </span>
            <span className="text-xs text-foreground/55">
              {result.last_location_at ? `Updated ${timeAgo(result.last_location_at, nowMs)}` : "No update yet"}
            </span>
          </div>

          <p className="text-xs text-foreground/50">
            Precision: {result.precision === "PRECISE" ? "Precise GPS position" : "Approximate area (~1km)"} · Ends{" "}
            {new Date(result.expires_at).toLocaleString()}
          </p>
          {result.purpose && <p className="text-xs text-foreground/50">Purpose: {result.purpose}</p>}

          {result.current_location ? (
            <div className="h-64 overflow-hidden rounded-2xl border border-border">
              <LocationShareMap location={result.current_location} isLive={result.is_live && !isStale} label="Shared location" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
              <MapPinIcon width={22} height={22} className="text-foreground/30" />
              <p className="text-sm text-foreground/60">No location received yet.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LocationShareViewPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense
        fallback={
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-12 text-center">
            <p className="text-sm text-foreground/60">Loading…</p>
          </div>
        }
      >
        <VerifyPanel />
      </Suspense>
    </div>
  );
}
