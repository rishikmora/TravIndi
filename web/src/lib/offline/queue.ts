/**
 * The offline mutation queue's enqueue/flush logic — the one real generic
 * pipeline shared by offline SOS, offline incident reports, and offline
 * itinerary-item edits (the three entity types `POST /api/v1/sync`
 * supports). See `db.ts` for storage and `app/api/v1/sync.py`'s module
 * docstring for the backend side.
 *
 * Critical correctness rule: `operation_id` is generated exactly once, at
 * the moment a mutation is queued, and reused verbatim on every retry —
 * `api.ts`'s own `idempotencyKey()` helper (used by the *online* create
 * calls) generates a fresh UUID per call and must never be reused here,
 * or a retry would defeat the server's dedup ledger entirely.
 */

import { api, NetworkError, type SyncEntityType, type SyncOperationIn } from "@/lib/api";
import { addQueuedMutation, listQueuedMutations, updateQueuedMutation, type QueuedMutation } from "./db";

const DEVICE_ID_KEY = "travindi.device_id";
const CHANNEL_NAME = "travindi-sync";

function getDeviceId(): string {
  if (typeof window === "undefined") return "unknown-device";
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

function notifyOtherTabs(): void {
  try {
    const channel = getChannel();
    channel?.postMessage({ type: "queue-changed" });
    channel?.close();
  } catch {
    // best-effort
  }
}

export function subscribeToQueueChanges(callback: () => void): () => void {
  const channel = getChannel();
  if (!channel) return () => {};
  const handler = () => callback();
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}

async function enqueue(
  entityType: SyncEntityType,
  operation: "CREATE" | "UPDATE",
  payload: Record<string, unknown>
): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    operation_id: crypto.randomUUID(),
    entity_type: entityType,
    operation,
    payload,
    client_timestamp: new Date().toISOString(),
    status: "LOCAL",
    created_at: new Date().toISOString(),
  };
  await addQueuedMutation(mutation);
  return mutation;
}

export const enqueueSosCreate = (payload: Record<string, unknown>) => enqueue("sos", "CREATE", payload);
export const enqueueIncidentCreate = (payload: Record<string, unknown>) => enqueue("incident", "CREATE", payload);
export const enqueueItineraryItemUpdate = (payload: Record<string, unknown>) =>
  enqueue("itinerary_item", "UPDATE", payload);

let flushing = false;

/**
 * Sends every `LOCAL`/`SYNCING` mutation in one batch and applies the
 * server's real per-operation outcome back onto each row — never marks
 * anything `SERVER_CONFIRMED` except in direct response to
 * `acknowledged_operation_ids` (no mock success). Rows already `SYNCING`
 * are resent too, not just `LOCAL` ones: a tab that closed mid-flight must
 * not orphan them, and the server's ledger makes a resend safe either way.
 * A `NetworkError` (still offline) leaves everything queued for the next
 * attempt; any other failure propagates.
 */
export async function flushQueue(token: string): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const all = await listQueuedMutations();
    const pending = all.filter((m) => m.status === "LOCAL" || m.status === "SYNCING");
    if (pending.length === 0) return;

    for (const m of pending) {
      await updateQueuedMutation(m.operation_id, { status: "SYNCING" });
    }

    const operations: SyncOperationIn[] = pending.map((m) => ({
      operation_id: m.operation_id,
      entity_type: m.entity_type,
      operation: m.operation,
      client_timestamp: m.client_timestamp,
      payload: m.payload,
    }));

    let ack;
    try {
      ack = await api.sync({ device_id: getDeviceId(), operations }, token);
    } catch (err) {
      if (err instanceof NetworkError) return; // still offline — retry on the next flush
      throw err;
    }

    for (const operationId of ack.acknowledged_operation_ids) {
      await updateQueuedMutation(operationId, { status: "SERVER_CONFIRMED" });
    }
    for (const conflict of ack.conflicted) {
      await updateQueuedMutation(conflict.operation_id, {
        status: "CONFLICT",
        error_code: conflict.error_code,
        current_state: conflict.current_state,
      });
    }
    for (const rejection of ack.rejected) {
      await updateQueuedMutation(rejection.operation_id, { status: "REJECTED", error_code: rejection.error_code });
    }
    for (const operationId of ack.skipped_operation_ids) {
      await updateQueuedMutation(operationId, { status: "REJECTED", error_code: "UNSUPPORTED_OPERATION" });
    }
    notifyOtherTabs();
  } finally {
    flushing = false;
  }
}
