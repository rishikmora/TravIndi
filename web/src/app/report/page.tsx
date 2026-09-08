"use client";

import { useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Incident } from "@/lib/api";

const FALLBACK_LOCATION = { lon: 77.2295, lat: 28.6129 };

function getCurrentPosition(): Promise<{ lon: number; lat: number }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(FALLBACK_LOCATION);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lon: pos.coords.longitude, lat: pos.coords.latitude }),
      () => resolve(FALLBACK_LOCATION),
      { timeout: 5000 }
    );
  });
}

function ReportForm() {
  const { token } = useAuth();
  const [incidentType, setIncidentType] = useState("theft");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState<Incident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const { lon, lat } = await getCurrentPosition();
      const incident = await api.createIncident(
        { incident_type: incidentType, severity, lon, lat, description: description || undefined },
        token
      );
      setSubmitted(incident);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-2xl font-semibold">Report submitted</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Status: {submitted.status}. An authority responder will review it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">Report an incident</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          >
            <option value="theft">Theft</option>
            <option value="harassment">Harassment</option>
            <option value="scam">Scam</option>
            <option value="accident">Accident</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Severity
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </form>
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
