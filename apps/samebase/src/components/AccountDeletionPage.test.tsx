// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AccountDeletionPage } from "./AccountDeletionPage";

const queryState = vi.hoisted<{
  status: null | {
    currentStep: "revoke_access";
    latestProgressAt: number;
    markerPhase: "deleting";
    requestedAt: number;
    runId: string;
    state: "running" | "needs_attention";
  };
}>(() => ({ status: null }));

vi.mock("convex/react", () => ({
  useQuery: () => queryState.status,
}));

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

async function renderPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(<AccountDeletionPage />);
  });
  return { root, rootElement };
}

describe("AccountDeletionPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    queryState.status = {
      currentStep: "revoke_access",
      latestProgressAt: Date.UTC(2026, 6, 12, 12),
      markerPhase: "deleting",
      requestedAt: Date.UTC(2026, 6, 12, 11),
      runId: "run-1",
      state: "running",
    };
  });

  it("shows every workflow step with completed, current, and upcoming states", async () => {
    const mounted = await renderPage();
    try {
      const steps = mounted.rootElement.querySelectorAll("[data-account-deletion-step]");
      expect(steps).toHaveLength(7);
      expect(
        mounted.rootElement
          .querySelector('[data-account-deletion-step="request_accepted"]')
          ?.getAttribute("data-step-state"),
      ).toBe("completed");
      const current = mounted.rootElement.querySelector(
        '[data-account-deletion-step="revoke_access"]',
      );
      expect(current?.getAttribute("data-step-state")).toBe("current");
      expect(current?.getAttribute("aria-current")).toBe("step");
      expect(current?.querySelector(".animate-spin")).not.toBeNull();
      expect(
        mounted.rootElement
          .querySelector('[data-account-deletion-step="delete_samebase_data"]')
          ?.getAttribute("data-step-state"),
      ).toBe("upcoming");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("replaces the current spinner with attention state when staff must retry", async () => {
    if (queryState.status !== null) {
      queryState.status.state = "needs_attention";
    }
    const mounted = await renderPage();
    try {
      const current = mounted.rootElement.querySelector(
        '[data-account-deletion-step="revoke_access"]',
      );
      expect(mounted.rootElement.textContent).toContain("Account deletion needs attention");
      expect(mounted.rootElement.textContent).toContain(
        "Samebase staff must retry the deletion. Your account remains locked.",
      );
      expect(current?.querySelector(".animate-spin")).toBeNull();
      expect(current?.querySelector(".text-destructive")).not.toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("does not create a browser marker merely by visiting", async () => {
    window.localStorage.clear();
    const mounted = await renderPage();
    try {
      expect(window.localStorage.getItem("samebase:account-deletion")).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });
});
