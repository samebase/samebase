import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "@/appShell/appWorkspaceSidebarPreferences";
import { PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY } from "@/auth/authStorageKeys";

export type LocalStorageEntry = {
  key: string;
  value: string;
};

export type LocalStorageSnapshot =
  | {
      kind: "available";
      entries: LocalStorageEntry[];
    }
  | {
      kind: "unavailable";
      errorMessage: string;
    };

type ReadableLocalStorage = Pick<Storage, "getItem" | "key" | "length">;

const BROWSER_LOCAL_STORAGE_CHANGE_EVENT = "samebase:local-storage-change";
const CONVEX_AUTH_STORAGE_KEY_PREFIX = "__convexAuth";
const INTERNAL_LOCAL_STORAGE_KEYS = new Set([
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY,
]);

function compareStorageKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function readStorageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "localStorage could not be read.";
}

function isVisibleLocalStorageKey(key: string): boolean {
  return !key.startsWith(CONVEX_AUTH_STORAGE_KEY_PREFIX) && !INTERNAL_LOCAL_STORAGE_KEYS.has(key);
}

/**
 * Captures user-authored localStorage strings in a stable order without
 * parsing, truncating, or normalizing the stored values.
 */
export function readLocalStorageSnapshot(storage: ReadableLocalStorage): LocalStorageSnapshot {
  try {
    const keys: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && isVisibleLocalStorageKey(key)) {
        keys.push(key);
      }
    }

    keys.sort(compareStorageKeys);

    const entries: LocalStorageEntry[] = [];
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value !== null) {
        entries.push({ key, value });
      }
    }

    return { kind: "available", entries };
  } catch (error) {
    return {
      kind: "unavailable",
      errorMessage: readStorageErrorMessage(error),
    };
  }
}

export function readBrowserLocalStorageSnapshot(): LocalStorageSnapshot {
  if (typeof window === "undefined") {
    return {
      kind: "unavailable",
      errorMessage: "localStorage is only available in a browser.",
    };
  }

  try {
    return readLocalStorageSnapshot(window.localStorage);
  } catch (error) {
    return {
      kind: "unavailable",
      errorMessage: readStorageErrorMessage(error),
    };
  }
}

export function notifyBrowserLocalStorageChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(BROWSER_LOCAL_STORAGE_CHANGE_EVENT));
}

export function subscribeBrowserLocalStorageSnapshot(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(BROWSER_LOCAL_STORAGE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(BROWSER_LOCAL_STORAGE_CHANGE_EVENT, onStoreChange);
  };
}
