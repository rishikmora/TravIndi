"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type FraudCase } from "@/lib/api";
import { AlertTriangleIcon, ClockIcon, SparkleIcon } from "@/components/icons";

type FraudSubjectType = "business" | "guide" | "listing" | "message" | "other";
const SUBJECT_TYPES: { value: FraudSubjectType; label: string }[] = [
  { value: "business", label: "A business" },
  { value: "guide", label: "A guide" },
  { value: "listing", label: "A listing" },
  { value: "message", label: "A message" },
  { value: "other", label: "Other" },
];

function statusTone(status: string) {
  if (status === "CONFIRMED") return "text-danger";
  if (status === "DISMISSED") return "text-foreground/50";
  return "text-primary";
}

function ReportFraudForm({ onReported }: { onReported: (c: FraudCase) => void }) {
  const { token } = useAuth();
  const [subjectType, setSubjectType] = useState<FraudSubjectType>("business");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.reportFraudCase({ subject_type: subjectType, description }, token);
      onReported(created);
      setDescription("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit this report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-medium">Report a scam, overcharge, or fraud</h2>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-foreground/50">
          <SparkleIcon width={12} height={12} className="mt-0.5 shrink-0 text-accent" />
          An AI triage signal is generated automatically — a human investigator always makes the final call, never
          the model.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Who or what is this about?</span>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSubjectType(t.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                subjectType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        What happened?
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          placeholder="e.g. Quoted 500 rupees but charged 1500 at drop-off with no receipt"
          className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !description}
        className="self-start rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Report"}
      </button>
    </form>
  );
}

function FraudCaseRow({ c, canResolve, onResolved }: { c: FraudCase; canResolve: boolean; onResolved: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"CONFIRMED" | "DISMISSED" | null>(null);

  async function resolve(outcome: "CONFIRMED" | "DISMISSED") {
    if (!token) return;
    setError(null);
    setBusy(outcome);
    try {
      await api.resolveFraudCase(c.id, outcome, token);
      onResolved();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not resolve this case.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium capitalize">{c.subject_type}</span>
        <span className={`text-xs font-medium uppercase ${statusTone(c.status)}`}>{c.status}</span>
      </div>
      <p className="mt-1 text-foreground/70">{c.description}</p>
      {c.signals.map((s, i) => (
        <p key={i} className="mt-1.5 flex items-center gap-1 text-xs text-foreground/50">
          <SparkleIcon width={11} height={11} className="text-accent" />
          {s.signal_type.replace(/_/g, " ")} · {((s.confidence ?? 0) * 100).toFixed(0)}% confidence
        </p>
      ))}
      <p className="mt-1.5 text-xs text-foreground/40">{new Date(c.created_at).toLocaleString()}</p>
      {c.status === "OPEN" && canResolve && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => resolve("CONFIRMED")}
              disabled={busy !== null}
              className="rounded-full border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
            >
              {busy === "CONFIRMED" ? "Confirming…" : "Confirm fraud"}
            </button>
            <button
              onClick={() => resolve("DISMISSED")}
              disabled={busy !== null}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/60 disabled:opacity-50"
            >
              {busy === "DISMISSED" ? "Dismissing…" : "Dismiss"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function FraudCasesPanel() {
  const { token, me } = useAuth();
  const [cases, setCases] = useState<FraudCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canResolve = me?.account_type === "authority";

  function refresh() {
    if (!token) return;
    api.listFraudCases(token).then(setCases).catch(() => setError("Could not load fraud cases."));
  }

  useEffect(refresh, [token]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl">Fraud & scam reports</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {canResolve
            ? "Every open report across the platform, with a real AI triage signal to help you prioritize."
            : "Your own reports, tracked from submission to resolution."}
        </p>
      </div>

      <ReportFraudForm onReported={(c) => setCases((prev) => [c, ...(prev ?? [])])} />

      {error && <p className="text-sm text-danger">{error}</p>}

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
          <ClockIcon width={13} height={13} />
          {canResolve ? "All reports" : "Your reports"}
        </h2>
        {cases === null && !error && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
                <div className="h-4 w-1/2 rounded bg-surface-muted" />
                <div className="mt-2 h-3 w-3/4 rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        )}
        {cases?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
            <AlertTriangleIcon width={26} height={26} className="text-foreground/30" />
            <p className="text-sm text-foreground/60">No reports yet.</p>
          </div>
        )}
        {cases && cases.length > 0 && (
          <ul className="flex flex-col gap-2">
            {cases.map((c) => (
              <FraudCaseRow key={c.id} c={c} canResolve={canResolve} onResolved={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function FraudPage() {
  return (
    <RequireAuth>
      <FraudCasesPanel />
    </RequireAuth>
  );
}
