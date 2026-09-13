import { api } from '@/lib/api';
import { ApiError, isApiError } from '@/lib/api/errors';
import { isBrowserOnline, useConnectivity } from './connectivity';
import { deleteOutboxItem, listOutboxItems, type OutboxItem, type OutboxKind, type OutboxPayloads, putOutboxItem } from './db';

/**
 * Actions that must survive a lost connection. Each is idempotent on the
 * server (its id is the idempotency key), so sending twice is harmless.
 * The UI says "Saved on this device · waiting for connection" — never "sent".
 */

const senders: { [K in OutboxKind]: (payload: OutboxPayloads[K]) => Promise<unknown> } = {
  'sos.create': (payload) => api.sos.create(payload),
  'chat.send': (payload) => api.chat.send(payload.conversationId, payload.input),
  'safety.report': (payload) => api.safety.reportIncident(payload),
};

/** SOS is always attempted first. */
const PRIORITY: Record<OutboxKind, number> = { 'sos.create': 0, 'safety.report': 1, 'chat.send': 2 };

export type OutboxResult =
  | { status: 'sent'; item: OutboxItem; response: unknown }
  | { status: 'rejected'; item: OutboxItem; error: ApiError };

const resultListeners = new Set<(result: OutboxResult) => void>();

export function onOutboxResult(listener: (result: OutboxResult) => void) {
  resultListeners.add(listener);
  return () => {
    resultListeners.delete(listener);
  };
}

async function refreshPendingCount() {
  useConnectivity.getState().setPending((await listOutboxItems()).length);
}

export async function enqueue<K extends OutboxKind>(kind: K, id: string, payload: OutboxPayloads[K], userId: string) {
  await putOutboxItem({ id, kind, payload, userId, createdAt: new Date().toISOString(), attempts: 0, lastError: null } as OutboxItem);
  await refreshPendingCount();
}

/** Removes an item once it has been confirmed by another path (e.g. a direct send). */
export async function removeFromOutbox(id: string) {
  await deleteOutboxItem(id);
  await refreshPendingCount();
}

export async function pendingItems(kind?: OutboxKind) {
  const items = await listOutboxItems();
  return kind ? items.filter((item) => item.kind === kind) : items;
}

let flushing: Promise<{ sent: number; rejected: number; remaining: number }> | null = null;

/** Sends queued actions in priority order. Stops at the first network failure. */
export function flushOutbox() {
  flushing ??= (async () => {
    let sent = 0;
    let rejected = 0;
    try {
      const items = (await listOutboxItems()).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.createdAt.localeCompare(b.createdAt));
      for (const item of items) {
        if (!isBrowserOnline()) break;
        try {
          const response = await (senders[item.kind] as (payload: unknown) => Promise<unknown>)(item.payload);
          await deleteOutboxItem(item.id);
          sent += 1;
          resultListeners.forEach((listener) => listener({ status: 'sent', item, response }));
        } catch (error) {
          const apiError = isApiError(error) ? error : new ApiError({ kind: 'unknown', message: 'Could not send.', cause: error });
          if (apiError.retryable || apiError.kind === 'unknown') {
            await putOutboxItem({ ...item, attempts: item.attempts + 1, lastError: apiError.message });
            if (apiError.kind === 'network' || apiError.kind === 'timeout') break;
          } else {
            // The server refused it (e.g. validation or permission): retrying cannot help.
            await deleteOutboxItem(item.id);
            rejected += 1;
            resultListeners.forEach((listener) => listener({ status: 'rejected', item, error: apiError }));
          }
        }
      }
    } finally {
      await refreshPendingCount();
      flushing = null;
    }
    return { sent, rejected, remaining: useConnectivity.getState().pendingCount };
  })();
  return flushing;
}
