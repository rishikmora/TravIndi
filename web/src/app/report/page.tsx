"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Incident } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { CheckCircleIcon, ClockIcon, MapPinIcon } from "@/components/icons";

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: "theft", label: "Theft" },
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Scam" },
  { value: "accident", label: "Accident" },
  { value: "other", label: "Other" },
];
const SEVERITIES: { value: string; label: string; tone: string }[] = [
  { value: "low", label: "Low", tone: "border-success/40 text-success data-[on=true]:bg-success/10" },
  { value: "medium", label: "Medium", tone: "border-primary/40 text-primary data-[on=true]:bg-primary/10" },
  { value: "high", label: "High", tone: "border-danger/40 text-danger data-[on=true]:bg-danger/10" },
];

function statusTone(status: string) {
  if (status === "RESOLVED") return "text-success";
  if (status === "FALSE_ALARM" || status === "CANCELLED") return "text-foreground/50";
  if (status === "ASSIGNED" || status === "IN_PROGRESS") return "text-primary";
  return "text-foreground/70";
}

function MyReports({ reports }: { reports: Incident[] }) {
  if (reports.length === 0) return null;
  return (
    <div className="w-full">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
        <ClockIcon width={13} height={13} />
        Your reports
      </h2>
      <ul className="flex flex-col gap-2">
        {reports.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{r.incident_type}</span>
              <span className={`text-xs font-medium uppercase ${statusTone(r.status)}`}>{r.status.replace("_", " ")}</span>
            </div>
            <div className="mt-0.5 text-xs text-foreground/50">
              {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {" · "}Severity: {r.severity}
            </div>
            {r.description && <p className="mt-1 text-xs text-foreground/60">{r.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportForm() {
  const { token } = useAuth();
  const [incidentType, setIncidentType] = useState("theft");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [reports, setReports] = useState<Incident[]>([]);
  const [justSubmitted, setJustSubmitted] = useState<Incident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.listIncidents(token).then(setReports).catch(() => {});
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const { coords } = await getCurrentPosition();
      const incident = await api.createIncident(
        { incident_type: incidentType, severity, lon: coords.lon, lat: coords.lat, description: description || undefined },
        token
      );
      setJustSubmitted(incident);
      setReports((r) => [incident, ...r]);
      setDescription("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  if (justSubmitted) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
          <CheckCircleIcon width={32} height={32} className="text-success" />
          <h1 className="font-display text-xl">Report submitted</h1>
          <p className="text-sm text-foreground/60">
            An authority responder will review it. You&apos;ll be notified when its status changes.
          </p>
          <button
            onClick={() => setJustSubmitted(null)}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Report another incident
          </button>
        </div>
        <MyReports reports={reports} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl">Report an incident</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/60">
          <MapPinIcon width={14} height={14} className="text-foreground/40" />
          Your current location is attached automatically.
        </p>
        <p className="mt-2 text-xs text-danger">
          In immediate danger?{" "}
          <Link href="/sos" className="font-medium underline">
            Use SOS instead
          </Link>{" "}
          for a real-time authority alert.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">What happened?</span>
          <div className="flex flex-wrap gap-1.5">
            {INCIDENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setIncidentType(t.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  incidentType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Severity</span>
          <div className="grid grid-cols-3 gap-1.5">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                data-on={severity === s.value}
                onClick={() => setSeverity(s.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${s.tone} ${
                  severity === s.value ? "" : "opacity-60"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What happened, and anything that could help a responder"
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </form>

      <MyReports reports={reports} />
    </div>
  );
}

export default function ReportPage() {
  return (
    <RequireAuth>
      <ReportForm />
    </RequireAuth>
  );
}
