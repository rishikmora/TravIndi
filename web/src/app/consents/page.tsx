"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Consent } from "@/lib/api";
import { CheckCircleIcon, ShieldIcon } from "@/components/icons";

// No source document names specific consent purposes (identity.user_consents.purpose
// is a free-text column) — these are suggestions tied to this app's actual data uses,
// not a confirmed taxonomy. "Other" lets the user (or a demo) enter anything.
const SUGGESTED_PURPOSES = [
  { value: "location_sharing", label: "Location sharing", description: "Powers crowd/safety features and safe routing." },
  { value: "ai_trip_personalization", label: "AI trip personalization", description: "Uses your saved travel preferences." },
  {
    value: "emergency_data_sharing",
    label: "Emergency data sharing",
    description: "Shares your data with authorities during an SOS.",
  },
  { value: "other", label: "Other", description: "Describe a custom purpose." },
];

function purposeLabel(purpose: string) {
  return SUGGESTED_PURPOSES.find((p) => p.value === purpose)?.label ?? purpose;
}

function ConsentsPanel() {
  const { token } = useAuth();
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [purpose, setPurpose] = useState(SUGGESTED_PURPOSES[0].value);
  const [customPurpose, setCustomPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listConsents(token).then(setConsents).catch(() => setError("Could not load consents."));
  }, [token]);

  async function onGrant(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const resolvedPurpose = purpose === "other" ? customPurpose.trim() : purpose;
    if (!resolvedPurpose) return;
    setError(null);
    setSubmitting(true);
    try {
      const consent = await api.grantConsent({ purpose: resolvedPurpose, version: "1.0" }, token);
      setConsents((c) => [consent, ...(c ?? []).filter((x) => x.purpose !== resolvedPurpose)]);
      setCustomPurpose("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not grant consent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(id: string) {
    if (!token) return;
    setRevokingId(id);
    try {
      await api.revokeConsent(id, token);
      setConsents((c) =>
        (c ?? []).map((x) => (x.id === id ? { ...x, status: "REVOKED", revoked_at: new Date().toISOString() } : x))
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not revoke consent.");
    } finally {
      setRevokingId(null);
    }
  }

  const granted = consents?.filter((c) => c.status === "GRANTED") ?? [];
  const currentPurposeValue = purpose === "other" ? customPurpose.trim() : purpose;
  const alreadyGranted = granted.some((g) => g.purpose === currentPurposeValue);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl">Privacy & consent</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Each consent is its own real record you can revoke any time — never a hidden checkbox.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {consents === null && !error && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
              <div className="h-4 w-1/2 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      )}

      {consents?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
          <ShieldIcon width={24} height={24} className="text-foreground/30" />
          <p className="text-sm text-foreground/60">No consents recorded yet.</p>
        </div>
      )}

      {consents && consents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {consents.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  {c.status === "GRANTED" && <CheckCircleIcon width={14} height={14} className="text-success" />}
                  {purposeLabel(c.purpose)}
                </span>
                <span className={`text-xs font-medium uppercase ${c.status === "GRANTED" ? "text-success" : "text-foreground/40"}`}>
                  {c.status}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-foreground/50">
                <span>Version {c.version}</span>
                {c.status === "GRANTED" && (
                  <button
                    onClick={() => onRevoke(c.id)}
                    disabled={revokingId === c.id}
                    className="font-medium text-danger/80 hover:text-danger disabled:opacity-50"
                  >
                    {revokingId === c.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onGrant} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-medium">Grant a consent</h2>
        <div className="flex flex-col gap-2">
          {SUGGESTED_PURPOSES.map((p) => (
            <label
              key={p.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                purpose === p.value ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="purpose"
                checked={purpose === p.value}
                onChange={() => setPurpose(p.value)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{p.label}</span>
                <span className="block text-xs text-foreground/55">{p.description}</span>
              </span>
            </label>
          ))}
        </div>
        {purpose === "other" && (
          <input
            value={customPurpose}
            onChange={(e) => setCustomPurpose(e.target.value)}
            placeholder="Custom purpose"
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        )}
        <button
          type="submit"
          disabled={submitting || alreadyGranted || !currentPurposeValue}
          className="self-start rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {alreadyGranted ? "Already granted" : submitting ? "Granting…" : "Grant consent"}
        </button>
      </form>
    </div>
  );
}

export default function ConsentsPage() {
  return (
    <RequireAuth>
      <ConsentsPanel />
    </RequireAuth>
  );
}
