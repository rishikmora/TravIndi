import { create } from 'zustand';
import { isMockMode } from '@/lib/config/env';
import { syncMachine, type SyncEvent, type SyncState } from '@/lib/state/machine';

/** Mirrors `MOCK_NETWORK_EVENT` in the development backend, without importing it. */
const MOCK_NETWORK_EVENT = 'travindi:mock-network';

interface ConnectivityStore {
  state: SyncState;
  online: boolean;
  /** Actions saved on this device that have not reached the server yet. */
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  send: (event: SyncEvent, detail?: { error?: string }) => void;
  setPending: (count: number) => void;
}

export const useConnectivity = create<ConnectivityStore>()((set) => ({
  state: 'online',
  online: true,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  send: (event, detail) =>
    set((current) => {
      const state = syncMachine.next(current.state, event);
      return {
        state,
        online: event === 'WENT_OFFLINE' ? false : event === 'CAME_ONLINE' ? true : current.online,
        lastSyncedAt: event === 'SYNC_SUCCEEDED' ? new Date().toISOString() : current.lastSyncedAt,
        lastError: event === 'SYNC_FAILED' ? (detail?.error ?? 'Some changes could not be synced.') : event === 'SYNC_SUCCEEDED' ? null : current.lastError,
      };
    }),
  setPending: (pendingCount) => set({ pendingCount }),
}));

let simulatedOffline = false;
const listeners = new Set<(online: boolean) => void>();

export function isBrowserOnline() {
  const browser = typeof navigator === 'undefined' ? true : navigator.onLine;
  return browser && !simulatedOffline;
}

export function onConnectivityChange(listener: (online: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts watching the network. Returns a cleanup function. */
export function startConnectivityMonitor() {
  if (typeof window === 'undefined') return () => {};

  const update = () => {
    const online = isBrowserOnline();
    const store = useConnectivity.getState();
    if (online === store.online) return;
    store.send(online ? 'CAME_ONLINE' : 'WENT_OFFLINE');
    listeners.forEach((listener) => listener(online));
  };
  const onMockNetwork = (event: Event) => {
    simulatedOffline = Boolean((event as CustomEvent<{ offline: boolean }>).detail?.offline);
    update();
  };

  if (!isBrowserOnline()) useConnectivity.setState({ state: 'offline', online: false });
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  if (isMockMode) window.addEventListener(MOCK_NETWORK_EVENT, onMockNetwork);

  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
    window.removeEventListener(MOCK_NETWORK_EVENT, onMockNetwork);
  };
}
