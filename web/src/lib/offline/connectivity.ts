"use client";

import { useEffect, useState } from "react";

/**
 * `navigator.onLine` plus the `online`/`offline` window events — this
 * codebase had zero connectivity detection anywhere before the
 * offline-first upgrade. Starts `true` (the safe SSR-compatible default,
 * same pattern as `auth-context.tsx`'s token reconciliation) and
 * reconciles to the real value once mounted client-side.
 */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
