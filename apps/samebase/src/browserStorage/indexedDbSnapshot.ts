export type IndexedDbEntry = {
  databaseName: string;
  objectStoreName: string;
  key: string;
  value: string;
};

export type IndexedDbObjectStoreReference = {
  databaseName: string;
  objectStoreName: string;
};

export type IndexedDbSnapshot =
  | {
      kind: "loading";
    }
  | {
      kind: "available";
      entries: IndexedDbEntry[];
      truncatedStores: IndexedDbObjectStoreReference[];
    }
  | {
      kind: "unavailable";
      errorMessage: string;
    };

const INDEXED_DB_STORE_ENTRY_LIMIT = 50;

function compareIndexedDbNames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function readIndexedDbErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "indexedDB could not be read.";
}

function formatJsonLikeString(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function createIndexedDbJsonReplacer() {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown): unknown => {
    if (typeof value === "bigint") {
      return `${value.toString()}n`;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof ArrayBuffer) {
      return `[ArrayBuffer byteLength=${value.byteLength}]`;
    }

    if (ArrayBuffer.isView(value)) {
      return `[${value.constructor.name} byteLength=${value.byteLength}]`;
    }

    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }

    return value;
  };
}

export function formatIndexedDbStoredValue(value: unknown): string {
  if (typeof value === "string") {
    return formatJsonLikeString(value);
  }

  if (typeof value === "undefined") {
    return "undefined";
  }

  if (typeof value === "symbol") {
    return value.description ? `Symbol(${value.description})` : "Symbol()";
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  try {
    const formatted: unknown = JSON.stringify(value, createIndexedDbJsonReplacer(), 2);
    return typeof formatted === "string" ? formatted : "undefined";
  } catch (error) {
    return readIndexedDbErrorMessage(error);
  }
}

function readDomStringListValues(values: DOMStringList): string[] {
  const result: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values.item(index);
    if (value !== null) {
      result.push(value);
    }
  }

  return result.sort(compareIndexedDbNames);
}

function openExistingIndexedDbDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);

    request.onupgradeneeded = () => {
      const transaction = request.transaction;
      if (!transaction) {
        reject(new Error(`Opening indexedDB database ${databaseName} would create it.`));
        return;
      }

      transaction.abort();
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Could not open indexedDB database ${databaseName}.`));
    };
    request.onblocked = () => {
      reject(new Error(`Opening indexedDB database ${databaseName} was blocked.`));
    };
  });
}

function readIndexedDbObjectStoreEntries(args: {
  databaseName: string;
  db: IDBDatabase;
  objectStoreName: string;
}): Promise<{
  entries: IndexedDbEntry[];
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const transaction = args.db.transaction(args.objectStoreName, "readonly");
    const objectStore = transaction.objectStore(args.objectStoreName);
    const entries: IndexedDbEntry[] = [];
    let truncated = false;

    transaction.oncomplete = () => {
      resolve({ entries, truncated });
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error(`Reading ${args.objectStoreName} was aborted.`));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error(`Could not read ${args.objectStoreName}.`));
    };

    const request = objectStore.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        return;
      }

      if (entries.length >= INDEXED_DB_STORE_ENTRY_LIMIT) {
        truncated = true;
        return;
      }

      const key: IDBValidKey = cursor.key;
      const value: unknown = cursor.value;
      entries.push({
        databaseName: args.databaseName,
        objectStoreName: args.objectStoreName,
        key: formatIndexedDbStoredValue(key),
        value: formatIndexedDbStoredValue(value),
      });
      cursor.continue();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Could not open ${args.objectStoreName} cursor.`));
    };
  });
}

async function readIndexedDbDatabaseSnapshot(databaseName: string): Promise<{
  entries: IndexedDbEntry[];
  truncatedStores: IndexedDbObjectStoreReference[];
}> {
  const db = await openExistingIndexedDbDatabase(databaseName);

  try {
    const entries: IndexedDbEntry[] = [];
    const truncatedStores: IndexedDbObjectStoreReference[] = [];
    const objectStoreNames = readDomStringListValues(db.objectStoreNames);

    for (const objectStoreName of objectStoreNames) {
      const storeSnapshot = await readIndexedDbObjectStoreEntries({
        databaseName,
        db,
        objectStoreName,
      });
      entries.push(...storeSnapshot.entries);
      if (storeSnapshot.truncated) {
        truncatedStores.push({ databaseName, objectStoreName });
      }
    }

    return { entries, truncatedStores };
  } finally {
    db.close();
  }
}

function readIndexedDbDatabaseNames(databases: readonly IDBDatabaseInfo[]): string[] {
  const names: string[] = [];

  for (const database of databases) {
    if (typeof database.name === "string") {
      names.push(database.name);
    }
  }

  return names.sort(compareIndexedDbNames);
}

/**
 * Reads existing IndexedDB databases without falling back to known app DB names:
 * opening a guessed name can create a new database on browsers with IndexedDB.
 */
export async function readBrowserIndexedDbSnapshot(): Promise<IndexedDbSnapshot> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return {
      kind: "unavailable",
      errorMessage: "indexedDB is only available in a browser.",
    };
  }

  if (typeof indexedDB.databases !== "function") {
    return {
      kind: "unavailable",
      errorMessage: "indexedDB database enumeration is unavailable in this browser.",
    };
  }

  try {
    const databaseNames = readIndexedDbDatabaseNames(await indexedDB.databases());
    const entries: IndexedDbEntry[] = [];
    const truncatedStores: IndexedDbObjectStoreReference[] = [];

    for (const databaseName of databaseNames) {
      const databaseSnapshot = await readIndexedDbDatabaseSnapshot(databaseName);
      entries.push(...databaseSnapshot.entries);
      truncatedStores.push(...databaseSnapshot.truncatedStores);
    }

    return { kind: "available", entries, truncatedStores };
  } catch (error) {
    return {
      kind: "unavailable",
      errorMessage: readIndexedDbErrorMessage(error),
    };
  }
}
