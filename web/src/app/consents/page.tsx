"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Consent } from "@/lib/api";

// No source document names specific consent purposes (identity.user_consents.purpose
// is a free-text column) — these are suggestions tied to this app's actual data uses,
// not a confirmed taxonomy. "Other" lets the user (or a demo) enter anything.
const SUGGESTED_PURPOSES = [
  { value: "location_sharing", label: "Location sharing (crowd/safety features, safe routing)" },
  { value: "ai_trip_personalization", label: "AI trip personalization (uses your travel preferences)" },
  { value: "emergency_data_sharing", label: "Sharing your data with authorities during an emergency" },
  { value: "other", label: "Other" },
];

function ConsentsPanel() {
  const { token } = useAuth();
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [purpose, setPurpose] = useState(SUGGESTED_PURPOSES[0].value);
  const [customPurpose, setCustomPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    try {
      await api.revokeConsent(id, token);
      setConsents((c) => (c ?? []).map((x) => (x.id === id ? { ...x, status: "REVOKED", revoked_at: new Date().toISOString() } : x)));
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not revoke consent.");
    }
  }

  const granted = consents?.filter((c) => c.status === "GRANTED") ?? [];

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-semibold">Privacy & consent</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Each consent is its own record you can revoke any time — never a hidden checkbox.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {consents === null && !error && <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}

      {consents && consents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {consents.map((c) => (
            <li key={c.id} className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.purpose}</span>
                <span
                  className={`text-xs uppercase ${c.status === "GRANTED" ? "text-green-600" : "text-black/40 dark:text-white/40"}`}
                >
                  {c.status}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                <span>v{c.version}</span>
                {c.status === "GRANTED" && (
                  <button onClick={() => onRevoke(c.id)} className="underline">
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onGrant} className="flex flex-col gap-3 rounded border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium">Grant a consent</h2>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          {SUGGESTED_PURPOSES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {purpose === "other" && (
          <input
            value={customPurpose}
            onChange={(e) => setCustomPurpose(e.target.value)}
            placeholder="Custom purpose"
            required
            className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
        )}
        <button
          type="submit"
          disabled={submitting || granted.some((g) => g.purpose === (purpose === "other" ? customPurpose.trim() : purpose))}
          className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Granting…" : "Grant consent"}
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
