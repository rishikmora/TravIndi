'use client';

import { useSyncExternalStore } from 'react';
import { usePreferences } from '@/store/preferences';
import { usePrefersReducedMotion } from './useMediaQuery';

/** Resolves the effective motion preference: explicit choice beats the OS. */
export function useReducedMotion(): boolean {
  const system = usePrefersReducedMotion();
  const motion = usePreferences((s) => s.motion);
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  return system;
}

const noopSubscribe = () => () => {};

/** False during SSR and the hydration render, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
