"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import { api, type Trip } from "@/lib/api";
import { ArrowRightIcon, CalendarIcon, SparkleIcon } from "@/components/icons";
import { CardGridSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

function TripsList() {
  const { token } = useAuth();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api
      .listTrips(token)
      .then((all) => {
        setTrips(all.filter((t) => t.status !== "CANCELLED"));
        setError(null);
      })
      .catch(() => setError("Could not load your trips."));
  }

  useEffect(refresh, [token]);

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
      {error && <ErrorState title={error} onRetry={refresh} />}
      {trips === null && !error && <CardGridSkeleton count={4} />}
      {trips?.length === 0 && (
        <EmptyState
          icon={<CalendarIcon width={28} height={28} />}
          title="No trips yet — create your first one."
          action={
            <Link
              href="/trips/plan"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Plan with AI
              <ArrowRightIcon width={14} height={14} />
            </Link>
          }
        />
      )}
      {trips && trips.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trips.map((t, i) => (
            <li key={t.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
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
