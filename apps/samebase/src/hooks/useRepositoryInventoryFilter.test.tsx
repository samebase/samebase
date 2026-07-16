// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FunctionReference } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";

const mocks = vi.hoisted(() => {
  const filterRoot: { value: unknown } = { value: undefined };
  const convexQuery =
    vi.fn<
      (reference: FunctionReference<"query">, args: Record<string, unknown>) => Promise<unknown>
    >();
  return {
    convexClient: { query: convexQuery },
    convexQuery,
    filterRoot,
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useConvex: () => mocks.convexClient,
    useQuery: () => mocks.filterRoot.value,
  };
});

import {
  loadRepositoryInventoryFilter,
  useRepositoryInventoryFilter,
  type LoadedRepositoryInventoryFilter,
} from "./useRepositoryInventoryFilter";

type FilterLoadArgs = Parameters<typeof loadRepositoryInventoryFilter>[0];
type FilterRoot = FilterLoadArgs["root"];
type ExcludedLabelPage = NonNullable<Awaited<ReturnType<FilterLoadArgs["query"]>>>;

const { act } = React;

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function filterRoot(
  revision: number,
  excludedLabelCount: number,
  overrides: Partial<FilterRoot> = {},
): FilterRoot {
  return {
    includeDrafts: false,
    includeNoLabel: true,
    revision,
    excludedLabelCount,
    ...overrides,
  };
}

function excludedLabelPage(args: {
  revision: number;
  names: string[];
  expectedCount: number;
  isDone?: boolean;
  continueCursor?: string;
}): ExcludedLabelPage {
  return {
    filterRevision: args.revision,
    expectedExcludedLabelCount: args.expectedCount,
    page: args.names.map((name) => ({ labelKey: name.trim().toLowerCase(), name })),
    isDone: args.isDone ?? true,
    continueCursor: args.continueCursor ?? "",
  };
}

