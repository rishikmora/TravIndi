'use client';

import { useState } from 'react';
import { RefreshIcon, WifiOffIcon } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth/provider';
import { useConnectivity } from '@/lib/offline/connectivity';
import { flushOutbox } from '@/lib/offline/outbox';
import { useRealtimeClient, useRealtimeState } from '@/lib/realtime/provider';
import { cn } from '@/utils/cn';

type BannerTone = 'offline' | 'progress' | 'ok' | 'error';

/**
 * Connection and sync status: OFFLINE · RECONNECTING · SYNCING · SYNCED · SYNC ERROR.
 * Also reports when live updates have stopped, so stale data is never shown as live.
 */
export function ConnectivityBanner() {
  const { state, pendingCount, lastError } = useConnectivity();
  const realtimeState = useRealtimeState();
  const realtime = useRealtimeClient();
  const { status } = useAuth();
  const [retrying, setRetrying] = useState(false);

  let tone: BannerTone | null = null;
  let label = '';
  let detail = '';
  let action: { label: string; run: () => void } | null = null;

  const pending = pendingCount > 0 ? `${pendingCount} saved action${pendingCount === 1 ? '' : 's'} waiting to send.` : '';

  if (state === 'offline') {
    tone = 'offline';
    label = 'You’re offline';
    detail = ['Showing what’s saved on this device.', pending].filter(Boolean).join(' ');
  } else if (state === 'reconnecting') {
    tone = 'progress';
    label = 'Reconnecting…';
  } else if (state === 'syncing') {
    tone = 'progress';
    label = 'Syncing…';
    detail = pending;
  } else if (state === 'synced') {
    tone = 'ok';
    label = 'Back online';
    detail = 'Everything is up to date.';
  } else if (state === 'sync_error') {
    tone = 'error';
    label = 'Some changes haven’t synced';
    detail = lastError ?? pending;
    action = {
      label: 'Retry',
      run: () => {
        setRetrying(true);
        void flushOutbox().finally(() => setRetrying(false));
      },
    };
  } else if (status === 'authenticated' && realtimeState === 'failed') {
    tone = 'error';
    label = 'Live updates paused';
    detail = 'Messages, locations and trip changes may be delayed.';
    action = realtime ? { label: 'Reconnect', run: () => realtime.retryNow() } : null;
  }

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(var(--nav-height)+0.5rem)] z-40 flex justify-center px-3">
      {tone && (
        <div
          className={cn(
            'theme-app-dark pointer-events-auto flex max-w-xl items-center gap-3 rounded-full py-2 pl-3.5 pr-2 text-[0.875rem] shadow-[0_16px_40px_-18px_rgb(0_0_0/0.6)]',
            tone === 'error' && 'ring-1 ring-[var(--tone-danger-fg)]',
          )}
        >
          {tone === 'offline' && <WifiOffIcon size={18} className="shrink-0 text-[var(--tone-warning-fg)]" />}
          {tone === 'progress' && <RefreshIcon size={18} className="shrink-0 animate-spin text-[var(--tone-info-fg)]" />}
          {tone === 'ok' && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--tone-success-fg)]" />}
          {tone === 'error' && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--tone-danger-fg)]" />}
          <p className="min-w-0">
            <span className="font-semibold">{label}</span>
            {detail && <span className="text-[var(--text-muted)]"> {detail}</span>}
          </p>
          {action && (
            <button
              type="button"
              onClick={action.run}
              disabled={retrying}
              className="tap-target shrink-0 rounded-full px-3 font-semibold text-[var(--accent)] hover:bg-[var(--tone-neutral-bg)] disabled:opacity-60"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
