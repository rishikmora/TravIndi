"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import { api, type Trip } from "@/lib/api";
import { ArrowRightIcon, CalendarIcon, SparkleIcon } from "@/components/icons";

function TripsList() {
  const { token } = useAuth();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listTrips(token)
      .then(setTrips)
      .catch(() => setError("Could not load your trips."));
  }, [token]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My trips</h1>
          <p className="mt-1 text-sm text-foreground/60">Plan a new one, or pick up where you left off.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/trips/plan"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <SparkleIcon width={15} height={15} />
            Plan with AI
          </Link>
          <Link
            href="/trips/new"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            New trip
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {trips === null && !error && <p className="text-sm text-foreground/60">Loading…</p>}
      {trips?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <CalendarIcon width={28} height={28} className="text-foreground/40" />
          <p className="text-sm text-foreground/60">No trips yet — create your first one.</p>
          <Link
            href="/trips/plan"
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Plan with AI
            <ArrowRightIcon width={14} height={14} />
          </Link>
        </div>
      )}
      {trips && trips.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/trips/${t.id}`}
                className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.title ?? "Untitled trip"}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium uppercase text-foreground/60">
                    {t.status}
                  </span>
                </div>
                {t.budget != null && (
                  <div className="text-sm text-foreground/60">
                    Budget: {t.currency} {t.budget}
                  </div>
                )}
                <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  Open
                  <ArrowRightIcon width={14} height={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TripsPage() {
  return (
    <RequireAuth>
      <TripsList />
    </RequireAuth>
  );
}
