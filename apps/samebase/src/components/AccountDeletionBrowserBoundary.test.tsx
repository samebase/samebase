// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AccountDeletionBrowserBoundary } from "./AccountDeletionBrowserBoundary";
import { writeAccountDeletionBrowserMarker } from "@/lib/accountDeletionBrowserState";

const completionCapability = "a".repeat(64);

const authState = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
const locationState = vi.hoisted(() => ({ pathname: "/" }));
const queryState = vi.hoisted<{
  completion: null | { completedAt: number; state: "succeeded" };
  status: null | {
    completionCapability: string;
    currentStep: "delete_identity";
    latestProgressAt: number;
    markerPhase: "deleting" | "finalizing";
    requestedAt: number;
    runId: string;
    state: "needs_attention" | "running";
  };
  viewer: undefined | { role: "role_deleting" | "role_member" | "role_pending_access" };
}>(() => ({ completion: null, status: null, viewer: undefined }));
const routerState = vi.hoisted(() => ({ navigate: vi.fn() }));
const cleanupState = vi.hoisted(() => ({ resetLocalAppData: vi.fn() }));
const posthogState = vi.hoisted(() => ({ reset: vi.fn() }));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: ({ select }: { select: (location: { pathname: string }) => string }) =>
      select(locationState),
    useRouter: () => routerState,
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  return {
    ...actual,
    useConvexAuth: () => authState,
    useQuery: (reference: Parameters<typeof getFunctionName>[0], args: object | "skip") => {
      if (args === "skip") {
        return undefined;
      }
      const functionName = getFunctionName(reference);
      if (functionName === "users:currentViewerAccess") {
        return queryState.viewer;
      }
      if (functionName === "accountDeletion/index:completion") {
        return queryState.completion;
      }
      return queryState.status;
    },
  };
});

vi.mock("@/lib/appBootRecovery", () => ({
  resetLocalAppData: cleanupState.resetLocalAppData,
}));

vi.mock("@/lib/posthogClient", () => ({
  resetSamebasePostHogClient: posthogState.reset,
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

async function renderBoundary() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <AccountDeletionBrowserBoundary>
        <div data-testid="children">Normal route</div>
      </AccountDeletionBrowserBoundary>,
    );
  });
  return { root, rootElement };
}

describe("AccountDeletionBrowserBoundary", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    authState.isAuthenticated = true;
    authState.isLoading = false;
    locationState.pathname = "/";
    queryState.completion = null;
    queryState.status = null;
    queryState.viewer = undefined;
    routerState.navigate.mockReset();
    routerState.navigate.mockResolvedValue(undefined);
    cleanupState.resetLocalAppData.mockReset();
    cleanupState.resetLocalAppData.mockResolvedValue(undefined);
    posthogState.reset.mockReset();
    posthogState.reset.mockResolvedValue(undefined);
  });

  it("suppresses normal routes until authenticated access resolves", async () => {
    const mounted = await renderBoundary();
    try {
      expect(mounted.rootElement.textContent).toBe("");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("redirects a deleting user from public routes and suppresses their content", async () => {
    queryState.viewer = { role: "role_deleting" };
    const mounted = await renderBoundary();
    try {
      expect(mounted.rootElement.textContent).toBe("");
      expect(routerState.navigate).toHaveBeenCalledWith({
        href: "/account-deletion",
        replace: true,
      });
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("reconstructs a missing marker and follows the authenticated run", async () => {
    queryState.viewer = { role: "role_deleting" };
    queryState.status = {
      completionCapability,
      currentStep: "delete_identity",
      latestProgressAt: 2,
      markerPhase: "finalizing",
      requestedAt: 1,
      runId: "run-1",
      state: "running",
    };
    locationState.pathname = "/account-deletion";
    const mounted = await renderBoundary();
    try {
      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability });
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("keeps the authoritative run in memory when browser storage rejects the marker", async () => {
    const blockedStorage = createTestStorage();
    blockedStorage.setItem = () => {
      throw new Error("blocked");
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage,
    });
    queryState.viewer = { role: "role_deleting" };
    queryState.status = {
      completionCapability,
      currentStep: "delete_identity",
      latestProgressAt: 2,
      markerPhase: "finalizing",
      requestedAt: 1,
      runId: "run-1",
      state: "running",
    };
    locationState.pathname = "/account-deletion";
    const mounted = await renderBoundary();
    try {
      authState.isAuthenticated = false;
      queryState.viewer = undefined;
      queryState.completion = { completedAt: 3, state: "succeeded" };
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Signed out</div>
          </AccountDeletionBrowserBoundary>,
        );
        await Promise.resolve();
      });
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("does not claim terminal success from auth loss after finalization", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    const mounted = await renderBoundary();
    try {
      authState.isAuthenticated = false;
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Signed out</div>
          </AccountDeletionBrowserBoundary>,
        );
      });
      authState.isAuthenticated = true;
      queryState.viewer = { role: "role_deleting" };
      queryState.status = {
        completionCapability,
        currentStep: "delete_identity",
        latestProgressAt: 2,
        markerPhase: "finalizing",
        requestedAt: 1,
        runId: "run-1",
        state: "running",
      };
      locationState.pathname = "/account-deletion";
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Deletion route</div>
          </AccountDeletionBrowserBoundary>,
        );
      });
      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability });

      authState.isAuthenticated = false;
      queryState.viewer = undefined;
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Signed out</div>
          </AccountDeletionBrowserBoundary>,
        );
      });
      expect(mounted.rootElement.textContent).toContain("Checking account deletion");
      const signIn = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Sign in to view status",
      );
      await act(async () => signIn?.click());
      expect(mounted.rootElement.textContent).toContain("Signed out");
      expect(window.localStorage.getItem("samebase:account-deletion")).not.toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("corrects a stale marker when the run needs attention", async () => {
    writeAccountDeletionBrowserMarker("b".repeat(64));
    queryState.viewer = { role: "role_deleting" };
    queryState.status = {
      completionCapability,
      currentStep: "delete_identity",
      latestProgressAt: 2,
      markerPhase: "finalizing",
      requestedAt: 1,
      runId: "run-1",
      state: "needs_attention",
    };
    locationState.pathname = "/account-deletion";
    const mounted = await renderBoundary();
    try {
      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability });
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("clears browser data and shows completion only after the receipt succeeds", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    authState.isAuthenticated = false;
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(posthogState.reset).toHaveBeenCalledTimes(1);
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
      expect(mounted.rootElement.textContent).not.toContain("Normal route");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("shows completion while the deleted session still appears authenticated", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    queryState.viewer = { role: "role_pending_access" };
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
      expect(mounted.rootElement.textContent).not.toContain("Normal route");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("does not claim completion when browser cleanup fails", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    authState.isAuthenticated = false;
    queryState.completion = { completedAt: 3, state: "succeeded" };
    cleanupState.resetLocalAppData.mockRejectedValue(new Error("blocked"));

    const mounted = await renderBoundary();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(mounted.rootElement.textContent).toContain("Finishing account deletion");
      expect(mounted.rootElement.textContent).toContain("Close other Samebase tabs");
      expect(mounted.rootElement.textContent).not.toContain("Account deleted");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });
});
