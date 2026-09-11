"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { ListSkeleton } from "@/components/Skeleton";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  KNOWN_ROLES,
  type AdminUser,
  type AuditLogEntry,
  type KnownRole,
  type PolicyRegistryEntry,
  type RetentionRuleEntry,
} from "@/lib/api";

function roleLabel(role: string) {
  return role
    .replace(/^authority_/, "")
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: (u: AdminUser) => void }) {
  const { token } = useAuth();
  const [role, setRole] = useState<KnownRole | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function applyRole() {
    if (!token || !role) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await api.adminChangeUserRole(user.id, role, token);
      onChanged(updated);
      setRole("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not change this user's role.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await api.adminChangeUserStatus(
        user.id,
        user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
        token
      );
      onChanged(updated);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not change this user's status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium">{user.email ?? user.phone ?? user.id}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-foreground/55">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium">{user.account_type}</span>
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              user.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {user.status}
          </span>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as KnownRole)}
          disabled={busy}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Change role…</option>
          {KNOWN_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <button
          onClick={applyRole}
          disabled={busy || !role}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-40"
        >
          Apply
        </button>
        <button
          onClick={toggleStatus}
          disabled={busy}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
            user.status === "ACTIVE" ? "bg-danger/10 text-danger hover:bg-danger/15" : "bg-success/10 text-success hover:bg-success/15"
          }`}
        >
          {user.status === "ACTIVE" ? "Suspend" : "Reactivate"}
        </button>
      </div>
    </li>
  );
}

function UsersSection() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh(query?: string) {
    if (!token) return;
    api
      .adminListUsers({ q: query, limit: 50 }, token)
      .then((rows) => {
        setUsers(rows);
        setError(null);
      })
      .catch((err) =>
        setError(
          isApiError(err) && err.status === 403
            ? "This view is only available to platform admin accounts (in this demo, log in as admin.demo@travindi-demo.in)."
            : "Could not load users."
        )
      );
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `refresh` closes only over `token`, already listed
  useEffect(() => refresh(), [token]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Users & roles</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            refresh(q || undefined);
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or phone…"
            className="rounded-full border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button type="submit" className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-muted">
            Search
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="flex flex-col gap-2">
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            onChanged={(updated) => setUsers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
          />
        ))}
        {users.length === 0 && !error && <p className="text-sm text-foreground/60">No users found.</p>}
      </ul>
    </section>
  );
}

function AuditLogSection() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    if (!token) return;
    api.adminListAuditLog({ limit: 30 }, token).then(setEntries).catch(() => setEntries([]));
  }, [token]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Audit log</h2>
      <p className="text-xs text-foreground/50">
        Real entries — written whenever an admin action or a verification decision happens. Not every write in the
        system is audited yet, only these back-office actions.
      </p>
      {entries === null && <ListSkeleton count={3} />}
      {entries && entries.length === 0 && <p className="text-sm text-foreground/60">No audit events yet.</p>}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted text-foreground/60">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Resource</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="bg-surface">
                  <td className="px-3 py-2 whitespace-nowrap text-foreground/70">
                    {new Date(e.occurred_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-medium">{e.action}</td>
                  <td className="px-3 py-2 text-foreground/70">
                    {e.resource_type}
                    {e.resource_id ? ` · ${e.resource_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        e.outcome === "SUCCESS" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                      }`}
                    >
                      {e.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SystemConfigSection() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState<PolicyRegistryEntry[]>([]);
  const [retentionRules, setRetentionRules] = useState<RetentionRuleEntry[]>([]);

  useEffect(() => {
    if (!token) return;
    api.adminListPolicies(token).then(setPolicies).catch(() => setPolicies([]));
    api.adminListRetentionRules(token).then(setRetentionRules).catch(() => setRetentionRules([]));
  }, [token]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">System configuration</h2>
      <p className="text-xs text-foreground/50">
        Read-only registries — the policy source itself lives in version control; this is what&apos;s recorded as
        currently in force, not a live editor.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium">Policies</h3>
          {policies.length === 0 ? (
            <p className="text-xs text-foreground/55">None registered yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {policies.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>
                    {p.name} <span className="text-foreground/50">v{p.version}</span>
                  </span>
                  <span className={p.active ? "text-success" : "text-foreground/55"}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium">Retention rules</h3>
          {retentionRules.length === 0 ? (
            <p className="text-xs text-foreground/55">None registered yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {retentionRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>{r.data_class}</span>
                  <span className="text-foreground/50">
                    {r.retention_period_days != null ? `${r.retention_period_days} days` : "Not set"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminPanel() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-1 text-sm text-foreground/60">
          User & role management, audit trail, and system configuration — platform-admin only.
        </p>
      </div>
      <Link href="/authority" className="text-sm font-medium text-primary">
        ← Back to command center
      </Link>
      <UsersSection />
      <AuditLogSection />
      <SystemConfigSection />
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminPanel />
    </RequireAuth>
  );
}
