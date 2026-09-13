'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { camelizeKeys } from '@/lib/api/case';
import { sessionEvents, tokenStore } from '@/lib/auth/session-events';
import { env, isMockMode } from '@/lib/config/env';
import { isBrowserOnline, onConnectivityChange } from '@/lib/offline/connectivity';
import { queryKeys } from '@/lib/query/keys';
import type { LocationShare, SosAlert } from '@/types/domain';
import type { AnyRealtimeEvent, ChannelName, RealtimeConnectionState } from '@/types/realtime/events';
import { RealtimeClient } from './client';
import type { SocketFactory } from './socket';

function socketFactory(): SocketFactory {
  if (isMockMode) {
    return async () => (await import('@/lib/mock-backend')).getMockBackend().hub.createSocket();
  }
  const base = env.wsUrl || env.apiBaseUrl.replace(/^http/, 'ws');
  // Credentials are sent in the first frame, never in the URL.
  return () => new WebSocket(`${base}/v1/realtime`);
}

/** Global cache effects. Screens with richer needs also listen via `useRealtimeEvents`. */
function applyEvent(queryClient: QueryClient, event: AnyRealtimeEvent) {
  const invalidate = (queryKey: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey });
  switch (event.name) {
    case 'message.created':
    case 'message.read':
      invalidate(queryKeys.chat.conversations);
      invalidate(queryKeys.trips.list);
      return;
    case 'location.updated': {
      const { share_id, location } = event.payload;
      const lastLocation = camelizeKeys(location);
      const merge = (share: LocationShare | undefined) =>
        share ? { ...share, lastLocation, lastLocationAt: lastLocation.recordedAt } : share;
      queryClient.setQueryData<LocationShare>(queryKeys.location.share(share_id), merge);
      queryClient.setQueryData<LocationShare[]>(queryKeys.location.visible, (shares) =>
        shares?.map((share) => (share.shareId === share_id ? merge(share)! : share)),
      );
      return;
    }
    case 'location.expired':
    case 'location.revoked':
      invalidate(queryKeys.location.all);
      return;
    case 'adaptation.proposed':
    case 'adaptation.applied':
    case 'adaptation.rejected':
    case 'adaptation.expired':
    case 'adaptation.failed': {
      const tripId = event.name === 'adaptation.proposed' ? event.payload.proposal.trip_id : event.payload.trip_id;
      invalidate(queryKeys.trips.detail(tripId));
      invalidate(queryKeys.me.home);
      return;
    }
    case 'notification.created':
      invalidate(queryKeys.notifications.all);
      return;
    case 'sos.updated': {
      const alert = camelizeKeys(event.payload.alert) as SosAlert;
      queryClient.setQueryData(queryKeys.sos.detail(alert.alertId), alert);
      const open = alert.status === 'received' || alert.status === 'acknowledged' || alert.status === 'responding';
      queryClient.setQueryData<SosAlert | null>(queryKeys.sos.active, (current) =>
        open ? alert : current?.alertId === alert.alertId ? null : current,
      );
      return;
    }
    case 'booking.updated': {
      invalidate(queryKeys.bookings.all);
      const tripId = event.payload.booking.trip_id;
      if (tripId) {
        invalidate(queryKeys.trips.bookingRecommendations(tripId));
        invalidate(queryKeys.trips.itinerary(tripId));
      }
      return;
    }
    case 'authority.sos.updated':
      invalidate(['authority', 'sos']);
      invalidate(queryKeys.authority.overview);
      return;
    default:
      return;
  }
}

const RealtimeContext = createContext<RealtimeClient | null>(null);

export function RealtimeProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(
    () =>
      new RealtimeClient({
        createSocket: socketFactory(),
        getToken: tokenStore.get,
        isOnline: isBrowserOnline,
        // Events may have been missed while disconnected: REST is the source of truth.
        onResync: () => void queryClient.invalidateQueries(),
        onUnauthorized: sessionEvents.emitUnauthorized,
      }),
  );

  useEffect(() => client.onEvent((event) => applyEvent(queryClient, event)), [client, queryClient]);

  useEffect(() => {
    if (!userId) {
      client.stop();
      return;
    }
    const release = client.subscribe(`user:${userId}`);
    client.start();
    return () => {
      release();
      client.stop();
    };
  }, [client, userId]);

  useEffect(() => onConnectivityChange((online) => (online ? client.retryNow() : client.markOffline())), [client]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeClient() {
  return useContext(RealtimeContext);
}

export function useRealtimeState(): RealtimeConnectionState {
  const client = useContext(RealtimeContext);
  return useSyncExternalStore(
    (onChange) => (client ? client.onState(onChange) : () => undefined),
    () => client?.state ?? 'idle',
    () => 'idle',
  );
}

/** Subscribes to a channel while the component is mounted. */
export function useChannel(channel: ChannelName | null) {
  const client = useContext(RealtimeContext);
  useEffect(() => (client && channel ? client.subscribe(channel) : undefined), [client, channel]);
}

/** Receives every realtime event; the latest handler is always used. */
export function useRealtimeEvents(handler: (event: AnyRealtimeEvent) => void) {
  const client = useContext(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => (client ? client.onEvent((event) => latest.current(event)) : undefined), [client]);
}
