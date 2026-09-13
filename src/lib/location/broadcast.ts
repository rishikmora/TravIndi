import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

/*
 * Which shares this browser tab is sending positions for. Session-scoped on
 * purpose: a web page can't send location in the background, so when the tab
 * closes, sending stops — and the UI says so instead of implying otherwise.
 */

const KEY = 'travindi:broadcasting';
const EVENT = 'travindi:broadcasting-change';
const NONE: string[] = [];

let lastRaw: string | null = null;
let lastIds: string[] = NONE;

/** The ids from session storage; the same array is returned until they change. */
export function broadcastingIds(): string[] {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    try {
      const parsed = JSON.parse(raw ?? '[]');
      lastIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : NONE;
    } catch {
      lastIds = NONE;
    }
  }
  return lastIds;
}

function write(ids: string[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: sending simply won't resume after a reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const markBroadcasting = (shareId: string) => write([...new Set([...broadcastingIds(), shareId])]);
export const unmarkBroadcasting = (shareId: string) => write(broadcastingIds().filter((id) => id !== shareId));

export function onBroadcastingChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Share ids this tab is sending for, kept in sync across every component that reads them. */
export function useBroadcastingIds(): string[] {
  return useSyncExternalStore(onBroadcastingChange, broadcastingIds, () => NONE);
}

interface BroadcastStatus {
  lastSentAt: string | null;
  error: string | null;
  sent: () => void;
  fail: (message: string) => void;
}

export const useBroadcastStatus = create<BroadcastStatus>()((set) => ({
  lastSentAt: null,
  error: null,
  sent: () => set({ lastSentAt: new Date().toISOString(), error: null }),
  fail: (error) => set({ error }),
}));
