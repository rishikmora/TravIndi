"use client";

import { useState, type FormEvent } from "react";
import { isApiError } from "@/lib/auth-context";
import { api, type RouteResult } from "@/lib/api";

type Mode = "safe" | "crowd-free" | "accessible" | "emergency";

const MODE_HINTS: Record<Mode, string> = {
  safe: "Weighs real open incidents and crowd risk near the corridor.",
  "crowd-free": "Weighs real live crowd density most heavily.",
  accessible: "Weighs real distance to verified wheelchair ramps, accessible toilets, elevators & accessible parking near the corridor, plus incidents/crowd.",
  emergency: "Shortest real distance — speed over everything else.",
};

export default function RoutesPage() {
  const [mode, setMode] = useState<Mode>("safe");
  const [originLon, setOriginLon] = useState("77.2295");
  const [originLat, setOriginLat] = useState("28.6129");
  const [destLon, setDestLon] = useState("72.8347");
  const [destLat, setDestLat] = useState("18.9220");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const route = await api.getRoute(mode, {
        origin_lon: Number(originLon),
        origin_lat: Number(originLat),
        destination_lon: Number(destLon),
        destination_lat: Number(destLat),
      });
      setResult(route);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not score this route.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Safe-route scoring</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Prototype-depth: a straight-line corridor scored against live data — not a real
        road-network routing engine.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="safe">Safe</option>
            <option value="crowd-free">Crowd-free</option>
            <option value="accessible">Accessible</option>
            <option value="emergency">Emergency</option>
          </select>
          <span className="text-xs font-normal text-foreground/50">{MODE_HINTS[mode]}</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={originLon}
            onChange={(e) => setOriginLon(e.target.value)}
            placeholder="Origin lon"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={originLat}
            onChange={(e) => setOriginLat(e.target.value)}
            placeholder="Origin lat"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={destLon}
            onChange={(e) => setDestLon(e.target.value)}
            placeholder="Destination lon"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={destLat}
            onChange={(e) => setDestLat(e.target.value)}
            placeholder="Destination lat"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Scoring…" : "Score route"}
        </button>
      </form>

      {result && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{result.mode}</span>
            <span>Score: {result.score !== null ? (result.score * 100).toFixed(0) + "%" : "—"}</span>
          </div>
          <div className="text-foreground/60">
            Confidence: {result.confidence !== null ? (result.confidence * 100).toFixed(0) + "%" : "—"}
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs text-foreground/60">
            {JSON.stringify(result.reasons, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
