// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  clearAccountDeletionBrowserMarker,
  createAccountDeletionCompletionCapability,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "./accountDeletionBrowserState";

const completionCapability = "a".repeat(64);

function createTestStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    get length() {
      return entries.size;
    },
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  };
}

describe("account deletion browser state", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
  });

  it("creates a marker only when deletion acceptance writes one", () => {
    expect(readAccountDeletionBrowserMarker()).toBeNull();

    writeAccountDeletionBrowserMarker(completionCapability);

    expect(readAccountDeletionBrowserMarker()).toEqual({
      completionCapability,
    });
  });

  it("fails closed for malformed browser state", () => {
    window.localStorage.setItem("samebase:account-deletion", '{"completionCapability":"short"}');

    expect(readAccountDeletionBrowserMarker()).toBeNull();
  });

  it("clears only the matching completion capability", () => {
    writeAccountDeletionBrowserMarker(completionCapability);

    clearAccountDeletionBrowserMarker("b".repeat(64));
    expect(readAccountDeletionBrowserMarker()).toEqual({ completionCapability });

    clearAccountDeletionBrowserMarker(completionCapability);
    expect(readAccountDeletionBrowserMarker()).toBeNull();
  });

  it("creates a random 256-bit completion capability", () => {
    const capability = createAccountDeletionCompletionCapability();

    expect(capability).toMatch(/^[0-9a-f]{64}$/);
    expect(capability).not.toBe(createAccountDeletionCompletionCapability());
  });
});
