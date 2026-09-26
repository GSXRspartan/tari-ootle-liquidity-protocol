/**
 * Durable operation history.
 *
 * Uses the protocol-client's `JsonHistoryStore` with a `localStorage`-backed
 * `HistoryIo`. The client owns the record shape and every state transition
 * helper; this module only supplies the bytes.
 *
 * `UNKNOWN` is persisted as-is. A lost submission response is never rewritten to
 * FAILED and never auto-retried — that is the protocol's decision, not the UI's.
 */

import { JsonHistoryStore, type ProtocolHistoryStore, type OperationRecord } from '@tari-ootle/protocol-client';

const STORAGE_KEY = 'ootle.operations.v1';

function storage(): Storage | undefined {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    if (candidate === undefined) return undefined;
    // Probe: Safari private mode throws on setItem.
    const probe = '__ootle_probe__';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return undefined;
  }
}

const memory = new Map<string, string>();

const io = {
  async read(): Promise<string | undefined> {
    const store = storage();
    if (store === undefined) return memory.get(STORAGE_KEY);
    return store.getItem(STORAGE_KEY) ?? undefined;
  },
  async write(text: string): Promise<void> {
    const store = storage();
    if (store === undefined) {
      memory.set(STORAGE_KEY, text);
      return;
    }
    store.setItem(STORAGE_KEY, text);
  },
};

export const historyStore: ProtocolHistoryStore = new JsonHistoryStore(io);

/**
 * `JsonHistoryStore` degrades a corrupt payload to an empty map, which would
 * silently look like "no history yet". This surfaces that possibility so the UI
 * can warn instead of implying a clean slate.
 */
export async function historyIntegrity(): Promise<{ ok: boolean; reason?: string; count: number }> {
  const text = await io.read();
  if (text === undefined || text.trim() === '') return { ok: true, count: 0 };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return { ok: false, reason: 'Persisted history is not a list of operation records.', count: 0 };
    return { ok: true, count: parsed.length };
  } catch {
    return { ok: false, reason: 'Persisted operation history could not be parsed and is being treated as empty. Operations may be missing from this browser.', count: 0 };
  }
}

/** List newest-first, bounded. History is never rendered unbounded. */
export async function listOperations(limit = 100): Promise<OperationRecord[]> {
  const all = await listAllOperations();
  return all.sort((a, b) => b.createdAtUnixMs - a.createdAtUnixMs).slice(0, limit);
}

async function listAllOperations(): Promise<OperationRecord[]> {
  const text = await io.read();
  if (text === undefined || text.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is OperationRecord => typeof entry === 'object' && entry !== null && typeof (entry as OperationRecord).operationId === 'string');
  } catch {
    return [];
  }
}
