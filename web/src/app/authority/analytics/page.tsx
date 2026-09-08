"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type AnalyticsOverview, type TrendingDestination } from "@/lib/api";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-foreground/60">{label}</div>
    </div>
  );
}

function AnalyticsPanel() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trending, setTrending] = useState<TrendingDestination[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.getAnalyticsOverview(token), api.getTrendingDestinations(token)])
      .then(([o, t]) => {
        setOverview(o);
        setTrending(t);
      })
      .catch((err) => {
        setError(
          isApiError(err) && err.status === 403
            ? "This view is only available to tourism-department authority accounts (in this demo, log in as test-admin@example.com, which bypasses every policy check)."
            : "Could not load analytics."
        );
      });
  }, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tourism analytics</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real aggregate counts over live data — no simulated numbers.
        </p>
      </div>
      <Link href="/authority" className="text-sm font-medium text-primary">
        ← Back to command center
      </Link>

      {overview && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Destinations" value={overview.total_destinations} />
          <StatTile label="Businesses" value={overview.total_businesses} />
          <StatTile label="Verified businesses" value={overview.verified_businesses} />
          <StatTile label="Guides" value={overview.total_guides} />
          <StatTile label="Verified guides" value={overview.verified_guides} />
          <StatTile label="Trips planned" value={overview.total_trips} />
          <StatTile label="Confirmed bookings" value={overview.confirmed_bookings} />
          <StatTile label="Completed bookings" value={overview.completed_bookings} />
          <StatTile label="Cancelled bookings" value={overview.cancelled_bookings} />
          <StatTile label="Reviews" value={overview.total_reviews} />
          <StatTile
            label="Avg. review authenticity"
            value={overview.average_review_authenticity != null ? overview.average_review_authenticity.toFixed(2) : "—"}
          />
          <StatTile label="Open fraud cases" value={overview.open_fraud_cases} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium">Trending destinations</h2>
        <p className="mb-3 text-xs text-foreground/50">
          A real heuristic — itinerary items planned in the last 7 days, not a trained forecast.
        </p>
        <ul className="flex flex-col gap-2">
          {trending.map((t) => (
            <li
              key={t.destination_id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm"
            >
              <Link href={`/destinations/${t.destination_id}`} className="font-medium hover:text-primary">
                {t.destination_name}
              </Link>
              <span className="text-foreground/60">{t.itinerary_items_last_7_days} planned this week</span>
            </li>
          ))}
          {trending.length === 0 && <p className="text-sm text-foreground/60">No recent planning activity yet.</p>}
        </ul>
      </section>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RequireAuth>
      <AnalyticsPanel />
    </RequireAuth>
  );
}
