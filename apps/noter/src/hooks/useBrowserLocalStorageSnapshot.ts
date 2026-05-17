import { useSyncExternalStore } from "react";
import {
  readBrowserLocalStorageSnapshot,
  subscribeBrowserLocalStorageSnapshot,
  type LocalStorageSnapshot,
} from "#src/lib/localStorageSnapshot.ts";

const serverSnapshot = {
  kind: "unavailable",
  errorMessage: "localStorage is only available in a browser.",
} satisfies LocalStorageSnapshot;

let cachedSnapshotKey = "";
let cachedSnapshot: LocalStorageSnapshot | null = null;

function serializeSnapshot(snapshot: LocalStorageSnapshot): string {
  return JSON.stringify(snapshot);
}

function readCachedBrowserLocalStorageSnapshot(): LocalStorageSnapshot {
  const snapshot = readBrowserLocalStorageSnapshot();
  const snapshotKey = serializeSnapshot(snapshot);
  if (cachedSnapshot !== null && cachedSnapshotKey === snapshotKey) {
    return cachedSnapshot;
  }

  cachedSnapshot = snapshot;
  cachedSnapshotKey = snapshotKey;
  return snapshot;
}

/**
 * Treat localStorage like a React external store for the diagnostic route:
 * native storage events cover other tabs, while app-owned writes emit a local
 * event for the current tab after the browser write succeeds.
 */
export function useBrowserLocalStorageSnapshot(): LocalStorageSnapshot {
  return useSyncExternalStore(
    subscribeBrowserLocalStorageSnapshot,
    readCachedBrowserLocalStorageSnapshot,
    () => serverSnapshot,
  );
}
