/**
 * Development-only network simulation. Lets the offline, reconnect and sync
 * states be exercised without unplugging anything. Has no effect in API mode.
 */

export const MOCK_NETWORK_EVENT = 'travindi:mock-network';

type Listener = (online: boolean) => void;

class NetworkSimulator {
  private simulatedOffline = false;
  private listeners = new Set<Listener>();

  get online(): boolean {
    const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    return browserOnline && !this.simulatedOffline;
  }

  get simulatingOffline() {
    return this.simulatedOffline;
  }

  setSimulatedOffline(offline: boolean) {
    if (this.simulatedOffline === offline) return;
    this.simulatedOffline = offline;
    this.listeners.forEach((listener) => listener(this.online));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MOCK_NETWORK_EVENT, { detail: { offline } }));
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const mockNetwork = new NetworkSimulator();
