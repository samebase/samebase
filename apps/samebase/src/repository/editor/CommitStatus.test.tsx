// @vitest-environment jsdom

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CommitStatus } from "./CommitStatus";

const testState = vi.hoisted(() => ({
  getCommitStatus: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: () => testState.getCommitStatus,
  };
});

const emptyResult = {
  kind: "ok" as const,
  check_runs: [],
  statuses: [],
};

const finalResult = {
  kind: "ok" as const,
  check_runs: [
    {
      conclusion: "success",
      html_url: "https://github.com/samebase/samebase/runs/1",
      id: 1,
      name: "Unit tests",
      status: "completed",
    },
  ],
  statuses: [],
};

const runningResult = {
  kind: "ok" as const,
  check_runs: [
    {
      conclusion: null,
      html_url: "https://github.com/samebase/samebase/runs/1",
      id: 1,
      name: "Unit tests",
      status: "in_progress",
    },
  ],
  statuses: [],
};

describe("CommitStatus", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    testState.getCommitStatus.mockReset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    rootElement.remove();
    focusManager.setFocused(undefined);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function renderStatus(): Promise<void> {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CommitStatus owner="samebase" repo="samebase" commitSha="abc123" />
        </QueryClientProvider>,
      );
    });
    await flushQueryUpdates();
  }

  async function flushQueryUpdates(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("keeps the minimum request gap for repeated empty results", async () => {
    testState.getCommitStatus
      .mockResolvedValueOnce(emptyResult)
      .mockResolvedValueOnce(emptyResult)
      .mockResolvedValueOnce(finalResult);

    await renderStatus();
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(1);
    expect(rootElement.textContent).toBe("No checks/statuses");

    await act(async () => vi.advanceTimersByTimeAsync(4_999));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await flushQueryUpdates();
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(4_999));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await flushQueryUpdates();
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(rootElement.textContent).toContain("Checks1"));

    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(3);
  });

  it("polls running checks after 30 seconds while the tab is in the background", async () => {
    testState.getCommitStatus
      .mockResolvedValueOnce(runningResult)
      .mockResolvedValueOnce(finalResult);

    await renderStatus();
    expect(testState.getCommitStatus).toHaveBeenCalledWith({
      owner: "samebase",
      repo: "samebase",
      ref: "abc123",
    });
    expect(rootElement.querySelector("a")?.getAttribute("aria-label")).toContain("1 running");
    focusManager.setFocused(false);

    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await flushQueryUpdates();
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(rootElement.querySelector("a")?.getAttribute("aria-label")).toContain("1 passed"),
    );
  });

  it("uses the shared GitHub rate-limit reset time", async () => {
    const resetAtMs = Date.now() + 45_000;
    testState.getCommitStatus
      .mockResolvedValueOnce({
        resetAtMs,
        retryAfterMs: null,
        kind: "rate_limited",
        message: "GitHub API rate limited.",
      })
      .mockResolvedValueOnce(finalResult);

    await renderStatus();
    expect(rootElement.textContent).toBe("Checks paused");
    expect(rootElement.querySelector("span")?.getAttribute("aria-label")).toContain(
      "GitHub API rate limited.",
    );

    await act(async () => vi.advanceTimersByTimeAsync(44_999));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await flushQueryUpdates();
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(2);
  });

  it("uses the shorter positive rate-limit delay", async () => {
    testState.getCommitStatus
      .mockResolvedValueOnce({
        kind: "rate_limited",
        message: "GitHub API rate limited.",
        resetAtMs: Date.now() + 90_000,
        retryAfterMs: 30_000,
      })
      .mockResolvedValueOnce(finalResult);

    await renderStatus();
    expect(rootElement.textContent).toBe("Checks paused");

    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await flushQueryUpdates();
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(2);
  });

  it("shows one action error and does not retry it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    testState.getCommitStatus.mockRejectedValue(new Error("checks unavailable"));

    await renderStatus();
    expect(rootElement.textContent).toBe("Checks error");
    expect(rootElement.querySelector("span")?.getAttribute("aria-label")).toBe(
      "Checks error: checks unavailable",
    );

    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(testState.getCommitStatus).toHaveBeenCalledTimes(1);
  });
});
