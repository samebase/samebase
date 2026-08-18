// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AccountDeletionPage } from "./AccountDeletionPage";

const authActionState = vi.hoisted(() => ({ signOut: vi.fn() }));
const routerState = vi.hoisted(() => ({ navigate: vi.fn() }));
const toastState = vi.hoisted(() => ({ toast: vi.fn() }));
const queryState = vi.hoisted<{
  status:
    | undefined
    | {
        currentStep: "request_accepted";
        deletionStartsAt: number;
        latestProgressAt: number;
        state: "queued";
      };
}>(() => ({
  status: {
    currentStep: "request_accepted",
    deletionStartsAt: Date.UTC(2026, 6, 19, 12),
    latestProgressAt: Date.UTC(2026, 6, 12, 12),
    state: "queued",
  },
}));

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => ({ signOut: authActionState.signOut }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useRouter: () => routerState };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useQuery: () => queryState.status,
  };
});

vi.mock("@/components/ui/use-toast", () => ({ toast: toastState.toast }));

function createDeferred() {
  const control: { reject: (reason: unknown) => void; resolve: () => void } = {
    reject: () => {
      throw new Error("Deferred promise was not initialized.");
    },
    resolve: () => {
      throw new Error("Deferred promise was not initialized.");
    },
  };
  const promise = new Promise<void>((resolve, reject) => {
    control.reject = reject;
    control.resolve = resolve;
  });
  return { ...control, promise };
}

async function mountPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(<AccountDeletionPage />);
  });

  return {
    rootElement,
    async unmount() {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

describe("AccountDeletionPage", () => {
  beforeEach(() => {
    authActionState.signOut.mockReset();
    routerState.navigate.mockReset();
    routerState.navigate.mockResolvedValue(undefined);
    toastState.toast.mockReset();
    queryState.status = {
      currentStep: "request_accepted",
      deletionStartsAt: Date.UTC(2026, 6, 19, 12),
      latestProgressAt: Date.UTC(2026, 6, 12, 12),
      state: "queued",
    };
  });

  it("keeps sign-out available while deletion status loads", async () => {
    queryState.status = undefined;
    const mounted = await mountPage();

    try {
      expect(mounted.rootElement.textContent).toContain("Account deletion");
      expect(mounted.rootElement.querySelector("button")?.textContent).toBe("Sign out");
    } finally {
      await mounted.unmount();
    }
  });

  it("disables sign-out while pending and opens the public landing page after success", async () => {
    const deferred = createDeferred();
    authActionState.signOut.mockReturnValue(deferred.promise);
    const mounted = await mountPage();

    try {
      const signOut = mounted.rootElement.querySelector("button");
      await act(async () => signOut?.click());

      expect(signOut?.disabled).toBe(true);
      expect(signOut?.textContent).toContain("Signing out...");

      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });

      expect(routerState.navigate).toHaveBeenCalledWith({
        href: "/",
        replace: true,
        state: true,
      });
      expect(toastState.toast).not.toHaveBeenCalled();
    } finally {
      await mounted.unmount();
    }
  });

  it("shows an error and enables sign-out again after failure", async () => {
    authActionState.signOut.mockRejectedValue(new Error("Session service unavailable."));
    const mounted = await mountPage();

    try {
      const signOut = mounted.rootElement.querySelector("button");
      await act(async () => signOut?.click());

      expect(routerState.navigate).not.toHaveBeenCalled();
      expect(toastState.toast).toHaveBeenCalledWith({
        description: "Session service unavailable.",
        title: "Could not sign out",
        variant: "destructive",
      });
      expect(signOut?.disabled).toBe(false);
      expect(signOut?.textContent).toBe("Sign out");
    } finally {
      await mounted.unmount();
    }
  });
});
