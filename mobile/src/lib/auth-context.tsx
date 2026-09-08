import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Me } from "./api";
import { storage } from "./storage";

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadStoredTokens(): Promise<StoredTokens | null> {
  const raw = await storage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredTokens) : null;
}

async function saveStoredTokens(tokens: StoredTokens | null) {
  if (tokens) {
    await storage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } else {
    await storage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadStoredTokens().then((stored) => {
      if (cancelled) return;
      if (!stored) {
        setLoading(false);
        return;
      }
      setToken(stored.access_token);
      api
        .me(stored.access_token)
        .then((m) => {
          if (!cancelled) setMe(m);
        })
        .catch(() => {
          // Access token expired/invalid and no refresh attempted here yet —
          // simplest correct behavior for a Phase 11 shell is to require a
          // fresh login rather than silently retrying; a real refresh-on-401
          // interceptor (using the stored refresh_token) is a reasonable
          // follow-up once more screens exist.
          if (cancelled) return;
          saveStoredTokens(null);
          setToken(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const tokens = await api.login({ email, password });
    await saveStoredTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
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
  }

  return (
    <AuthContext.Provider value={{ token, me, loading, login, register, logout }}>
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
