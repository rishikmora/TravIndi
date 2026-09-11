"use client";

import { useEffect, useState } from "react";

/**
 * Registers `/sw.js` and surfaces a real "update available" banner rather
 * than silently hot-swapping the app mid-session — the service worker
 * update-safety rule from the offline-first spec. `skipWaiting` only ever
 * runs in direct response to the user's own click.
 */
export function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Turbopack's dev-mode chunk URLs aren't content-hashed the way a
      // production build's are — this SW's cache-first strategy for
      // `_next/static/` would otherwise serve a stale dev chunk forever
      // (surviving even a full dev-server restart, since the cache is
      // the browser's, not the server's), hit and confirmed for real
      // while building this feature. Production behavior is unaffected —
      // there, content-hashed filenames make cache-first correct.
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && registration.waiting) {
              setWaitingWorker(registration.waiting);
            }
          });
        });
      })
      .catch(() => {
        // Offline support just isn't available in this browser/context —
        // the rest of the app keeps working online-only.
      });

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waitingWorker) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-border bg-surface px-4 py-3 text-sm shadow-lg">
      <span>A new version of TravIndi is available.</span>
      <button
        onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}
        className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        Reload to update
      </button>
    </div>
  );
}
