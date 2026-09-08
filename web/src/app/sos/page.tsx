"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Sos } from "@/lib/api";

const FALLBACK_LOCATION = { lon: 77.2295, lat: 28.6129 }; // India Gate — used if geolocation is unavailable/denied

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

const isOpen = (s: Sos) => !["RESOLVED", "CANCELLED", "FALSE_ALARM"].includes(s.status);

function SosPanel() {
  const { token } = useAuth();
  const [active, setActive] = useState<Sos | null>(null);
  const [history, setHistory] = useState<Sos[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .listSos(token)
      .then((list) => {
        setHistory(list);
        setActive(list.find(isOpen) ?? null);
      })
      .catch(() => {
        // non-fatal — the page still works for triggering a new SOS
      });
  }, [token]);

  async function onTriggerSos() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const { lon, lat } = await getCurrentPosition();
      const sos = await api.createSos({ lon, lat, emergency_type: "general" }, token);
      setActive(sos);
      setHistory((h) => [sos, ...h]);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not send SOS. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel() {
    if (!token || !active) return;
    try {
      const updated = await api.cancelSos(active.id, token);
      setActive(null);
      setHistory((h) => h.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not cancel.");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-semibold">Emergency SOS</h1>

      {active ? (
        <div className="flex w-full flex-col items-center gap-4 rounded border border-red-500/40 bg-red-500/5 p-6 text-center">
          <p className="text-sm uppercase tracking-wide text-red-600">SOS active — {active.status}</p>
          <p className="text-sm text-black/60 dark:text-white/60">
            Sent {new Date(active.created_at).toLocaleTimeString()}. Local acknowledgement:{" "}
            {active.local_ack_at ? "confirmed" : "pending"}.
          </p>
          {active.trusted_contact_tokens.length > 0 && (
            <div className="w-full rounded border border-black/10 p-3 text-left text-xs dark:border-white/15">
              <p className="mb-2 font-medium">
                Trusted-contact links issued (no SMS channel in this prototype — share these directly):
              </p>
              {active.trusted_contact_tokens.map((t) => {
                const url =
                  typeof window !== "undefined"
                    ? `${window.location.origin}/verify?sos=${active.id}&token=${t.token}`
                    : "";
                return (
                  <div key={t.trusted_contact_id} className="mb-2">
                    <div className="font-medium">{t.trusted_contact_name}</div>
                    <a href={url} className="break-all underline">
                      {url}
                    </a>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={onCancel} className="rounded-full border border-black/15 px-5 py-2 text-sm dark:border-white/20">
            Cancel SOS
          </button>
        </div>
      ) : (
        <button
          onClick={onTriggerSos}
          disabled={submitting}
          className="flex h-40 w-40 items-center justify-center rounded-full bg-red-600 text-xl font-bold text-white shadow-lg disabled:opacity-50"
        >
          {submitting ? "Sending…" : "SOS"}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {history.length > 0 && (
        <div className="w-full">
          <h2 className="mb-2 text-sm font-medium text-black/60 dark:text-white/60">History</h2>
          <ul className="flex flex-col gap-2">
            {history.map((s) => (
              <li key={s.id} className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
                <div className="flex items-center justify-between">
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                  <span className="text-xs uppercase text-black/50 dark:text-white/50">{s.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function SosPage() {
  return (
    <RequireAuth>
      <SosPanel />
    </RequireAuth>
  );
}
