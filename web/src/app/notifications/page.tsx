"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { api, type AppNotification } from "@/lib/api";

function NotificationsPanel() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listNotifications(token).then(setNotifications).catch(() => setNotifications([]));
  }, [token]);

  async function onRead(id: string) {
    if (!token) return;
    const updated = await api.markNotificationRead(id, token);
    setNotifications((list) => (list ?? []).map((n) => (n.id === id ? updated : n)));
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      {notifications === null && <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}
      {notifications?.length === 0 && <p className="text-sm text-black/60 dark:text-white/60">No notifications yet.</p>}
      <ul className="flex flex-col gap-2">
        {notifications?.map((n) => (
          <li
            key={n.id}
            className={`rounded border p-3 text-sm dark:border-white/15 ${
              n.read_at ? "border-black/10 opacity-60" : "border-black/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{n.title}</span>
              {!n.read_at && (
                <button onClick={() => onRead(n.id)} className="text-xs underline">
                  Mark read
                </button>
              )}
            </div>
            <p className="text-black/70 dark:text-white/70">{n.body}</p>
            <p className="mt-1 text-xs text-black/40 dark:text-white/40">{new Date(n.created_at).toLocaleString()}</p>
          </li>
        ))}
      </ul>
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
