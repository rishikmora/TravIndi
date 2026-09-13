'use client';

import { useEffect } from 'react';
import { env } from '@/lib/config/env';

/** Registers the offline service worker when enabled (on by default in production builds). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!env.enableServiceWorker || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Offline support is an enhancement; the app works without it.
    });
  }, []);
  return null;
}
