const ACCOUNT_DELETION_BROWSER_MARKER_KEY = "samebase:account-deletion";

export type AccountDeletionBrowserMarker = {
  completionCapability: string;
};

const COMPLETION_CAPABILITY_PATTERN = /^[0-9a-f]{64}$/;

export function createAccountDeletionCompletionCapability(): string | null {
  try {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

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
    const completionCapability = Object.getOwnPropertyDescriptor(
      value,
      "completionCapability",
    )?.value;
    if (
      typeof completionCapability !== "string" ||
      !COMPLETION_CAPABILITY_PATTERN.test(completionCapability)
    ) {
      return null;
    }
    return { completionCapability };
  } catch {
    return null;
  }
}

export function writeAccountDeletionBrowserMarker(completionCapability: string): boolean {
  if (!COMPLETION_CAPABILITY_PATTERN.test(completionCapability)) {
    return false;
  }
  try {
    window.localStorage.setItem(
      ACCOUNT_DELETION_BROWSER_MARKER_KEY,
      JSON.stringify({ completionCapability }),
    );
    return true;
  } catch {
    return false;
  }
}
