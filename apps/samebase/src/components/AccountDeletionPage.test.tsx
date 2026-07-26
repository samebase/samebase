// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { FunctionReturnType } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AccountDeletionPage } from "./AccountDeletionPage";

type AccountDeletionStatus = Pick<
  Exclude<FunctionReturnType<typeof api.accountDeletion.index.status>, null>,
  "currentStep" | "dataDeletion" | "latestProgressAt" | "state"
>;

const queryState = vi.hoisted<{
  status: null | AccountDeletionStatus;
}>(() => ({ status: null }));

const dataDeletionInProgress = {
  vaultsAndStagedChanges: {
    state: "in_progress",
    startedAt: Date.UTC(2026, 6, 12, 12, 1),
    updatedAt: Date.UTC(2026, 6, 12, 12, 2),
    deletedVaultCount: 1,
    currentVaultPhase: "staged_changes",
  },
  preferences: { state: "not_started" },
  appAccessAndTokens: { state: "not_started" },
  accessRequestsAndHistory: { state: "not_started" },
} as const satisfies Exclude<AccountDeletionStatus["dataDeletion"], { state: string }>;

const dataDeletionCompleted = {
  vaultsAndStagedChanges: {
    state: "completed",
    startedAt: Date.UTC(2026, 6, 12, 12, 1),
    completedAt: Date.UTC(2026, 6, 12, 12, 3),
    deletedVaultCount: 2,
    currentVaultPhase: null,
  },
  preferences: {
    state: "completed",
    startedAt: Date.UTC(2026, 6, 12, 12, 3),
    completedAt: Date.UTC(2026, 6, 12, 12, 5),
  },
  appAccessAndTokens: {
    state: "completed",
    startedAt: Date.UTC(2026, 6, 12, 12, 5),
    completedAt: Date.UTC(2026, 6, 12, 12, 6),
  },
  accessRequestsAndHistory: {
    state: "completed",
    startedAt: Date.UTC(2026, 6, 12, 12, 6),
    completedAt: Date.UTC(2026, 6, 12, 12, 7),
  },
} as const satisfies Exclude<AccountDeletionStatus["dataDeletion"], { state: string }>;

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
      dataDeletion: { state: "legacy_unavailable" },
      latestProgressAt: Date.UTC(2026, 6, 12, 12),
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
      expect(current?.textContent).toContain("in progress");
      expect(current?.querySelector(".animate-spin")).not.toBeNull();
      expect(
        mounted.rootElement
          .querySelector('[data-account-deletion-step="delete_samebase_data"]')
          ?.getAttribute("data-step-state"),
      ).toBe("upcoming");
      expect(mounted.rootElement.querySelector("[data-account-deletion-data-group]")).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("shows durable data progress with real vault count and current phase", async () => {
    queryState.status = {
      currentStep: "delete_samebase_data",
      dataDeletion: dataDeletionInProgress,
      latestProgressAt: Date.UTC(2026, 6, 12, 12, 2),
      state: "running",
    };
    const mounted = await renderPage();
    try {
      const groups = mounted.rootElement.querySelectorAll("[data-account-deletion-data-group]");
      expect(groups).toHaveLength(4);
      const vaults = mounted.rootElement.querySelector(
        '[data-account-deletion-data-group="vaultsAndStagedChanges"]',
      );
      expect(vaults?.getAttribute("data-group-state")).toBe("current");
      expect(vaults?.getAttribute("aria-current")).toBe("step");
      expect(vaults?.textContent).toContain("1 vault deleted");
      expect(vaults?.textContent).toContain("Deleting staged changes");
      expect(vaults?.querySelector(".animate-spin")).not.toBeNull();
      expect(
        mounted.rootElement
          .querySelector('[data-account-deletion-data-group="preferences"]')
          ?.getAttribute("data-group-state"),
      ).toBe("upcoming");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("keeps completed data details visible during later workflow steps", async () => {
    queryState.status = {
      currentStep: "send_completion_email",
      dataDeletion: dataDeletionCompleted,
      latestProgressAt: Date.UTC(2026, 6, 12, 12, 8),
      state: "running",
    };
    const mounted = await renderPage();
    try {
      const groups = mounted.rootElement.querySelectorAll("[data-account-deletion-data-group]");
      expect(groups).toHaveLength(4);
      const vaults = mounted.rootElement.querySelector(
        '[data-account-deletion-data-group="vaultsAndStagedChanges"]',
      );
      expect(vaults?.getAttribute("data-group-state")).toBe("completed");
      expect(vaults?.textContent).toContain("2 vaults deleted");
      expect(vaults?.textContent).not.toContain("Deleting");
      expect(
        mounted.rootElement
          .querySelector('[data-account-deletion-data-group="accessRequestsAndHistory"]')
          ?.getAttribute("data-group-state"),
      ).toBe("completed");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("shows attention on the exact active data group without claiming deletion continues", async () => {
    queryState.status = {
      currentStep: "delete_samebase_data",
      dataDeletion: dataDeletionInProgress,
      latestProgressAt: Date.UTC(2026, 6, 12, 12, 2),
      state: "needs_attention",
    };
    const mounted = await renderPage();
    try {
      const vaults = mounted.rootElement.querySelector(
        '[data-account-deletion-data-group="vaultsAndStagedChanges"]',
      );
      expect(vaults?.textContent).toContain("needs attention");
      expect(vaults?.textContent).toContain("Stopped while deleting staged changes");
      expect(vaults?.querySelector(".animate-spin")).toBeNull();
      expect(vaults?.querySelector(".text-destructive")).not.toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("keeps legacy data deletion on the coarse workflow step", async () => {
    queryState.status = {
      currentStep: "delete_samebase_data",
      dataDeletion: { state: "legacy_unavailable" },
      latestProgressAt: Date.UTC(2026, 6, 12, 12, 2),
      state: "running",
    };
    const mounted = await renderPage();
    try {
      expect(mounted.rootElement.querySelector("[data-account-deletion-data-group]")).toBeNull();
      expect(
        mounted.rootElement
          .querySelector('[data-account-deletion-step="delete_samebase_data"]')
          ?.getAttribute("data-step-state"),
      ).toBe("current");
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
      expect(current?.textContent).toContain("needs attention");
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
