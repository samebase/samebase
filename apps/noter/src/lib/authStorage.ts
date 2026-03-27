import type { TokenStorage } from "@convex-dev/auth/react";

const inMemoryAuthStorage = new Map<string, string>();
let didWarnAboutStorageFallback = false;
let disabledPersistentAuthStorage: Storage | null = null;

/**
 * Emit a single stable warning when browser auth storage has to degrade to the
 * in-memory fallback for the rest of the page lifetime.
 */
function warnAboutStorageFallback(error: unknown) {
  if (didWarnAboutStorageFallback) {
    return;
  }
  didWarnAboutStorageFallback = true;
  console.warn("authStorage:fallingBackToInMemoryStorage", error);
}

/**
 * Mark one concrete `Storage` object as unreliable after a read/write failure
 * so later reads do not resurrect stale persisted auth state from that same
 * backing store.
 */
function disablePersistentAuthStorage(
  persistentStorage: Storage | null,
  error: unknown,
) {
  if (persistentStorage !== null) {
    disabledPersistentAuthStorage = persistentStorage;
  }
  warnAboutStorageFallback(error);
}

/**
 * Return the current persistent auth storage when it is accessible and still
 * trustworthy, otherwise `null` so callers can fall back to in-memory state.
 */
function readPersistentAuthStorage(): Storage | null {
  try {
    const persistentStorage = window.localStorage;
    if (persistentStorage === disabledPersistentAuthStorage) {
      return null;
    }
    return persistentStorage;
  } catch (error) {
    disablePersistentAuthStorage(null, error);
    return null;
  }
}

/**
 * Convex Auth expects browser storage for verifier and token state. When a
 * privacy-hardened browser denies `localStorage`, keep auth working within the
 * current tab by falling back to in-memory storage instead of throwing.
 */
export const browserAuthStorage = {
  getItem(key: string): string | null {
    const inMemoryValue = inMemoryAuthStorage.get(key);
    const persistentStorage = readPersistentAuthStorage();
    if (persistentStorage === null) {
      return inMemoryValue ?? null;
    }
    if (inMemoryValue !== undefined) {
      return inMemoryValue;
    }

    try {
      return persistentStorage.getItem(key);
    } catch (error) {
      disablePersistentAuthStorage(persistentStorage, error);
    }

    return null;
  },

  setItem(key: string, value: string): void {
    inMemoryAuthStorage.set(key, value);

    const persistentStorage = readPersistentAuthStorage();
    if (persistentStorage === null) {
      return;
    }

    try {
      persistentStorage.setItem(key, value);
    } catch (error) {
      disablePersistentAuthStorage(persistentStorage, error);
    }
  },

  removeItem(key: string): void {
    inMemoryAuthStorage.delete(key);

    const persistentStorage = readPersistentAuthStorage();
    if (persistentStorage === null) {
      return;
    }

    try {
      persistentStorage.removeItem(key);
    } catch (error) {
      disablePersistentAuthStorage(persistentStorage, error);
    }
  },
} satisfies TokenStorage;

/**
 * Read every auth-related entry whose key starts with the provided prefix,
 * preferring in-memory values over persistent ones when both exist.
 */
export function readBrowserAuthStorageEntries(prefix: string) {
  const authEntries: Record<string, string> = {};
  const persistentStorage = readPersistentAuthStorage();

  if (persistentStorage !== null) {
    try {
      for (let index = 0; index < persistentStorage.length; index += 1) {
        const storageKey = persistentStorage.key(index);
        if (storageKey === null || !storageKey.startsWith(prefix)) {
          continue;
        }

        authEntries[storageKey] = persistentStorage.getItem(storageKey) ?? "";
      }
    } catch (error) {
      disablePersistentAuthStorage(persistentStorage, error);
    }
  }

  for (const [storageKey, value] of inMemoryAuthStorage.entries()) {
    if (!storageKey.startsWith(prefix)) {
      continue;
    }

    authEntries[storageKey] = value;
  }

  return authEntries;
}
