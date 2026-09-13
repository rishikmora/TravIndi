'use client';

import { useSyncExternalStore } from 'react';

/*
 * A shared clock for relative times ("4 min ago"). Server render and hydration
 * see `0`, so time-dependent text only appears after mount and never causes a
 * hydration mismatch.
 */

const TICK_MS = 15_000;
let now = typeof window === 'undefined' ? 0 : Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Milliseconds since epoch, refreshed every 15 seconds; `0` during SSR and hydration. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}
