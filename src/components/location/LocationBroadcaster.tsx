'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { unmarkBroadcasting, useBroadcastingIds, useBroadcastStatus } from '@/lib/location/broadcast';
import { watchPosition } from '@/lib/location/geolocation';
import { isBrowserOnline } from '@/lib/offline/connectivity';
import { useMyShares } from '@/lib/query/hooks/location';
import { haversineKm } from '@/utils/geo';

const MIN_INTERVAL_MS = 20_000;
const MIN_DISTANCE_M = 50;

/**
 * Sends this device's position for shares it started. One geolocation watch
 * for all shares; throttled by time and distance. Positions are never queued
 * for later — a location sent late would be misleading.
 */
export function LocationBroadcaster() {
  const { status } = useAuth();
  const shares = useMyShares(status === 'authenticated');
  const ids = useBroadcastingIds();

  // Forget shares that have ended elsewhere (expired, stopped on another device, consent withdrawn).
  useEffect(() => {
    if (!shares.data) return;
    const active = new Set(shares.data.map((s) => s.shareId));
    ids.filter((id) => !active.has(id)).forEach(unmarkBroadcasting);
  }, [shares.data, ids]);

  const targets = (shares.data ?? [])
    .filter((share) => share.status === 'active' && ids.includes(share.shareId))
    .map((share) => share.shareId)
    .sort()
    .join(',');

  useEffect(() => {
    if (!targets || status !== 'authenticated') return;
    const shareIds = targets.split(',');
    let last: { at: number; lat: number; lng: number } | null = null;

    return watchPosition(
      (position) => {
        const now = Date.now();
        const moved = last ? haversineKm(last, position) * 1000 : Number.POSITIVE_INFINITY;
        if (last && now - last.at < MIN_INTERVAL_MS && moved < MIN_DISTANCE_M) return;
        if (!isBrowserOnline()) return;
        last = { at: now, lat: position.lat, lng: position.lng };
        const update = { latitude: position.lat, longitude: position.lng, accuracy: position.accuracy, recordedAt: position.recordedAt, sequence: now };
        for (const shareId of shareIds) {
          api.location
            .postUpdates(shareId, [update])
            .then(() => useBroadcastStatus.getState().sent())
            .catch((error: unknown) => {
              if (isApiError(error) && error.kind === 'conflict' && error.code === 'share_not_active') unmarkBroadcasting(shareId);
              else if (!(isApiError(error) && error.code === 'share_paused')) useBroadcastStatus.getState().fail('Your latest location couldn’t be sent.');
            });
        }
      },
      (error) => useBroadcastStatus.getState().fail(error.message),
    );
  }, [targets, status]);

  return null;
}
