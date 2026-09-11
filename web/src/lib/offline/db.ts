/**
 * IndexedDB storage for the offline-first upgrade — a durable mutation
 * queue (`mutation_queue`) plus opportunistic read caches for the trip/
 * itinerary pages a user has actually viewed (`cached_trips`/
 * `cached_itineraries`), never a speculative bulk "download everything"
 * pack. Wrapped in try/catch throughout: IndexedDB can throw in private
 * browsing or be entirely blocked, and the app must keep working (just
 * without offline support) rather than crash.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { SyncEntityType } from "@/lib/api";

const DB_NAME = "travindi-offline";
const DB_VERSION = 1;

export type MutationStatus = "LOCAL" | "SYNCING" | "SERVER_CONFIRMED" | "FAILED" | "REJECTED" | "CONFLICT";

export interface QueuedMutation {
  operation_id: string;
  entity_type: SyncEntityType;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
  client_timestamp: string;
  status: MutationStatus;
  error_code?: string;
  current_state?: Record<string, unknown> | null;
  created_at: string;
}

export interface CachedEntry<T> {
  key: string;
  data: T;
  cached_at: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("mutation_queue")) {
          db.createObjectStore("mutation_queue", { keyPath: "operation_id" });
        }
        if (!db.objectStoreNames.contains("cached_trips")) {
          db.createObjectStore("cached_trips", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("cached_itineraries")) {
          db.createObjectStore("cached_itineraries", { keyPath: "key" });
        }
      },
    }).catch(() => null as unknown as IDBPDatabase);
  }
  return dbPromise;
}

export async function addQueuedMutation(mutation: QueuedMutation): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put("mutation_queue", mutation);
  } catch {
    // IndexedDB unavailable — the mutation is lost, same as it would be
    // without this feature at all. Never block the UI on this.
  }
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db.getAll("mutation_queue");
  } catch {
    return [];
  }
}

export async function updateQueuedMutation(operationId: string, patch: Partial<QueuedMutation>): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const existing = await db.get("mutation_queue", operationId);
    if (!existing) return;
    await db.put("mutation_queue", { ...existing, ...patch });
  } catch {
    // best-effort
  }
}

export async function removeQueuedMutation(operationId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete("mutation_queue", operationId);
  } catch {
    // best-effort
  }
}

async function putCache(store: "cached_trips" | "cached_itineraries", key: string, data: unknown): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put(store, { key, data, cached_at: new Date().toISOString() });
  } catch {
    // best-effort
  }
}

async function getCache<T>(store: "cached_trips" | "cached_itineraries", key: string): Promise<CachedEntry<T> | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;
    return await db.get(store, key);
  } catch {
    return undefined;
  }
}

export const cacheTrip = (tripId: string, data: unknown) => putCache("cached_trips", tripId, data);
export const getCachedTrip = <T>(tripId: string) => getCache<T>("cached_trips", tripId);
export const cacheItinerary = (tripId: string, data: unknown) => putCache("cached_itineraries", tripId, data);
export const getCachedItinerary = <T>(tripId: string) => getCache<T>("cached_itineraries", tripId);

export async function clearAllOfflineData(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.clear("mutation_queue");
    await db.clear("cached_trips");
    await db.clear("cached_itineraries");
  } catch {
    // best-effort
  }
}
