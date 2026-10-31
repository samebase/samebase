// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import { RepositorySetupStackStatus } from "./RepositorySetupStackStatus";

const readStatus = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useAction: () => readStatus,
}));

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs a stable value.
  return value;
}

describe("RepositorySetupStackStatus", () => {
  let element: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    readStatus.mockReset();
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    vi.useRealTimers();
  });

  /** Advances the clock, then lets the query report the read that the clock started. */
  async function advance(milliseconds: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(milliseconds);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  async function renderStatus(): Promise<void> {
    const queryClient = new QueryClient();
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RepositorySetupStackStatus
            repository={{
              repositoryId: fakeRepositoryId("repository_1"),
              githubRepositoryFullName: "samebase/actions-app",
              deletion: { state: "not_deleting", deleteAction: { state: "available" } },
              providerPlan: {
                provisioning: "repository_actions",
                convexConfigPath: "convex.json",
                ciSecrets: { state: "written", writtenAt: 1, credentialRevision: 1 },
              },
              providerSetup: { status: "ready" },
            }}
          />
        </QueryClientProvider>,
      );
    });
    await advance(0);
  }

  it("shows the first deployment in progress with the Actions page, and no failure", async () => {
    readStatus.mockResolvedValue({ state: "in_progress" });
    await renderStatus();

    expect(element.textContent).toBe("The first deployment is in progress in GitHub Actions.");
    expect(element.querySelector("a")?.getAttribute("href")).toBe(
      "https://github.com/samebase/actions-app/actions",
    );
  });

  it("shows nothing once the deployment is done, and stops reading", async () => {
    readStatus.mockResolvedValueOnce({ state: "in_progress" });
    readStatus.mockResolvedValue({ state: "done" });
    await renderStatus();

    await advance(31 * 1000);
    expect(element.textContent).toBe("");
    expect(readStatus).toHaveBeenCalledTimes(2);

    await advance(10 * 60 * 1000);
    expect(readStatus).toHaveBeenCalledTimes(2);
  });

  it("keeps the in-progress line when a later read fails", async () => {
    readStatus.mockResolvedValueOnce({ state: "in_progress" });
    readStatus.mockRejectedValueOnce(new Error("The store is being created."));
    readStatus.mockResolvedValue({ state: "done" });
    await renderStatus();

    await advance(31 * 1000);
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(element.textContent).toBe("The first deployment is in progress in GitHub Actions.");

    await advance(31 * 1000);
    expect(element.textContent).toBe("");
  });

  it("offers a retry when the first read fails, and keeps reading", async () => {
    readStatus.mockRejectedValueOnce(new Error("Convex is unavailable."));
    readStatus.mockResolvedValue({ state: "in_progress" });
    await renderStatus();

    expect(element.textContent).toBe("Could not read the setup status.Retry");

    await advance(31 * 1000);
    expect(element.textContent).toBe("The first deployment is in progress in GitHub Actions.");
  });
});
