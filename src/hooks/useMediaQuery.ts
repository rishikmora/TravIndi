'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** SSR-safe media query subscription. The server snapshot is `fallback`. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

export const useIsTouchDevice = () => useMediaQuery('(hover: none) and (pointer: coarse)');

export const useIsMobileViewport = () => useMediaQuery('(max-width: 767px)');
