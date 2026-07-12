const ACCOUNT_DELETION_BROWSER_MARKER_KEY = "samebase:account-deletion";

export type AccountDeletionBrowserMarker = {
  runId: string;
  observedFinalizing: boolean;
};

export function readAccountDeletionBrowserMarker(): AccountDeletionBrowserMarker | null {
  if (typeof window === "undefined") {
    return null;
  }

  let stored: string | null;
  try {
    stored = window.localStorage.getItem(ACCOUNT_DELETION_BROWSER_MARKER_KEY);
  } catch {
    return null;
  }
  if (stored === null) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(stored);
    if (value === null || typeof value !== "object") {
      return null;
    }
    const runId = Object.getOwnPropertyDescriptor(value, "runId")?.value;
    const observedFinalizing = Object.getOwnPropertyDescriptor(value, "observedFinalizing")?.value;
    if (typeof runId !== "string" || typeof observedFinalizing !== "boolean") {
      return null;
    }
    return { runId, observedFinalizing };
  } catch {
    return null;
  }
}

export function writeAccountDeletionBrowserMarker(runId: string): boolean {
  try {
    window.localStorage.setItem(
      ACCOUNT_DELETION_BROWSER_MARKER_KEY,
      JSON.stringify({ runId, observedFinalizing: false }),
    );
    return true;
  } catch {
    return false;
  }
}

export function markAccountDeletionFinalizing(runId: string) {
  const marker = readAccountDeletionBrowserMarker();
  if (marker === null || marker.runId !== runId || marker.observedFinalizing) {
    return;
  }
  try {
    window.localStorage.setItem(
      ACCOUNT_DELETION_BROWSER_MARKER_KEY,
      JSON.stringify({ runId, observedFinalizing: true }),
    );
  } catch {
    // The status page remains authoritative when browser storage is unavailable.
  }
}
