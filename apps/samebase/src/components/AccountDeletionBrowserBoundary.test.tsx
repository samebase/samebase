// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AccountDeletionBrowserBoundary } from "./AccountDeletionBrowserBoundary";
import { writeAccountDeletionBrowserMarker } from "@/lib/accountDeletionBrowserState";

const completionCapability = "a".repeat(64);

const authState = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
const locationState = vi.hoisted(() => ({ pathname: "/" }));
const queryState = vi.hoisted<{
  completion: undefined | null | { completedAt: number; state: "succeeded" };
  completionByCapability: Map<
    string,
    undefined | null | { completedAt: number; state: "succeeded" }
  >;
  status: null | {
    completionCapability: string;
    currentStep: "delete_identity";
    latestProgressAt: number;
    markerPhase: "deleting" | "finalizing";
    requestedAt: number;
    runId: string;
    state: "needs_attention" | "running";
  };
  viewer:
    | undefined
    | { role: "role_anonymous" | "role_deleting" | "role_member" | "role_pending_access" };
}>(() => ({
  completion: null,
  completionByCapability: new Map(),
  status: null,
  viewer: undefined,
}));
const routerState = vi.hoisted(() => ({ navigate: vi.fn() }));
const cleanupState = vi.hoisted(() => ({ resetLocalAppData: vi.fn() }));
const authActionState = vi.hoisted(() => ({ signOut: vi.fn() }));
const posthogState = vi.hoisted(() => ({ reset: vi.fn() }));

vi.mock("@convex-dev/auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@convex-dev/auth/react")>();
  return { ...actual, useAuthActions: () => authActionState };
});

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
        if (
          "completionCapability" in args &&
          typeof args.completionCapability === "string" &&
          queryState.completionByCapability.has(args.completionCapability)
        ) {
          return queryState.completionByCapability.get(args.completionCapability);
        }
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

function createDeferred<Value>() {
  const control: { resolve: (value: Value) => void } = {
    resolve: () => {
      throw new Error("Deferred promise was not initialized.");
    },
  };
  const promise = new Promise<Value>((resolve) => {
    control.resolve = resolve;
  });
  return { promise, resolve: control.resolve };
}

