"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type FraudCase } from "@/lib/api";

const SUBJECT_TYPES = ["business", "guide", "listing", "message", "other"] as const;

function ReportFraudForm({ onReported }: { onReported: (c: FraudCase) => void }) {
  const { token } = useAuth();
  const [subjectType, setSubjectType] = useState<(typeof SUBJECT_TYPES)[number]>("business");
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-medium">Report scam / overcharging / fraud</h2>
      <select
        value={subjectType}
        onChange={(e) => setSubjectType(e.target.value as (typeof SUBJECT_TYPES)[number])}
        className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      >
        {SUBJECT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        rows={3}
        placeholder="Describe what happened — an AI triage signal is generated automatically for investigators."
        className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !description}
        className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Report"}
      </button>
    </form>
  );
}

function FraudCaseRow({ c, onResolved }: { c: FraudCase; onResolved: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve(outcome: "CONFIRMED" | "DISMISSED") {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      await api.resolveFraudCase(c.id, outcome, token);
      onResolved();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not resolve this case.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
      <div className="flex items-center justify-between">
        <span>{c.subject_type}</span>
        <span className="text-xs uppercase text-black/50 dark:text-white/50">{c.status}</span>
      </div>
      <p className="mt-1 text-black/70 dark:text-white/70">{c.description}</p>
      {c.signals.map((s, i) => (
        <p key={i} className="mt-1 text-xs text-black/50 dark:text-white/50">
          AI signal: {s.signal_type} ({((s.confidence ?? 0) * 100).toFixed(0)}% confidence)
        </p>
      ))}
      {c.status === "OPEN" && (
        <div className="mt-2 flex flex-col gap-1">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => resolve("CONFIRMED")}
              disabled={busy}
              className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => resolve("DISMISSED")}
              disabled={busy}
              className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function FraudCasesPanel() {
  const { token } = useAuth();
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api.listFraudCases(token).then(setCases).catch(() => setError("Could not load fraud cases."));
  }

  useEffect(refresh, [token]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Fraud & scam reports</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          An AI triage signal (real Claude classification) is attached automatically —
          a human investigator always makes the final call, never the model.
        </p>
      </div>

      <ReportFraudForm onReported={(c) => setCases((prev) => [c, ...prev])} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 text-lg font-medium">Reports (yours, or all if you hold an investigative role)</h2>
        <ul className="flex flex-col gap-2">
          {cases.map((c) => (
            <FraudCaseRow key={c.id} c={c} onResolved={refresh} />
          ))}
          {cases.length === 0 && <p className="text-sm text-black/60 dark:text-white/60">No reports yet.</p>}
        </ul>
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
