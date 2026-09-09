import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, readTokens, writeTokens, type StoredTokens } from "./api-client";

export type AccountType = "tourist" | "guide" | "business";

export type Role =
  | "tourist"
  | "guide"
  | "business"
  | "authority_police"
  | "authority_emergency_responder"
  | "authority_tourism_dept"
  | "authority_municipality"
  | "authority_verifier"
  | "authority_platform_admin";

export interface CurrentUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  account_type: Role;
  status?: string;
  preferred_language?: string;
  travel_preferences?: Record<string, unknown> | null;
  accessibility_preferences?: Record<string, unknown> | null;
  notification_preferences?: Record<string, unknown> | null;
}

export interface Credentials {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisterInput extends Credentials {
  account_type: AccountType;
}

interface AuthContextValue {
  token: string | null;
  me: CurrentUser | null;
  loading: boolean;
  login: (input: Credentials) => Promise<CurrentUser | null>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async (accessToken: string | null) => {
    if (!accessToken) {
      setMe(null);
      return null;
    }
    const user = await apiClient.get<CurrentUser>("/users/me", { token: accessToken });
    setMe(user);
    return user;
  }, []);

  // Restore a stored session on the client only.
  useEffect(() => {
    let cancelled = false;
    const stored = readTokens();
    if (!stored?.access_token) {
      setLoading(false);
      return;
    }
    setToken(stored.access_token);
    loadMe(stored.access_token)
      .catch(() => {
        if (!cancelled) {
          writeTokens(null);
          setToken(null);
          setMe(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const login = useCallback(
    async (input: Credentials) => {
      const tokens = await apiClient.post<StoredTokens>("/auth/login", input, { auth: false });
      writeTokens(tokens);
      setToken(tokens.access_token);
      const user = await loadMe(tokens.access_token).catch(() => null);
      return user;
    },
    [loadMe],
  );

  const register = useCallback(async (input: RegisterInput) => {
    await apiClient.post<unknown>("/auth/register", input, { auth: false });
  }, []);

  const logout = useCallback(() => {
    writeTokens(null);
    setToken(null);
    setMe(null);
  }, []);

  const refreshMe = useCallback(async () => {
    await loadMe(token);
  }, [loadMe, token]);

  const value = useMemo(
    () => ({ token, me, loading, login, register, logout, refreshMe }),
    [token, me, loading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function isAuthority(role?: Role | null) {
  return Boolean(role?.startsWith("authority_"));
}

export function roleLabel(role?: Role | null) {
  if (!role) return "Guest";
  return role
    .replace("authority_", "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
