'use client';

import { type ReactNode, useEffect } from 'react';
import { AppProviders } from '@/components/app/AppProviders';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { usePreferences } from '@/store/preferences';
import { useUIStore } from '@/store/ui';

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** App-wide client wiring: preference hydration, document flags and shortcuts. */
export function Providers({ children }: { children: ReactNode }) {
  const motion = usePreferences((s) => s.motion);
  const highContrast = usePreferences((s) => s.highContrast);
  const textSize = usePreferences((s) => s.textSize);
  const seniorMode = usePreferences((s) => s.seniorMode);
  const systemReduced = usePrefersReducedMotion();

  useEffect(() => {
    void usePreferences.persist.rehydrate();
  }, []);

  useEffect(() => {
    const reduced = motion === 'reduced' || seniorMode || (motion === 'system' && systemReduced);
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [motion, seniorMode, systemReduced]);

  useEffect(() => {
    document.documentElement.dataset.text = textSize;
    document.documentElement.dataset.senior = seniorMode ? 'on' : 'off';
  }, [textSize, seniorMode]);

  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
  }, [highContrast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUIStore.getState();
      const commandK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (commandK || (event.key === '/' && !isTypingTarget(event.target) && !ui.searchOpen)) {
        event.preventDefault();
        if (ui.searchOpen) ui.closeSearch();
        else ui.openSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return <AppProviders>{children}</AppProviders>;
}
