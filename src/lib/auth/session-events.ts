/**
 * Framework-free auth plumbing shared by the transport and the React auth
 * provider. Keeps the HTTP layer independent of React.
 */

type Listener = () => void;

const unauthorizedListeners = new Set<Listener>();

export const sessionEvents = {
  onUnauthorized(listener: Listener): () => void {
    unauthorizedListeners.add(listener);
    return () => {
      unauthorizedListeners.delete(listener);
    };
  },
  emitUnauthorized() {
    unauthorizedListeners.forEach((listener) => listener());
  },
};

/**
 * Bearer mode only. The access token lives in memory — never localStorage —
 * so it is not readable by injected scripts after a reload.
 */
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};
