"use client";

import { useConnectivity } from "@/lib/offline/connectivity";

export function OfflineBanner() {
  const online = useConnectivity();
  if (online) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-danger/10 px-4 py-2 text-center text-xs font-medium text-danger">
      You&apos;re offline — SOS, incident reports, and itinerary edits are saved on this device and will sync
      automatically once you&apos;re back online.
    </div>
  );
}
