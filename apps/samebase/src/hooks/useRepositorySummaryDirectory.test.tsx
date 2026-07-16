// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";

const mocks = vi.hoisted(() => {
  const convexQuery = vi.fn();
  return {
    convexClient: { query: convexQuery },
    convexQuery,
    ownerId: { value: "user-1" },
    revision: { value: 1 },
  };
});

vi.mock("convex/react", () => ({
  useConvex: () => mocks.convexClient,
  useQuery: () => ({ ownerId: mocks.ownerId.value, revision: mocks.revision.value }),
}));

import {
  useRepositorySummaryDirectory,
  type RepositorySummaryDirectoryEntry,
} from "./useRepositorySummaryDirectory";

const { act } = React;

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function entry(
  revision: number,
  index: number,
  githubRepositoryFullName = `ada/revision-${revision}-vault-${index}`,
): RepositorySummaryDirectoryEntry {
  return {
    vaultId: vaultId(`revision-${revision}-vault-${index}`),
    routeRepositoryFullName: `ada/revision-${revision}-vault-${index}`,
    state: {
      state: "connected",
      githubRepositoryFullName,
      summary: {
        lifecycle: { state: "idle" },
        publication: { state: "unobserved" },
      },
    },
  };
}

function deferred<Value>() {
  let resolvePromise: (value: Value) => void = () => {};
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

type DirectoryHookResult = ReturnType<typeof useRepositorySummaryDirectory>;

function RepositorySummaryDirectoryProbe({
  onRender,
}: {
  onRender: (result: DirectoryHookResult) => void;
}) {
  onRender(useRepositorySummaryDirectory());
  return null;
}

describe("useRepositorySummaryDirectory", () => {
  let queryClient: QueryClient;
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  let latest: DirectoryHookResult | null = null;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    latest = null;
    mocks.ownerId.value = "user-1";
    mocks.revision.value = 1;
    mocks.convexQuery.mockReset();
  });

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
    queryClient.clear();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads bounded pages and atomically replaces the requested depth on revision change", async () => {
    const revisionTwoFirstPage = deferred<{
      continueCursor: string;
      isDone: boolean;
      page: RepositorySummaryDirectoryEntry[];
    }>();
    mocks.convexQuery.mockImplementation(async (_query, args) => {
      const directoryArgs = args;
      const { cursor } = directoryArgs.paginationOpts;
      if (directoryArgs.directoryRevision === 2 && cursor === null) {
        return await revisionTwoFirstPage.promise;
      }
      const firstPage = cursor === null;
      const start = firstPage ? 0 : 25;
      const count = firstPage ? 25 : 5;
      return {
        continueCursor: firstPage ? `revision-${directoryArgs.directoryRevision}-page-2` : "done",
        isDone: !firstPage,
        page: Array.from({ length: count }, (_, index) =>
          entry(directoryArgs.directoryRevision, start + index),
        ),
      };
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;
    const renderProbe = () =>
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositorySummaryDirectoryProbe
            onRender={(result) => {
              latest = result;
            }}
          />
        </QueryClientProvider>,
      );

    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(latest?.entries).toHaveLength(25);
      expect(latest?.status).toBe("CanLoadMore");
    });

    act(() => {
      latest?.loadMore();
    });
    await vi.waitFor(() => {
      expect(latest?.entries).toHaveLength(30);
      expect(latest?.status).toBe("Exhausted");
    });

    mocks.revision.value = 2;
    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    expect(latest?.entries[0]).toMatchObject({
      state: { githubRepositoryFullName: "ada/revision-1-vault-0" },
    });
    expect(latest?.entries).toHaveLength(30);
    expect(latest?.status).toBe("LoadingMore");

    revisionTwoFirstPage.resolve({
      continueCursor: "revision-2-page-2",
      isDone: false,
      page: Array.from({ length: 25 }, (_, index) => entry(2, index)),
    });
    await vi.waitFor(() => {
      expect(latest?.entries[0]).toMatchObject({
        state: { githubRepositoryFullName: "ada/revision-2-vault-0" },
      });
      expect(latest?.entries).toHaveLength(30);
      expect(latest?.status).toBe("Exhausted");
    });

    const pageArgs = mocks.convexQuery.mock.calls.map((call) => call[1]);
    expect(pageArgs).toHaveLength(4);
    for (const args of pageArgs) {
      expect(args.paginationOpts).toMatchObject({
        maximumRowsRead: 25,
        numItems: 25,
      });
    }
  });

  it("never reuses or displays a same-revision page across users", async () => {
    const secondUserPage = deferred<{
      continueCursor: string;
      isDone: boolean;
      page: RepositorySummaryDirectoryEntry[];
    }>();
    mocks.convexQuery.mockImplementation(async (_query, args) => {
      if (mocks.ownerId.value === "user-2") {
        return await secondUserPage.promise;
      }
      return {
        continueCursor: "done",
        isDone: true,
        page: [entry(args.directoryRevision, 0, "user-1/repository")],
      };
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;
    const renderProbe = () =>
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositorySummaryDirectoryProbe
            onRender={(result) => {
              latest = result;
            }}
          />
        </QueryClientProvider>,
      );

    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(latest?.entries[0]).toMatchObject({
        state: { githubRepositoryFullName: "user-1/repository" },
      });
    });

    mocks.ownerId.value = "user-2";
    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    expect(latest?.entries).toEqual([]);
    expect(latest?.status).toBe("LoadingFirstPage");
    secondUserPage.resolve({
      continueCursor: "done",
      isDone: true,
      page: [entry(1, 0, "user-2/repository")],
    });
    await vi.waitFor(() => {
      expect(latest?.entries[0]).toMatchObject({
        state: { githubRepositoryFullName: "user-2/repository" },
      });
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(2);
  });

  it.each([
    { cursor: "", expectedRequests: 1, name: "empty" },
    { cursor: "repeated", expectedRequests: 2, name: "repeated" },
  ])("rejects a $name nonterminal cursor", async ({ cursor, expectedRequests }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.convexQuery.mockImplementation(async () => ({
      continueCursor: cursor,
      isDone: false,
      page: [entry(1, mocks.convexQuery.mock.calls.length)],
    }));
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositorySummaryDirectoryProbe
            onRender={(result) => {
              latest = result;
            }}
          />
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(latest?.error).toBe("Repository summary directory pagination did not advance.");
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(expectedRequests);
  });

  it("silently retries a stale directory revision", async () => {
    vi.useFakeTimers();
    mocks.convexQuery.mockResolvedValueOnce(null).mockResolvedValueOnce({
      continueCursor: "done",
      isDone: true,
      page: [entry(1, 0)],
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositorySummaryDirectoryProbe
            onRender={(result) => {
              latest = result;
            }}
          />
        </QueryClientProvider>,
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(1);
    expect(latest?.entries).toEqual([]);
    expect(latest?.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(2);
    expect(latest?.entries).toEqual([entry(1, 0)]);
    expect(latest?.error).toBeNull();
  });
});
