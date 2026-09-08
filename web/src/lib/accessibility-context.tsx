"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AccessibilityPreferences } from "./api";
import { useAuth } from "./auth-context";

const STORAGE_KEY = "travindi.a11y";
const DEFAULTS: AccessibilityPreferences = { high_contrast: false, large_text: false, reduce_motion: false };

interface AccessibilityContextValue {
  preferences: AccessibilityPreferences;
  update: (next: AccessibilityPreferences) => Promise<void>;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

function loadStored(): AccessibilityPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function applyToDocument(prefs: AccessibilityPreferences) {
  const root = document.documentElement;
  root.setAttribute("data-a11y-high-contrast", String(prefs.high_contrast));
  root.setAttribute("data-a11y-large-text", String(prefs.large_text));
  root.setAttribute("data-a11y-reduce-motion", String(prefs.reduce_motion));
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  // Deliberately starts as the DEFAULTS constant (not a lazy localStorage
  // read) so server and client render identically on first paint — same
  // hydration-safety reasoning as auth-context.tsx's token/loading state.
  // The real stored value is applied in the effect below, client-side only.
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(DEFAULTS);

  useEffect(() => {
    // Not a lazy `useState(() => loadStored())` initializer on purpose:
    // `loadStored()` reads `window.localStorage`, which doesn't exist during
    // this "use client" component's SSR pass — a lazy initializer would
    // diverge server/client initial state and break hydration, the exact
    // bug documented in auth-context.tsx for the identical situation. This
    // effect-based reconciliation (server and client both start from
    // DEFAULTS, then this runs client-side only, after mount) is correct.
    const stored = loadStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferences(stored);
    applyToDocument(stored);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .getAccessibilityPreferences(token)
      .then((server) => {
        setPreferences(server);
        applyToDocument(server);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(server));
      })
      .catch(() => {
        // No profile row yet, or a transient error — the locally-stored
        // (or default) preferences already applied above remain in effect.
      });
  }, [token]);

  async function update(next: AccessibilityPreferences) {
    setPreferences(next);
    applyToDocument(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (token) {
      await api.setAccessibilityPreferences(next, token);
    }
  }

  return <AccessibilityContext.Provider value={{ preferences, update }}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
