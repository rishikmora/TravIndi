"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api, type CrowdHeatmapPoint } from "@/lib/api";
import { CrowdIcon, RefreshIcon, SparkleIcon } from "@/components/icons";
import { riskColor } from "@/lib/crowd-risk-color";
import { ListSkeleton, Skeleton } from "@/components/Skeleton";

const CrowdHeatmapMap = dynamic(
  () => import("@/components/CrowdHeatmapMap").then((m) => m.CrowdHeatmapMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading map…</div>
    ),
  }
);

const REFRESH_INTERVAL_MS = 30_000;

function riskLabel(risk: number | null): string {
  if (risk == null) return "Unknown";
  if (risk >= 0.7) return "High";
  if (risk >= 0.4) return "Moderate";
  return "Low";
}

function RiskRow({ point }: { point: CrowdHeatmapPoint }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: riskColor(point.risk_score) }}
        aria-hidden
      />
      {point.destination_id ? (
        <Link href={`/destinations/${point.destination_id}`} className="flex-1 truncate text-sm font-medium hover:text-primary">
          {point.destination_name ?? "Unnamed cell"}
        </Link>
      ) : (
        <span className="flex-1 truncate text-sm font-medium">{point.destination_name ?? "Unnamed cell"}</span>
      )}
      <span className="shrink-0 text-xs font-medium text-foreground/60">
        {riskLabel(point.risk_score)}
        {point.risk_score != null ? ` · ${Math.round(point.risk_score * 100)}%` : ""}
      </span>
    </li>
  );
}

export default function CrowdHeatmapPage() {
  const [points, setPoints] = useState<CrowdHeatmapPoint[] | null>(null);
  const [ranking, setRanking] = useState<CrowdHeatmapPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api.getCrowdHeatmap(), api.getCrowdRiskRanking()])
        .then(([heatmap, risk]) => {
          setPoints(heatmap);
          setRanking(risk);
          setLastUpdated(new Date());
          setError(null);
        })
        .catch(() => setError("Could not load live crowd data.")),
    []
  );

  function onManualRefresh() {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CrowdIcon width={22} height={22} className="text-primary" />
            Live Crowd Heatmap
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground/60">
            Real per-destination crowd cells from the actual API, adjusted live by a documented time-of-day
            heuristic so the numbers genuinely change depending on when you look — never a fabricated live feed.
          </p>
        </div>
        <button
          onClick={onManualRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
        >
          <RefreshIcon width={14} height={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-xs text-foreground/60">
        <SparkleIcon width={12} height={12} className="shrink-0 text-accent" />
        <span>
          Baseline density/risk per destination is real recorded data (see each popup); the live value shown is
          that baseline modulated by a real-time, clearly-labeled heuristic (
          <code className="rounded bg-surface px-1 py-0.5">time_of_day_heuristic_v1</code>) — not a claim of real
          sensor telemetry, which no camera/IoT feed exists to provide yet.
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="h-[480px] overflow-hidden rounded-2xl border border-border">
          {points === null ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : (
            <CrowdHeatmapMap points={points} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-medium">Legend</div>
            <div className="mt-2 flex flex-col gap-1.5 text-xs text-foreground/70">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskColor(0.8) }} />
                High risk (≥ 70%)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskColor(0.5) }} />
                Moderate risk (40–69%)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskColor(0.2) }} />
                Low risk (&lt; 40%)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskColor(null) }} />
                Unknown
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Highest risk right now</h2>
            {ranking === null && <ListSkeleton count={5} className="mt-2" />}
            {ranking && ranking.length === 0 && <p className="mt-2 text-sm text-foreground/60">No risk data yet.</p>}
            {ranking && ranking.length > 0 && (
              <ul className="mt-2 flex flex-col gap-2">
                {ranking.slice(0, 8).map((p) => (
                  <RiskRow key={p.h3_cell} point={p} />
                ))}
              </ul>
            )}
          </div>

          {lastUpdated && (
            <p className="text-xs text-foreground/55">Last updated {lastUpdated.toLocaleTimeString()} · auto-refreshes every 30s</p>
          )}
        </div>
      </div>
    </div>
  );
}
