import { validateTransaction, type CanonicalTransaction } from "../domain/transaction";

/**
 * Saved trade history, kept only in this browser (IndexedDB). Nothing here is sent
 * to a server. Clearing site data deletes it, so a backup file can be downloaded
 * and restored.
 */
export interface SavedHistory {
  transactions: CanonicalTransaction[];
  updatedAt: string | null;
  lastZerodhaSyncAt: string | null;
  /** Suggestions the owner said "not this" to. */
  dismissed: string[];
  /** Stock symbols looked up by ISIN for stocks saved without one (public instrument list). */
  names: Record<string, string>;
}

export const EMPTY_HISTORY: SavedHistory = { transactions: [], updatedAt: null, lastZerodhaSyncAt: null, dismissed: [], names: {} };

const DB_NAME = "smartfolio";
const DB_VERSION = 1;
const STORE = "history";
const KEY = "main";
const BACKUP_APP = "smartfolio-analyser";
const BACKUP_VERSION = 1;

/** Removes saved entries by ID (used to undo a manual adjustment). */
export function removeTransactions(existing: CanonicalTransaction[], ids: Set<string>): CanonicalTransaction[] {
  return existing.filter((transaction) => !ids.has(transaction.transactionId));
}

/** Adds incoming trades not already saved (same transaction ID). Existing trades win. */
export function mergeTransactions(
  existing: CanonicalTransaction[],
  incoming: CanonicalTransaction[],
): { merged: CanonicalTransaction[]; added: number } {
  const indexById = new Map(existing.map((transaction, index) => [transaction.transactionId, index]));
  const seen = new Set(indexById.keys());
  const merged = [...existing];
  let added = 0;
  for (const transaction of incoming) {
    if (seen.has(transaction.transactionId)) {
      // Keep the saved trade, but learn its symbol if it was saved without one.
      const index = indexById.get(transaction.transactionId);
      if (index !== undefined && !merged[index]!.symbol && transaction.symbol) merged[index] = { ...merged[index]!, symbol: transaction.symbol };
      continue;
    }
    seen.add(transaction.transactionId);
    merged.push(transaction);
    added += 1;
  }
  return { merged, added };
}

export function dateRange(transactions: CanonicalTransaction[]): { from: string; to: string } | null {
  if (transactions.length === 0) return null;
  const days = transactions.map((transaction) => transaction.occurredAt.slice(0, 10)).sort();
  return { from: days[0]!, to: days[days.length - 1]! };
}

export function toBackup(history: SavedHistory, now = new Date()): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      lastZerodhaSyncAt: history.lastZerodhaSyncAt,
      transactions: history.transactions,
    },
    null,
    1,
  );
}

/** Parses a backup file; every trade is re-validated. Returns an error message on failure. */
export function fromBackup(text: string): { transactions: CanonicalTransaction[]; lastZerodhaSyncAt: string | null } | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "This is not a Smartfolio backup file (it is not valid JSON).";
  }
  if (typeof data !== "object" || data === null) return "This is not a Smartfolio backup file.";
  const record = data as Record<string, unknown>;
  if (record.app !== BACKUP_APP || !Array.isArray(record.transactions)) return "This is not a Smartfolio backup file.";
  if (typeof record.version !== "number" || record.version > BACKUP_VERSION) {
    return "This backup was made by a newer version of Smartfolio.";
  }
  const transactions: CanonicalTransaction[] = [];
  let invalid = 0;
  for (const item of record.transactions) {
    const validation = validateTransaction(item);
    if (validation.status === "valid") transactions.push(validation.transaction);
    else invalid += 1;
  }
  if (invalid > 0) return `The backup contains ${invalid} damaged trade${invalid === 1 ? "" : "s"}; nothing was restored.`;
  return {
    transactions,
    lastZerodhaSyncAt: typeof record.lastZerodhaSyncAt === "string" ? record.lastZerodhaSyncAt : null,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot save data (IndexedDB unavailable)."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
  });
}

export async function loadHistory(): Promise<SavedHistory> {
  const db = await openDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!value || typeof value !== "object") return EMPTY_HISTORY;
    const saved = value as Partial<SavedHistory>;
    const transactions = (Array.isArray(saved.transactions) ? saved.transactions : []).flatMap((item) => {
      const validation = validateTransaction(item);
      return validation.status === "valid" ? [validation.transaction] : [];
    });
    return {
      transactions,
      updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : null,
      lastZerodhaSyncAt: typeof saved.lastZerodhaSyncAt === "string" ? saved.lastZerodhaSyncAt : null,
      dismissed: Array.isArray(saved.dismissed) ? saved.dismissed.filter((item): item is string => typeof item === "string") : [],
      names:
        saved.names && typeof saved.names === "object"
          ? Object.fromEntries(Object.entries(saved.names).filter(([, value]) => typeof value === "string")) as Record<string, string>
          : {},
    };
  } finally {
    db.close();
  }
}

export async function saveHistory(history: SavedHistory): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(history, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving was cancelled (storage may be full)."));
    });
  } finally {
    db.close();
  }
}

export async function clearHistory(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
