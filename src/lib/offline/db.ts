import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { IncidentReportInput, SendMessageInput, SosInput } from '@/types/domain';

/**
 * On-device storage. Holds read-only snapshots for offline viewing, unsent
 * drafts, and an outbox of idempotent actions. Everything here is private to
 * the signed-in traveller and is erased on sign-out.
 */

export interface OutboxPayloads {
  'sos.create': SosInput;
  'chat.send': { conversationId: string; input: SendMessageInput };
  'safety.report': IncidentReportInput;
}

export type OutboxKind = keyof OutboxPayloads;

export type OutboxItem = {
  [K in OutboxKind]: {
    /** The action's idempotency key, so a retry can never duplicate it. */
    id: string;
    kind: K;
    payload: OutboxPayloads[K];
    userId: string;
    createdAt: string;
    attempts: number;
    lastError: string | null;
  };
}[OutboxKind];

export interface SnapshotRecord<T = unknown> {
  key: string;
  data: T;
  savedAt: string;
  userId: string | null;
}

interface TravIndiDb extends DBSchema {
  snapshots: { key: string; value: SnapshotRecord };
  outbox: { key: string; value: OutboxItem; indexes: { byCreated: string } };
  drafts: { key: string; value: { key: string; data: unknown; updatedAt: string } };
}

let connection: Promise<IDBPDatabase<TravIndiDb>> | null = null;

export function getDb(): Promise<IDBPDatabase<TravIndiDb>> | null {
  if (typeof indexedDB === 'undefined') return null;
  connection ??= openDB<TravIndiDb>('travindi', 1, {
    upgrade(db) {
      db.createObjectStore('snapshots', { keyPath: 'key' });
      db.createObjectStore('outbox', { keyPath: 'id' }).createIndex('byCreated', 'createdAt');
      db.createObjectStore('drafts', { keyPath: 'key' });
    },
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

async function withDb<T>(fallback: T, run: (db: IDBPDatabase<TravIndiDb>) => Promise<T>): Promise<T> {
  const pending = getDb();
  if (!pending) return fallback;
  try {
    return await run(await pending);
  } catch {
    // Private browsing or storage pressure: offline features degrade, the app keeps working.
    return fallback;
  }
}

export const saveSnapshot = <T>(key: string, data: T, userId: string | null) =>
  withDb(undefined, async (db) => {
    await db.put('snapshots', { key, data, savedAt: new Date().toISOString(), userId });
  });

export const readSnapshot = <T>(key: string) =>
  withDb<SnapshotRecord<T> | null>(null, async (db) => ((await db.get('snapshots', key)) as SnapshotRecord<T> | undefined) ?? null);

export const saveDraft = (key: string, data: unknown) =>
  withDb(undefined, async (db) => {
    await db.put('drafts', { key, data, updatedAt: new Date().toISOString() });
  });

export const readDraft = <T>(key: string) =>
  withDb<{ data: T; updatedAt: string } | null>(null, async (db) => {
    const record = await db.get('drafts', key);
    return record ? { data: record.data as T, updatedAt: record.updatedAt } : null;
  });

export const deleteDraft = (key: string) =>
  withDb(undefined, async (db) => {
    await db.delete('drafts', key);
  });

export const putOutboxItem = (item: OutboxItem) =>
  withDb(undefined, async (db) => {
    await db.put('outbox', item);
  });

export const listOutboxItems = () => withDb<OutboxItem[]>([], (db) => db.getAllFromIndex('outbox', 'byCreated'));

export const deleteOutboxItem = (id: string) =>
  withDb(undefined, async (db) => {
    await db.delete('outbox', id);
  });

/** Removes every trace of the traveller's data from this device. */
export const clearDeviceData = () =>
  withDb(undefined, async (db) => {
    const tx = db.transaction(['snapshots', 'outbox', 'drafts'], 'readwrite');
    await Promise.all([tx.objectStore('snapshots').clear(), tx.objectStore('outbox').clear(), tx.objectStore('drafts').clear(), tx.done]);
  });
