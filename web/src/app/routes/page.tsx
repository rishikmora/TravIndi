"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isApiError } from "@/lib/auth-context";
import { api, type Destination, type RouteResult } from "@/lib/api";
import { getCurrentPosition, type Coordinates } from "@/lib/geolocation";
import { CrowdIcon, LocateIcon, MapPinIcon, ShieldIcon, ZapIcon } from "@/components/icons";

type Mode = "safe" | "crowd-free" | "accessible" | "emergency";

const MODES: { value: Mode; label: string; hint: string; icon: typeof ShieldIcon }[] = [
  { value: "safe", label: "Safe", hint: "Weighs real open incidents and crowd risk near the corridor.", icon: ShieldIcon },
  { value: "crowd-free", label: "Crowd-free", hint: "Weighs real live crowd density most heavily.", icon: CrowdIcon },
  {
    value: "accessible",
    label: "Accessible",
    hint: "Weighs real distance to verified wheelchair ramps, toilets, elevators & parking near the corridor.",
    icon: MapPinIcon,
  },
  { value: "emergency", label: "Emergency", hint: "Shortest real distance — speed over everything else.", icon: ZapIcon },
];

function scoreTone(score: number) {
  if (score >= 0.7) return "text-success";
  if (score >= 0.4) return "text-primary";
  return "text-danger";
}

function ReasonsBreakdown({ result }: { result: RouteResult }) {
  const r = result.reasons as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  if (typeof r.distance_km === "number") rows.push({ label: "Straight-line distance", value: `${r.distance_km} km` });
  if (typeof r.nearby_open_incident_count === "number")
    rows.push({ label: "Open incidents nearby", value: String(r.nearby_open_incident_count) });
  if (typeof r.avg_crowd_risk_nearby === "number")
    rows.push({ label: "Avg. crowd risk nearby", value: `${Math.round(r.avg_crowd_risk_nearby * 100)}%` });
  else if (r.avg_crowd_risk_nearby === null) rows.push({ label: "Avg. crowd risk nearby", value: "No crowd data nearby" });
  if (typeof r.nearby_accessible_facility_count === "number")
    rows.push({ label: "Verified accessible facilities nearby", value: String(r.nearby_accessible_facility_count) });
  if (typeof r.corridor_buffer_meters === "number")
    rows.push({ label: "Corridor width scored", value: `${r.corridor_buffer_meters} m` });

  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs text-foreground/50">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function RoutesPage() {
  const [mode, setMode] = useState<Mode>("safe");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationAttempted, setLocationAttempted] = useState(false);
  const locating = useCurrentLocation && !currentLocation && !locationAttempted;
  const [originDestinationId, setOriginDestinationId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listDestinations().then((list) => {
      setDestinations(list);
      if (list.length > 1) setDestinationId(list[1].id);
      if (list.length > 0) setOriginDestinationId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!useCurrentLocation || currentLocation || locationAttempted) return;
    getCurrentPosition()
      .then(({ coords }) => setCurrentLocation(coords))
      .finally(() => setLocationAttempted(true));
  }, [useCurrentLocation, currentLocation, locationAttempted]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const origin = useCurrentLocation ? currentLocation : destinations.find((d) => d.id === originDestinationId)?.location;
    const destination = destinations.find((d) => d.id === destinationId)?.location;
    if (!origin || !destination) {
      setError("Pick a starting point and a destination first.");
      return;
    }

    setLoading(true);
    try {
      const route = await api.getRoute(mode, {
        origin_lon: origin.lon,
        origin_lat: origin.lat,
        destination_lon: destination.lon,
        destination_lat: destination.lat,
      });
      setResult(route);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not score this route.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl">Safe-route scoring</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real incident, crowd, and accessibility data scored along the corridor — a straight-line heuristic, not a
          turn-by-turn road-network engine.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">From</span>
            {useCurrentLocation ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <LocateIcon width={15} height={15} className="text-primary" />
                {locating ? "Locating…" : currentLocation ? "My current location" : "Location unavailable"}
              </div>
            ) : (
              <select
                value={originDestinationId}
                onChange={(e) => setOriginDestinationId(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setUseCurrentLocation((v) => !v)}
              className="self-start text-xs font-medium text-primary underline"
            >
              {useCurrentLocation ? "Use a destination instead" : "Use my current location instead"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">To</span>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Mode</span>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                  mode === m.value ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"
                }`}
              >
                <span className={`flex items-center gap-1.5 text-sm font-medium ${mode === m.value ? "text-primary" : ""}`}>
                  <m.icon width={15} height={15} />
                  {m.label}
                </span>
                <span className="text-xs text-foreground/50">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Scoring…" : "Score this route"}
        </button>
      </form>

      {result && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="font-medium capitalize">{result.mode.replace("_", " ")} route</span>
            <span className={`text-2xl font-semibold ${result.score !== null ? scoreTone(result.score) : ""}`}>
              {result.score !== null ? `${(result.score * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
          {result.confidence !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-accent" style={{ width: `${result.confidence * 100}%` }} />
            </div>
          )}
          {result.confidence !== null && (
            <p className="text-xs text-foreground/50">Confidence: {(result.confidence * 100).toFixed(0)}% (real data availability)</p>
          )}
          <ReasonsBreakdown result={result} />
          {typeof result.reasons.note === "string" && (
            <p className="border-t border-border pt-3 text-xs text-foreground/55">{result.reasons.note}</p>
          )}
        </div>
      )}
    </div>
  );
}
