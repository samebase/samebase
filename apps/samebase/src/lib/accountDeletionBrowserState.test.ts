// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  markAccountDeletionFinalizing,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "./accountDeletionBrowserState";

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

    writeAccountDeletionBrowserMarker("run-1");

    expect(readAccountDeletionBrowserMarker()).toEqual({
      runId: "run-1",
      observedFinalizing: false,
    });
  });

  it("records finalization only for the accepted run", () => {
    writeAccountDeletionBrowserMarker("run-1");

    markAccountDeletionFinalizing("run-2");
    expect(readAccountDeletionBrowserMarker()?.observedFinalizing).toBe(false);

    markAccountDeletionFinalizing("run-1");
    expect(readAccountDeletionBrowserMarker()).toEqual({
      runId: "run-1",
      observedFinalizing: true,
    });
  });

  it("fails closed for malformed browser state", () => {
    window.localStorage.setItem("samebase:account-deletion", '{"runId":4}');

    expect(readAccountDeletionBrowserMarker()).toBeNull();
  });
});
