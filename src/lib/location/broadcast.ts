import { create } from 'zustand';

/*
 * Which shares this browser tab is sending positions for. Session-scoped on
 * purpose: a web page can't send location in the background, so when the tab
 * closes, sending stops — and the UI says so instead of implying otherwise.
 */

const KEY = 'travindi:broadcasting';
const EVENT = 'travindi:broadcasting-change';

export function broadcastingIds(): string[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
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
