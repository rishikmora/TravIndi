"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useConnectivity } from "./connectivity";
import { listQueuedMutations, removeQueuedMutation, type QueuedMutation } from "./db";
import {
  enqueueIncidentCreate,
  enqueueItineraryItemUpdate,
  enqueueSosCreate,
  flushQueue,
  subscribeToQueueChanges,
} from "./queue";

/**
 * The one hook every page offering an offline-queued action uses — SOS,
 * incident reports, itinerary-item edits. Refreshes from IndexedDB on
 * mount, on another tab's flush (BroadcastChannel), and attempts to flush
 * whenever connectivity returns.
 */
export function useOfflineQueue() {
  const { token } = useAuth();
  const online = useConnectivity();
  const [queue, setQueue] = useState<QueuedMutation[]>([]);

  const refresh = useCallback(() => {
    listQueuedMutations().then(setQueue).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    return subscribeToQueueChanges(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!online || !token) return;
    flushQueue(token)
      .then(refresh)
      .catch(() => {});
  }, [online, token, refresh]);

  const enqueueSos = useCallback(
    async (payload: Record<string, unknown>) => {
      const mutation = await enqueueSosCreate(payload);
      refresh();
      if (online && token) flushQueue(token).then(refresh).catch(() => {});
      return mutation;
    },
    [refresh, online, token]
  );

  const enqueueIncident = useCallback(
    async (payload: Record<string, unknown>) => {
      const mutation = await enqueueIncidentCreate(payload);
      refresh();
      if (online && token) flushQueue(token).then(refresh).catch(() => {});
      return mutation;
    },
    [refresh, online, token]
  );

  const enqueueItineraryItem = useCallback(
    async (payload: Record<string, unknown>) => {
      const mutation = await enqueueItineraryItemUpdate(payload);
      refresh();
      if (online && token) flushQueue(token).then(refresh).catch(() => {});
      return mutation;
    },
    [refresh, online, token]
  );

  const dismiss = useCallback(
    async (operationId: string) => {
      await removeQueuedMutation(operationId);
      refresh();
    },
    [refresh]
  );

  return { queue, online, refresh, enqueueSos, enqueueIncident, enqueueItineraryItem, dismiss };
}
