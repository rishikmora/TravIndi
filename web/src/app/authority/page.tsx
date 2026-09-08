"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type AuthorityDashboard, type Sos, type Incident } from "@/lib/api";

function AuthorityPanel() {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState<AuthorityDashboard | null>(null);
  const [sosList, setSosList] = useState<Sos[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  function applyRefreshResult(d: AuthorityDashboard, s: Sos[], i: Incident[]) {
    setDashboard(d);
    setSosList(s);
    setIncidents(i);
    setError(null);
  }

  function applyRefreshError(err: unknown) {
    setError(
      isApiError(err) && err.status === 403
        ? "This view is only available to authority accounts (e.g. log in as test-police@example.com)."
        : "Could not load the command center."
    );
  }

  async function refresh() {
    if (!token) return;
    try {
      const [d, s, i] = await Promise.all([
        api.getAuthorityDashboard(token),
        api.listSos(token),
        api.listIncidents(token),
      ]);
      applyRefreshResult(d, s, i);
    } catch (err) {
      applyRefreshError(err);
    }
  }

  useEffect(() => {
    if (!token) return;
    Promise.all([api.getAuthorityDashboard(token), api.listSos(token), api.listIncidents(token)])
      .then(([d, s, i]) => applyRefreshResult(d, s, i))
      .catch(applyRefreshError);
  }, [token]);

  async function onAcknowledge(id: string) {
    if (!token) return;
    await api.acknowledgeSos(id, token);
    refresh();
  }

  async function onResolveSos(id: string) {
    if (!token) return;
    await api.resolveSos(id, token);
    refresh();
  }

  async function onAssign(id: string) {
    if (!token) return;
    await api.assignIncident(id, token);
    refresh();
  }

  async function onResolveIncident(id: string) {
    if (!token) return;
    await api.resolveIncident(id, token);
    refresh();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <h1 className="text-2xl font-semibold">Authority command center</h1>

      <div className="flex gap-4 text-sm">
        <Link href="/authority/verifications" className="underline">
          Verification queue
        </Link>
        <Link href="/trust/fraud" className="underline">
          Fraud cases
        </Link>
        <Link href="/authority/analytics" className="underline">
          Analytics
        </Link>
      </div>

      {dashboard && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded border border-black/10 p-4 dark:border-white/15">
            <div className="text-2xl font-semibold">{dashboard.active_sos_count}</div>
            <div className="text-xs text-black/60 dark:text-white/60">Active SOS</div>
          </div>
          <div className="rounded border border-black/10 p-4 dark:border-white/15">
            <div className="text-2xl font-semibold">{dashboard.open_incident_count}</div>
            <div className="text-xs text-black/60 dark:text-white/60">Open incidents</div>
          </div>
          <div className="rounded border border-black/10 p-4 dark:border-white/15">
            <div className="text-2xl font-semibold">{dashboard.high_risk_cell_count}</div>
            <div className="text-xs text-black/60 dark:text-white/60">High-risk cells</div>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium">SOS requests</h2>
        <ul className="flex flex-col gap-2">
          {sosList.map((s) => (
            <li key={s.id} className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
              <div className="flex items-center justify-between">
                <span>{new Date(s.created_at).toLocaleString()}</span>
                <span className="text-xs uppercase text-black/50 dark:text-white/50">{s.status}</span>
              </div>
              {!["RESOLVED", "CANCELLED", "FALSE_ALARM"].includes(s.status) && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => onAcknowledge(s.id)} className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                    Acknowledge
                  </button>
                  <button onClick={() => onResolveSos(s.id)} className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                    Resolve
                  </button>
                </div>
              )}
            </li>
          ))}
          {sosList.length === 0 && <p className="text-sm text-black/60 dark:text-white/60">None.</p>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Incident reports</h2>
        <ul className="flex flex-col gap-2">
          {incidents.map((i) => (
            <li key={i.id} className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
              <div className="flex items-center justify-between">
                <span>
                  {i.incident_type} ({i.severity})
                </span>
                <span className="text-xs uppercase text-black/50 dark:text-white/50">{i.status}</span>
              </div>
              {!["RESOLVED", "CANCELLED", "FALSE_ALARM"].includes(i.status) && (
                <div className="mt-2 flex gap-2">
                  {i.status === "REPORTED" && (
                    <button onClick={() => onAssign(i.id)} className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                      Assign to me
                    </button>
                  )}
                  <button onClick={() => onResolveIncident(i.id)} className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                    Resolve
                  </button>
                </div>
              )}
            </li>
          ))}
          {incidents.length === 0 && <p className="text-sm text-black/60 dark:text-white/60">None.</p>}
        </ul>
      </section>
    </div>
  );
}

export default function AuthorityPage() {
  return (
    <RequireAuth>
      <AuthorityPanel />
    </RequireAuth>
  );
}
