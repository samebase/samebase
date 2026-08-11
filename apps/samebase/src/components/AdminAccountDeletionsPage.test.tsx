// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AdminAccountDeletionsPage } from "./AdminAccountDeletionsPage";

const mutationState = vi.hoisted(() => ({
  accountRetry: vi.fn(),
  organizationRetry: vi.fn(),
}));
const queryState = vi.hoisted(() => ({
  accountDetail: {
    run: {
      runId: "run_id-1",
      state: "needs_attention",
      currentStep: "revoke_access",
      requestedAt: 1,
      latestProgressAt: 2,
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
  organizationRun: {
    runId: "organization_run_id-1",
    state: "needs_attention",
    currentStep: "stop_billing",
    requestedAt: 3,
    latestProgressAt: 4,
    retryCount: 2,
    githubOwnerLogin: "samebase",
    latestSafeError: "Polar customer cleanup needs staff attention.",
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === getFunctionName(api.organizationDeletion.index.retryForAdmin)
      ? mutationState.organizationRetry
      : mutationState.accountRetry,
  usePaginatedQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === getFunctionName(api.organizationDeletion.index.listForAdmin)
      ? {
          results: [queryState.organizationRun],
          status: "Exhausted",
          loadMore: vi.fn(),
        }
      : {
          results: [queryState.accountDetail.run],
          status: "Exhausted",
          loadMore: vi.fn(),
        },
  useQuery: (_reference: unknown, args: object | "skip") =>
    args === "skip" ? undefined : queryState.accountDetail,
}));

describe("AdminAccountDeletionsPage", () => {
  beforeEach(() => {
    mutationState.accountRetry.mockReset();
    mutationState.accountRetry.mockResolvedValue(undefined);
    mutationState.organizationRetry.mockReset();
    mutationState.organizationRetry.mockResolvedValue(undefined);
  });

  it("shows safe account and organization recovery details", async () => {
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
      expect(mutationState.accountRetry).toHaveBeenCalledWith({ runId: "run_id-1" });

      const organizationSection = rootElement.querySelector(
        "section[aria-labelledby='organization-deletions-heading']",
      );
      expect(organizationSection?.textContent).toContain("samebase");
      expect(organizationSection?.textContent).toContain("needs attention");
      expect(organizationSection?.textContent).toContain("stop billing");
      expect(organizationSection?.textContent).toContain(
        "Polar customer cleanup needs staff attention.",
      );
      const organizationRetry = Array.from(
        organizationSection?.querySelectorAll("button") ?? [],
      ).find((button) => button.textContent === "Retry");
      expect(organizationRetry).toBeDefined();
      await act(async () => {
        organizationRetry?.click();
        await Promise.resolve();
      });
      expect(mutationState.organizationRetry).toHaveBeenCalledWith({
        runId: "organization_run_id-1",
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
