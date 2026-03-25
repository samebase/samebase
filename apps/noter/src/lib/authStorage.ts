import type { TokenStorage } from "@convex-dev/auth/react";

const inMemoryAuthStorage = new Map<string, string>();
let didWarnAboutStorageFallback = false;

function warnAboutStorageFallback(error: unknown) {
  if (didWarnAboutStorageFallback) {
    return;
  }
  didWarnAboutStorageFallback = true;
  console.warn("authStorage:fallingBackToInMemoryStorage", error);
}

function readPersistentAuthStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch (error) {
    warnAboutStorageFallback(error);
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
    const persistentStorage = readPersistentAuthStorage();
    if (persistentStorage !== null) {
      try {
        return persistentStorage.getItem(key);
      } catch (error) {
        warnAboutStorageFallback(error);
      }
    }

    return inMemoryAuthStorage.get(key) ?? null;
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
      warnAboutStorageFallback(error);
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
      warnAboutStorageFallback(error);
    }
  },
} satisfies TokenStorage;
