'use client';

import { onlineManager, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { LocationBroadcaster } from '@/components/location/LocationBroadcaster';
import { AuthProvider, useAuth } from '@/lib/auth/provider';
import { sessionEvents } from '@/lib/auth/session-events';
import { isBrowserOnline, onConnectivityChange, startConnectivityMonitor, useConnectivity } from '@/lib/offline/connectivity';
import { flushOutbox } from '@/lib/offline/outbox';
import { createQueryClient } from '@/lib/query/client';
import { RealtimeProvider } from '@/lib/realtime/provider';

/** Re-syncs when the connection returns: refetch what is on screen, then send the outbox. */
function SyncCoordinator() {
  const queryClient = useQueryClient();
  const { status } = useAuth();

  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const release = onConnectivityChange(async (online) => {
      if (!online) return;
      const { send } = useConnectivity.getState();
      send('SYNC_STARTED');
      try {
        await queryClient.invalidateQueries();
        const result = status === 'authenticated' ? await flushOutbox() : { rejected: 0, remaining: 0 };
        if (result.remaining > 0) send('SYNC_FAILED', { error: `${result.remaining} saved action(s) are still waiting to send.` });
        else send('SYNC_SUCCEEDED');
      } catch {
        send('SYNC_FAILED');
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => useConnectivity.getState().send('SETTLED'), 3000);
    });
    return () => {
      release();
      clearTimeout(settleTimer);
    };
  }, [queryClient, status]);

  useEffect(() => {
    if (status === 'authenticated' && isBrowserOnline()) void flushOutbox();
  }, [status]);

  return null;
}

function RealtimeBridge({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <RealtimeProvider userId={user?.userId ?? null}>
      <LocationBroadcaster />
      {children}
    </RealtimeProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient(() => sessionEvents.emitUnauthorized()));

  useEffect(() => startConnectivityMonitor(), []);

  useEffect(() => {
    onlineManager.setEventListener((setOnline) => {
      setOnline(isBrowserOnline());
      return onConnectivityChange(setOnline);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncCoordinator />
        <RealtimeBridge>{children}</RealtimeBridge>
      </AuthProvider>
    </QueryClientProvider>
  );
}
