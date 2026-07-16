// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  convexQuery: vi.fn(),
  ownerId: { value: "user-1" },
  revision: { value: 1 },
}));

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: mocks.convexQuery }),
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

function entry(revision: number, index: number): RepositorySummaryDirectoryEntry {
  return {
    vaultId: vaultId(`revision-${revision}-vault-${index}`),
    repositoryFullName: `ada/revision-${revision}-vault-${index}`,
    state: {
      state: "connected",
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
    expect(latest?.entries[0]?.repositoryFullName).toBe("ada/revision-1-vault-0");
    expect(latest?.entries).toHaveLength(30);
    expect(latest?.status).toBe("LoadingMore");

    revisionTwoFirstPage.resolve({
      continueCursor: "revision-2-page-2",
      isDone: false,
      page: Array.from({ length: 25 }, (_, index) => entry(2, index)),
    });
    await vi.waitFor(() => {
      expect(latest?.entries[0]?.repositoryFullName).toBe("ada/revision-2-vault-0");
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
        page: [{ ...entry(args.directoryRevision, 0), repositoryFullName: "user-1/repository" }],
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
      expect(latest?.entries[0]?.repositoryFullName).toBe("user-1/repository");
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
      page: [{ ...entry(1, 0), repositoryFullName: "user-2/repository" }],
    });
    await vi.waitFor(() => {
      expect(latest?.entries[0]?.repositoryFullName).toBe("user-2/repository");
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(2);
  });
});