function deferred<Value>() {
  let resolvePromise: (value: Value) => void = () => {};
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function RepositoryInventoryFilterProbe({
  onRender,
  vaultId: currentVaultId,
}: {
  onRender: (filter: LoadedRepositoryInventoryFilter | null) => void;
  vaultId: Id<"vaults"> | null;
}) {
  onRender(useRepositoryInventoryFilter(currentVaultId));
  return null;
}

describe("useRepositoryInventoryFilter", () => {
  let queryClient: QueryClient;
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  let latest: LoadedRepositoryInventoryFilter | null = null;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.convexQuery.mockReset();
    mocks.filterRoot.value = undefined;
    latest = null;
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

  it("loads 25-row cached pages and replaces one revision only after every label is complete", async () => {
    const revisionTwoLastPage = deferred<ExcludedLabelPage>();
    let requestCount = 0;
    mocks.convexQuery.mockImplementation(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return excludedLabelPage({ revision: 1, names: ["old"], expectedCount: 1 });
      }
      if (requestCount === 2) {
        return excludedLabelPage({
          revision: 2,
          names: Array.from(
            { length: 25 },
            (_, index) => `label-${String(index).padStart(2, "0")}`,
          ),
          expectedCount: 30,
          isDone: false,
          continueCursor: "revision-2-page-2",
        });
      }
      return await revisionTwoLastPage.promise;
    });
    const currentVaultId = vaultId("vault-one");
    mocks.filterRoot.value = filterRoot(1, 1);
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;
    const renderProbe = () =>
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositoryInventoryFilterProbe
            vaultId={currentVaultId}
            onRender={(filter) => {
              latest = filter;
            }}
          />
        </QueryClientProvider>,
      );

    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(latest?.hiddenLabels).toEqual(["old"]);
    });

    mocks.filterRoot.value = filterRoot(2, 30, { includeDrafts: true });
    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(mocks.convexQuery).toHaveBeenCalledTimes(3);
    });
    expect(latest).toMatchObject({ hiddenLabels: ["old"], revision: 1 });

    revisionTwoLastPage.resolve(
      excludedLabelPage({
        revision: 2,
        names: Array.from({ length: 5 }, (_, index) => `label-${index + 25}`),
        expectedCount: 30,
      }),
    );
    await vi.waitFor(() => {
      expect(latest).toMatchObject({
        hiddenLabels: Array.from(
          { length: 30 },
          (_, index) => `label-${String(index).padStart(2, "0")}`,
        ),
        includeDrafts: true,
        revision: 2,
      });
    });

    for (const [, args] of mocks.convexQuery.mock.calls) {
      expect(args).toMatchObject({
        paginationOpts: { maximumRowsRead: 25, numItems: 25 },
      });
    }
  });

  it("does not display or reuse a same-revision filter after the vault changes", async () => {
    const secondVaultPage = deferred<ExcludedLabelPage>();
    mocks.convexQuery
      .mockResolvedValueOnce(excludedLabelPage({ revision: 1, names: ["first"], expectedCount: 1 }))
      .mockImplementationOnce(async () => await secondVaultPage.promise);
    const firstVaultId = vaultId("vault-one");
    const secondVaultId = vaultId("vault-two");
    let currentVaultId = firstVaultId;
    mocks.filterRoot.value = filterRoot(1, 1);
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;
    const renderProbe = () =>
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositoryInventoryFilterProbe
            vaultId={currentVaultId}
            onRender={(filter) => {
              latest = filter;
            }}
          />
        </QueryClientProvider>,
      );

    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(latest?.hiddenLabels).toEqual(["first"]);
    });

    currentVaultId = secondVaultId;
    await act(async () => {
      renderProbe();
      await Promise.resolve();
    });
    expect(latest).toBeNull();
    secondVaultPage.resolve(
      excludedLabelPage({ revision: 1, names: ["second"], expectedCount: 1 }),
    );
    await vi.waitFor(() => {
      expect(latest?.hiddenLabels).toEqual(["second"]);
    });
    expect(mocks.convexQuery.mock.calls[0]?.[1]).toMatchObject({ vaultId: firstVaultId });
    expect(mocks.convexQuery.mock.calls[1]?.[1]).toMatchObject({ vaultId: secondVaultId });
  });

  it("rejects revision, total, identity, and ordering inconsistencies before exposure", async () => {
    const currentVaultId = vaultId("vault-validation");
    const rootState = filterRoot(4, 2);
    const cases: Array<{ name: string; page: ExcludedLabelPage; message: string }> = [
      {
        name: "revision",
        page: excludedLabelPage({ revision: 3, names: ["a", "b"], expectedCount: 2 }),
        message: "changed while loading",
      },
      {
        name: "total",
        page: excludedLabelPage({ revision: 4, names: ["a"], expectedCount: 2 }),
        message: "ended before",
      },
      {
        name: "identity",
        page: {
          ...excludedLabelPage({ revision: 4, names: ["a", "b"], expectedCount: 2 }),
          page: [
            { labelKey: "a", name: "A" },
            { labelKey: "a", name: "a" },
          ],
        },
        message: "invalid identity",
      },
      {
        name: "order",
        page: excludedLabelPage({ revision: 4, names: ["b", "a"], expectedCount: 2 }),
        message: "invalid order",
      },
    ];

    for (const testCase of cases) {
      const validationQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      await expect(
        loadRepositoryInventoryFilter({
          query: async () => testCase.page,
          queryClient: validationQueryClient,
          vaultId: currentVaultId,
          root: rootState,
          signal: new AbortController().signal,
        }),
        testCase.name,
      ).rejects.toThrow(testCase.message);
      validationQueryClient.clear();
    }
  });

  it("accepts the UTF-8 index order used by Convex for Unicode label keys", async () => {
    const loaded = await loadRepositoryInventoryFilter({
      query: async () =>
        excludedLabelPage({ revision: 1, names: ["\uE000", "😀"], expectedCount: 2 }),
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      vaultId: vaultId("vault-unicode-labels"),
      root: filterRoot(1, 2),
      signal: new AbortController().signal,
    });

    expect(loaded?.filter.hiddenLabels).toEqual(["\uE000", "😀"]);
  });

  it.each([
    {
      name: "empty",
      pages: [
        excludedLabelPage({
          revision: 1,
          names: ["a"],
          expectedCount: 2,
          isDone: false,
          continueCursor: "",
        }),
      ],
    },
    {
      name: "repeated",
      pages: [
        excludedLabelPage({
          revision: 1,
          names: ["a"],
          expectedCount: 2,
          isDone: false,
          continueCursor: "repeated",
        }),
        excludedLabelPage({
          revision: 1,
          names: ["b"],
          expectedCount: 2,
          isDone: false,
          continueCursor: "repeated",
        }),
      ],
    },
  ])("rejects a $name nonterminal cursor", async ({ pages }) => {
    let pageIndex = 0;
    const cursorQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await expect(
      loadRepositoryInventoryFilter({
        query: async () => pages[pageIndex++] ?? pages[pages.length - 1],
        queryClient: cursorQueryClient,
        vaultId: vaultId("vault-cursor-validation"),
        root: filterRoot(1, 2),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Repository inventory excluded-label pagination did not advance.");
    cursorQueryClient.clear();
  });

  it("silently retries a stale filter revision", async () => {
    vi.useFakeTimers();
    const currentVaultId = vaultId("vault-stale-filter");
    mocks.filterRoot.value = filterRoot(1, 1);
    mocks.convexQuery
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        excludedLabelPage({ revision: 1, names: ["ready"], expectedCount: 1 }),
      );
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <QueryClientProvider client={queryClient}>
          <RepositoryInventoryFilterProbe
            vaultId={currentVaultId}
            onRender={(filter) => {
              latest = filter;
            }}
          />
        </QueryClientProvider>,
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(1);
    expect(latest).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.convexQuery).toHaveBeenCalledTimes(2);
    expect(latest).toEqual({
      hiddenLabels: ["ready"],
      includeDrafts: false,
      includeNoLabel: true,
      revision: 1,
    });
  });
});
