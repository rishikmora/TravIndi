"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { api, type AppNotification } from "@/lib/api";
import { AlertTriangleIcon, BellIcon, ShieldIcon, UsersIcon } from "@/components/icons";

const TYPE_META: Record<string, { icon: typeof BellIcon; tone: string; label: string }> = {
  sos_update: { icon: ShieldIcon, tone: "bg-danger/10 text-danger", label: "SOS updates" },
  incident_update: { icon: AlertTriangleIcon, tone: "bg-primary/10 text-primary", label: "Incident updates" },
  group_sos: { icon: UsersIcon, tone: "bg-danger/10 text-danger", label: "Group SOS alerts" },
};
// Every real notification_type this backend ever creates — a preferences
// toggle for a type that could never actually fire would be a fake control.
const TOGGLEABLE_TYPES = ["sos_update", "incident_update", "group_sos"] as const;

function typeMeta(type: string) {
  return TYPE_META[type] ?? { icon: BellIcon, tone: "bg-surface-muted text-foreground/60", label: type };
}

function PreferencesPanel() {
  const { token } = useAuth();
  const [preferences, setPreferences] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getNotificationPreferences(token).then((r) => setPreferences(r.preferences)).catch(() => setError("Could not load preferences."));
  }, [token]);

  async function toggle(type: string) {
    if (!token || !preferences) return;
    const next = { ...preferences, [type]: preferences[type] === false ? true : false };
    setSaving(type);
    setError(null);
    try {
      const saved = await api.setNotificationPreferences(next, token);
      setPreferences(saved.preferences);
    } catch {
      setError("Could not save this preference.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">What you get notified about</h2>
      <p className="mt-1 text-xs text-foreground/50">In-app only in this prototype — no real push/SMS delivery exists yet.</p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex flex-col gap-2">
        {preferences === null && !error && (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-surface-muted" />
            ))}
          </div>
        )}
        {preferences &&
          TOGGLEABLE_TYPES.map((type) => {
            const enabled = preferences[type] !== false;
            const meta = typeMeta(type);
            return (
              <label
                key={type}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <meta.icon width={14} height={14} className="text-foreground/50" />
                  {meta.label}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={saving === type}
                  onClick={() => toggle(type)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${
                    enabled ? "bg-primary" : "bg-surface-muted"
                  }`}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                    style={{ left: enabled ? "18px" : "2px" }}
                  />
                </button>
              </label>
            );
          })}
      </div>
    </div>
  );
}

function NotificationsPanel() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.listNotifications(token).then(setNotifications).catch(() => setNotifications([]));
  }, [token]);

  async function onRead(id: string) {
    if (!token) return;
    const updated = await api.markNotificationRead(id, token);
    setNotifications((list) => (list ?? []).map((n) => (n.id === id ? updated : n)));
  }

  async function onMarkAllRead() {
    if (!token || !notifications) return;
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    setMarkingAll(true);
    try {
      await Promise.all(unread.map((n) => api.markNotificationRead(n.id, token)));
      setNotifications((list) => (list ?? []).map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">Notifications</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            disabled={markingAll}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-muted disabled:opacity-50"
          >
            {markingAll ? "Marking…" : "Mark all read"}
          </button>
        )}
      </div>

      {notifications === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
              <div className="h-4 w-2/3 rounded bg-surface-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      )}
      {notifications?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <BellIcon width={26} height={26} className="text-foreground/30" />
          <p className="text-sm text-foreground/60">No notifications yet.</p>
        </div>
      )}
      {notifications && notifications.length > 0 && (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => {
            const meta = typeMeta(n.notification_type);
            return (
              <li
                key={n.id}
                className={`flex gap-3 rounded-xl border p-3 text-sm ${n.read_at ? "border-border opacity-60" : "border-primary/30 bg-primary/5"}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                  <meta.icon width={14} height={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.read_at && (
                      <button onClick={() => onRead(n.id)} className="shrink-0 text-xs font-medium text-primary underline">
                        Mark read
                      </button>
                    )}
                  </div>
                  <p className="text-foreground/70">{n.body}</p>
                  <p className="mt-1 text-xs text-foreground/40">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PreferencesPanel />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsPanel />
    </RequireAuth>
  );
}
