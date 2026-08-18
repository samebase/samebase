// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AdminAccountDeletionsPage } from "./AdminAccountDeletionsPage";

const mutationState = vi.hoisted(() => ({
  deleteNow: vi.fn(),
  restore: vi.fn(),
  retry: vi.fn(),
}));
const queryState = vi.hoisted(() => ({
  detail: {
    run: {
      runId: "run_id-1",
      state: "needs_attention",
      currentStep: "revoke_access",
      requestedAt: 1,
      latestProgressAt: 2,
      deletionStartsAt: Date.UTC(2026, 7, 26, 12),
      retryCount: 1,
      email: "person_name@example.test",
      latestSafeError: "Provider revocation needs staff attention.",
      outcomes: {
        providerRevocation: {
          state: "completed",
          githubUserAuthorization: { state: "cleared" },
          cloudflareConnections: { state: "cleared" },
          convexConnections: {
            state: "manual_revocation_required",
            safeNotice: "Convex OAuth requires manual revocation.",
          },
        },
        completionEmail: {
          state: "delivery_failed",
          safeError: "Completion email delivery could not be confirmed.",
        },
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

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: (reference: Parameters<typeof actual.useMutation>[0]) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.accountDeletion.index.deleteNow)) {
        return mutationState.deleteNow;
      }
      if (name === getFunctionName(api.accountDeletion.index.restore)) {
        return mutationState.restore;
      }
      return mutationState.retry;
    },
    usePaginatedQuery: () => ({
      results: [queryState.detail.run],
      status: "Exhausted",
      loadMore: vi.fn(),
    }),
    useQuery: (_reference: unknown, args: object | "skip") =>
      args === "skip" ? undefined : queryState.detail,
  };
});

describe("AdminAccountDeletionsPage", () => {
  beforeEach(() => {
    queryState.detail.run.state = "needs_attention";
    mutationState.deleteNow.mockReset();
    mutationState.deleteNow.mockResolvedValue(undefined);
    mutationState.restore.mockReset();
    mutationState.restore.mockResolvedValue(undefined);
    mutationState.retry.mockReset();
    mutationState.retry.mockResolvedValue(undefined);
  });

  it.each([
    {
      buttonName: "Delete now",
      clearsSelection: false,
      mutation: mutationState.deleteNow,
    },
    {
      buttonName: "Restore account",
      clearsSelection: true,
      mutation: mutationState.restore,
    },
  ])(
    "calls $buttonName for a queued account",
    async ({ buttonName, clearsSelection, mutation }) => {
      queryState.detail.run.state = "queued";
      const rootElement = document.createElement("div");
      document.body.append(rootElement);
      const root = createRoot(rootElement);
      await act(async () => {
        root.render(<AdminAccountDeletionsPage />);
      });
      try {
        const operation = Array.from(rootElement.querySelectorAll("button")).find(
          (button) => button.textContent === "run_id-1",
        );
        await act(async () => operation?.click());

        const action = Array.from(rootElement.querySelectorAll("button")).find(
          (button) => button.textContent === buttonName,
        );
        expect(action).toBeDefined();
        expect(rootElement.textContent).toContain("Deletion starts");
        expect(rootElement.textContent).not.toContain("Retry");

        await act(async () => {
          action?.click();
          await Promise.resolve();
        });
        expect(mutation).toHaveBeenCalledWith({ runId: "run_id-1" });
        expect(rootElement.querySelector("section") === null).toBe(clearsSelection);
      } finally {
        await act(async () => root.unmount());
        rootElement.remove();
      }
    },
  );

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
        (button) => button.textContent === "run_id-1",
      );
      await act(async () => operation?.click());

      expect(operation?.getAttribute("aria-pressed")).toBe("true");
      const detailList = rootElement.querySelector("section dl");
      const detailRows = Array.from(detailList?.children ?? []);
      const operationDetail = detailRows.find(
        (row) => row.querySelector("dt")?.textContent === "Operation",
      );
      const accountDetail = detailRows.find(
        (row) => row.querySelector("dt")?.textContent === "Account",
      );
      const convexDetail = detailRows.find(
        (row) => row.querySelector("dt")?.textContent === "Convex connections",
      );
      const completionEmailDetail = detailRows.find(
        (row) => row.querySelector("dt")?.textContent === "Completion email",
      );

      expect(operationDetail?.querySelector("dd")?.textContent).toBe("run_id-1");
      expect(accountDetail?.querySelector("dd")?.textContent).toBe("person_name@example.test");
      expect(convexDetail?.querySelector("dd")?.textContent).toBe("manual revocation required");
      expect(completionEmailDetail?.querySelector("dd")?.textContent).toBe("delivery failed");
      expect(rootElement.textContent).toContain(
        "Completion email delivery could not be confirmed.",
      );
      expect(rootElement.textContent).toContain("Convex OAuth requires manual revocation.");
      const retry = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
      expect(retry).toBeDefined();
      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });
      expect(mutationState.retry).toHaveBeenCalledWith({ runId: "run_id-1" });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