async function renderBoundary(strict = false) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const boundary = (
    <AccountDeletionBrowserBoundary>
      <div data-testid="children">Normal route</div>
    </AccountDeletionBrowserBoundary>
  );
  await act(async () => {
    root.render(strict ? <StrictMode>{boundary}</StrictMode> : boundary);
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
    queryState.completionByCapability = new Map();
    queryState.status = null;
    queryState.viewer = undefined;
    routerState.navigate.mockReset();
    routerState.navigate.mockResolvedValue(undefined);
    cleanupState.resetLocalAppData.mockReset();
    cleanupState.resetLocalAppData.mockResolvedValue(undefined);
    authActionState.signOut.mockReset();
    authActionState.signOut.mockResolvedValue(undefined);
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
      expect(authActionState.signOut).toHaveBeenCalledTimes(1);
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
    locationState.pathname = "/account-deletion";
    queryState.viewer = { role: "role_anonymous" };
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(authActionState.signOut).toHaveBeenCalledTimes(1);
      expect(posthogState.reset).toHaveBeenCalledTimes(1);
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
      expect(mounted.rootElement.textContent).not.toContain("Normal route");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("recovers an authenticated deleted session from the root route", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    queryState.viewer = { role: "role_anonymous" };
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      expect(routerState.navigate).toHaveBeenCalledWith({
        href: "/account-deletion",
        replace: true,
      });
      expect(authActionState.signOut).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
      expect(mounted.rootElement.textContent).not.toContain("Normal route");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("does not let a new pending account consume an old deletion receipt", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    locationState.pathname = "/account-deletion";
    queryState.viewer = { role: "role_pending_access" };
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      expect(authActionState.signOut).not.toHaveBeenCalled();
      expect(cleanupState.resetLocalAppData).not.toHaveBeenCalled();
      expect(window.localStorage.getItem("samebase:account-deletion")).toBeNull();
      expect(mounted.rootElement.textContent).toContain("Normal route");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("keeps the deleted JWT behind verification while the completion receipt catches up", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    locationState.pathname = "/account-deletion";
    queryState.viewer = { role: "role_anonymous" };
    queryState.completion = null;

    const mounted = await renderBoundary();
    try {
      expect(mounted.rootElement.textContent).toContain("Checking account deletion");
      expect(mounted.rootElement.textContent).not.toContain("Normal route");
      expect(mounted.rootElement.querySelector("button")).toBeNull();

      queryState.completion = { completedAt: 3, state: "succeeded" };
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Normal route</div>
          </AccountDeletionBrowserBoundary>,
        );
        await Promise.resolve();
      });
      expect(authActionState.signOut).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("runs sign-out and analytics reset once before clearing browser data", async () => {
    const signOut = createDeferred<void>();
    const posthogReset = createDeferred<void>();
    authActionState.signOut.mockReturnValue(signOut.promise);
    posthogState.reset.mockReturnValue(posthogReset.promise);
    writeAccountDeletionBrowserMarker(completionCapability);
    authState.isAuthenticated = false;
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary(true);
    try {
      expect(authActionState.signOut).toHaveBeenCalledTimes(1);
      expect(posthogState.reset).toHaveBeenCalledTimes(1);
      expect(cleanupState.resetLocalAppData).not.toHaveBeenCalled();
      expect(mounted.rootElement.textContent).toContain("Finishing account deletion");

      await act(async () => {
        signOut.resolve();
        posthogReset.resolve();
        await signOut.promise;
        await posthogReset.promise;
      });
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Account deleted");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("reports cleanup failure after still clearing local data when sign-out fails", async () => {
    authActionState.signOut.mockRejectedValue(new Error("session already deleted"));
    writeAccountDeletionBrowserMarker(completionCapability);
    authState.isAuthenticated = false;
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      expect(posthogState.reset).toHaveBeenCalledTimes(1);
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Finishing account deletion");
      expect(mounted.rootElement.textContent).toContain(
        "Close other Samebase tabs, then reload this page to try clearing browser data again.",
      );
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("does not consume a stale successful receipt while the active run owns another capability", async () => {
    const staleCapability = "b".repeat(64);
    writeAccountDeletionBrowserMarker(staleCapability);
    locationState.pathname = "/account-deletion";
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
    queryState.completionByCapability.set(staleCapability, {
      completedAt: 3,
      state: "succeeded",
    });
    queryState.completionByCapability.set(completionCapability, null);

    const mounted = await renderBoundary();
    try {
      expect(authActionState.signOut).not.toHaveBeenCalled();
      expect(posthogState.reset).not.toHaveBeenCalled();
      expect(cleanupState.resetLocalAppData).not.toHaveBeenCalled();
      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability });
      expect(mounted.rootElement.textContent).toContain("Normal route");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("ignores a stale successful receipt for an ordinary signed-in member", async () => {
    writeAccountDeletionBrowserMarker(completionCapability);
    queryState.viewer = { role: "role_member" };
    queryState.completion = { completedAt: 3, state: "succeeded" };

    const mounted = await renderBoundary();
    try {
      expect(authActionState.signOut).not.toHaveBeenCalled();
      expect(posthogState.reset).not.toHaveBeenCalled();
      expect(cleanupState.resetLocalAppData).not.toHaveBeenCalled();
      expect(window.localStorage.getItem("samebase:account-deletion")).toBeNull();
      expect(mounted.rootElement.textContent).toContain("Normal route");
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
      expect(mounted.rootElement.textContent).toContain(
        "Close other Samebase tabs, then reload this page to try clearing browser data again.",
      );
      expect(mounted.rootElement.textContent).not.toContain("Account deleted");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });
});
