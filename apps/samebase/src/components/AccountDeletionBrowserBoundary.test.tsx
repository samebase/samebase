// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AccountDeletionBrowserBoundary } from "./AccountDeletionBrowserBoundary";
import { writeAccountDeletionBrowserMarker } from "@/lib/accountDeletionBrowserState";

const authState = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
const locationState = vi.hoisted(() => ({ pathname: "/" }));
const queryState = vi.hoisted<{
  status: null | {
    currentStep: "delete_identity";
    latestProgressAt: number;
    markerPhase: "finalizing";
    requestedAt: number;
    runId: string;
    state: "running";
  };
  viewer: undefined | { role: "role_deleting" | "role_member" };
}>(() => ({ status: null, viewer: undefined }));
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
      return getFunctionName(reference) === "users:currentViewerAccess"
        ? queryState.viewer
        : queryState.status;
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
    queryState.status = null;
    queryState.viewer = undefined;
    routerState.navigate.mockReset();
    routerState.navigate.mockResolvedValue(undefined);
    cleanupState.resetLocalAppData.mockReset();
    cleanupState.resetLocalAppData.mockReturnValue(new Promise<void>(() => {}));
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

  it("observes finalization only for the browser's accepted run", async () => {
    writeAccountDeletionBrowserMarker("run-1");
    queryState.viewer = { role: "role_deleting" };
    queryState.status = {
      currentStep: "delete_identity",
      latestProgressAt: 2,
      markerPhase: "finalizing",
      requestedAt: 1,
      runId: "run-2",
      state: "running",
    };
    locationState.pathname = "/account-deletion";
    const mounted = await renderBoundary();
    try {
      expect(window.localStorage.getItem("samebase:account-deletion")).toContain(
        '"observedFinalizing":false',
      );

      queryState.status = { ...queryState.status, runId: "run-1" };
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Deletion route</div>
          </AccountDeletionBrowserBoundary>,
        );
      });
      expect(window.localStorage.getItem("samebase:account-deletion")).toContain(
        '"observedFinalizing":true',
      );
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });

  it("starts browser cleanup after auth loss only when finalization was observed", async () => {
    writeAccountDeletionBrowserMarker("run-1");
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
      expect(posthogState.reset).not.toHaveBeenCalled();

      authState.isAuthenticated = true;
      queryState.viewer = { role: "role_deleting" };
      queryState.status = {
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

      authState.isAuthenticated = false;
      queryState.viewer = undefined;
      await act(async () => {
        mounted.root.render(
          <AccountDeletionBrowserBoundary>
            <div>Signed out</div>
          </AccountDeletionBrowserBoundary>,
        );
        await Promise.resolve();
      });
      expect(posthogState.reset).toHaveBeenCalledTimes(1);
      expect(cleanupState.resetLocalAppData).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.rootElement.remove();
    }
  });
});
