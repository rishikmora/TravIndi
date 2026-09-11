"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Me } from "./api";
import { clearAllOfflineData } from "./offline/db";

const STORAGE_KEY = "travindi.tokens";

interface StoredTokens {
  access_token: string;
  refresh_token: string;
}

interface AuthContextValue {
  token: string | null;
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, accountType: "tourist" | "guide" | "business") => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredTokens) : null;
}

function saveStoredTokens(tokens: StoredTokens | null) {
  if (typeof window === "undefined") return;
  if (tokens) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Deliberately NOT a lazy `useState(() => loadStoredTokens()...)` initializer:
  // this is a "use client" component that still gets server-rendered for the
  // initial HTML, where `window`/localStorage don't exist. A lazy initializer
  // would read real localStorage on the client's first render but null on the
  // server's, diverging the two and triggering a hydration-mismatch error —
  // hit exactly this while chasing an unrelated lint rule. Token/loading must
  // start identical (null/true) on server and client, then this effect (which
  // only ever runs client-side, after hydration) reconciles the real value.
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredTokens();
    if (!stored) {
      // The "fix" this rule suggests (compute via a lazy useState
      // initializer) reads localStorage, which doesn't exist during this
      // "use client" component's SSR pass — that diverges server/client
      // initial state and breaks hydration (verified: tried it, got a real
      // hydration-mismatch error). This effect-based reconciliation is the
      // actually-correct pattern here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setToken(stored.access_token);
    api
      .me(stored.access_token)
      .then(setMe)
      .catch(() => {
        // Access token expired/invalid and no refresh attempted here yet —
        // simplest correct behavior for a Phase 11 shell is to require a
        // fresh login rather than silently retrying; a real refresh-on-401
        // interceptor (using the stored refresh_token) is a reasonable
        // follow-up once more screens exist.
        saveStoredTokens(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const tokens = await api.login({ email, password });
    saveStoredTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    setToken(tokens.access_token);
    setMe(await api.me(tokens.access_token));
  }

  async function register(email: string, password: string, accountType: "tourist" | "guide" | "business") {
    await api.register({ email, password, account_type: accountType });
    await login(email, password);
  }

  function logout() {
    saveStoredTokens(null);
    setToken(null);
    setMe(null);
    // Offline cache/queue is sensitive, user-scoped data (SOS/incident
    // drafts, cached itinerary contents) — never let it survive past the
    // session that created it.
    void clearAllOfflineData();
  }

  async function refreshMe() {
    if (!token) return;
    setMe(await api.me(token));
  }

  return (
    <AuthContext.Provider value={{ token, me, loading, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
