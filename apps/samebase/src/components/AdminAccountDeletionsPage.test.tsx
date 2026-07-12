// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AdminAccountDeletionsPage } from "./AdminAccountDeletionsPage";

const mutationState = vi.hoisted(() => ({ retry: vi.fn() }));
const queryState = vi.hoisted(() => ({
  detail: {
    run: {
      runId: "run-1",
      state: "needs_attention",
      currentStep: "revoke_access",
      requestedAt: 1,
      latestProgressAt: 2,
      retryCount: 1,
      email: "person@example.test",
      latestSafeError: "Provider revocation needs staff attention.",
      outcomes: {
        billing: { state: "succeeded" },
        providerRevocation: {
          state: "completed",
          github: {
            state: "unconfirmed",
            safeError: "GitHub OAuth revocation could not be confirmed.",
          },
          cloudflare: { state: "revoked" },
          convex: {
            state: "manual_revocation_required",
            safeNotice: "Convex OAuth requires manual revocation.",
          },
        },
        completionEmail: { state: "not_started" },
      },
    },
    events: [
      {
        step: "revoke_access",
        level: "error",
        message: "Revocation needs attention.",
        createdAt: 2,
      },
    ],
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => mutationState.retry,
  usePaginatedQuery: () => ({
    results: [queryState.detail.run],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
  useQuery: (_reference: unknown, args: object | "skip") =>
    args === "skip" ? undefined : queryState.detail,
}));

describe("AdminAccountDeletionsPage", () => {
  beforeEach(() => {
    mutationState.retry.mockReset();
    mutationState.retry.mockResolvedValue(undefined);
  });

  it("masks operations and exposes safe provider outcomes with retry only on attention", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(<AdminAccountDeletionsPage />);
    });
    try {
      expect(rootElement.querySelector("[data-posthog-mask]")).not.toBeNull();
      const operation = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "run-1",
      );
      await act(async () => operation?.click());

      expect(rootElement.textContent).toContain("person@example.test");
      expect(rootElement.textContent).toContain("run-1");
      expect(rootElement.textContent).toContain("GitHub OAuth revocation could not be confirmed.");
      expect(rootElement.textContent).toContain("Convex OAuth requires manual revocation.");
      const retry = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
      expect(retry).toBeDefined();
      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });
      expect(mutationState.retry).toHaveBeenCalledWith({ runId: "run-1" });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
