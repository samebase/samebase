// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName, type FunctionReference } from "convex/server";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  useRepositoryInventoryCloudflareBuilds,
  type RepositoryInventoryCloudflareBuild,
} from "./useRepositoryInventoryCloudflareBuilds";

const { convexClientMock, convexQueryMock } = vi.hoisted(() => {
  const query =
    vi.fn<
      (reference: FunctionReference<"query">, args: Record<string, unknown>) => Promise<unknown>
    >();
  return { convexClientMock: { query }, convexQueryMock: query };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useConvex: () => convexClientMock,
  };
});

type HookArgs = Parameters<typeof useRepositoryInventoryCloudflareBuilds>[0];
type HookResult = ReturnType<typeof useRepositoryInventoryCloudflareBuilds>;
type BuildPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryCloudflareBuildPage)["_returnType"];
type ReadyBuildPage = Extract<BuildPageResult, { state: "ready" }>;

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function snapshotId(value: string): Id<"vaultRepositoryInventorySnapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function build(sourceKey: string): RepositoryInventoryCloudflareBuild {
  return {
    sourceKey,
    checkName: `Workers Builds: ${sourceKey}`,
    workerName: sourceKey,
    rootDirectory: { state: "unknown" },
    branch: { state: "known", name: "main" },
    providerStatus: "completed",
    providerConclusion: "success",
    state: "success",
    preview: { state: "disabled" },
  };
}

function readyPage(args: {
  expectedBuildCount: number;
  page: RepositoryInventoryCloudflareBuild[];
  isDone: boolean;
  continueCursor?: string;
}): ReadyBuildPage {
  return {
    state: "ready",
    expectedBuildCount: args.expectedBuildCount,
    page: args.page,
    isDone: args.isDone,
    continueCursor: args.continueCursor ?? "",
  };
}

function queryKey(args: HookArgs) {
  return [
    "repository-inventory-cloudflare-builds",
    args.vaultId,
    args.snapshotId,
    args.rowKey,
  ] as const;
}

function CloudflareBuildsProbe({
  args,
  onRender,
}: {
  args: HookArgs;
  onRender: (result: HookResult) => void;
}) {
  onRender(useRepositoryInventoryCloudflareBuilds(args));
  return null;
}

describe("useRepositoryInventoryCloudflareBuilds", () => {
  let client: QueryClient;
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  let latestResult: HookResult | undefined;

  const defaultArgs: HookArgs = {
    vaultId: vaultId("vault-one"),
    snapshotId: snapshotId("snapshot-one"),
    rowKey: "branch:main",
  };

  function renderHook(args: HookArgs): void {
    if (root === null) {
      throw new Error("Expected the hook root to be mounted.");
    }
    const mountedRoot = root;
    act(() => {
      mountedRoot.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(CloudflareBuildsProbe, {
            args,
            onRender: (result) => {
              latestResult = result;
            },
          }),
        ),
      );
    });
  }

  function currentResult(): HookResult {
    if (latestResult === undefined) {
      throw new Error("Expected the hook to render a result.");
    }
    return latestResult;
  }

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    latestResult = undefined;
    convexQueryMock.mockReset();
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
    client.clear();
    vi.restoreAllMocks();
  });

  it("loads one bounded page", async () => {
    convexQueryMock.mockResolvedValue(
      readyPage({ expectedBuildCount: 2, page: [build("alpha"), build("beta")], isDone: true }),
    );

    renderHook(defaultArgs);

    await vi.waitFor(() => {
      expect(currentResult().builds.map((item) => item.sourceKey)).toEqual(["alpha", "beta"]);
      expect(currentResult().isLoading).toBe(false);
      expect(currentResult().hasNextPage).toBe(false);
    });
    expect(convexQueryMock).toHaveBeenCalledTimes(1);
    const [reference, args] = convexQueryMock.mock.calls[0] ?? [];
    expect(getFunctionName(reference)).toBe(
      "repositoryInventory:listRepositoryInventoryCloudflareBuildPage",
    );
    expect(args).toEqual({
      ...defaultArgs,
      paginationOpts: { cursor: null, numItems: 25 },
    });
  });

  it("accumulates multiple pages", async () => {
    convexQueryMock.mockImplementation(async (_reference, args) => {
      const paginationOpts = args.paginationOpts;
      if (
        typeof paginationOpts !== "object" ||
        paginationOpts === null ||
        !("cursor" in paginationOpts)
      ) {
        throw new Error("Expected pagination options.");
      }
      return paginationOpts.cursor === null
        ? readyPage({
            expectedBuildCount: 3,
            page: [build("alpha"), build("beta")],
            isDone: false,
            continueCursor: "page-two",
          })
        : readyPage({ expectedBuildCount: 3, page: [build("gamma")], isDone: true });
    });

    renderHook(defaultArgs);
    await vi.waitFor(() => {
      expect(currentResult().builds).toHaveLength(2);
      expect(currentResult().hasNextPage).toBe(true);
    });
    await act(async () => {
      await currentResult().fetchNextPage();
    });
    await vi.waitFor(() => {
      expect(currentResult().builds.map((item) => item.sourceKey)).toEqual([
        "alpha",
        "beta",
        "gamma",
      ]);
      expect(currentResult().hasNextPage).toBe(false);
    });
    expect(convexQueryMock.mock.calls.map((call) => call[1])).toMatchObject([
      { paginationOpts: { cursor: null, numItems: 25 } },
      { paginationOpts: { cursor: "page-two", numItems: 25 } },
    ]);
  });

  it("rejects duplicate sources", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    client.setQueryData(queryKey(defaultArgs), {
      pages: [
        readyPage({
          expectedBuildCount: 2,
          page: [build("alpha")],
          isDone: false,
          continueCursor: "page-two",
        }),
        readyPage({ expectedBuildCount: 2, page: [build("alpha")], isDone: true }),
      ],
      pageParams: [null, "page-two"],
    });

    renderHook(defaultArgs);
    expect(currentResult().builds).toEqual([]);
    expect(currentResult().error).toMatchObject({
      message: "Repository inventory returned a duplicate Cloudflare build.",
    });
  });

  it.each([
    {
      name: "a total change",
      pages: [
        readyPage({
          expectedBuildCount: 2,
          page: [build("alpha")],
          isDone: false,
          continueCursor: "page-two",
        }),
        readyPage({ expectedBuildCount: 3, page: [build("beta")], isDone: true }),
      ],
      message: "Repository inventory build totals changed while loading.",
    },
    {
      name: "early completion",
      pages: [readyPage({ expectedBuildCount: 2, page: [build("alpha")], isDone: true })],
      message: "Repository inventory builds ended before every build was loaded.",
    },
  ])("rejects $name", ({ pages, message }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    client.setQueryData(queryKey(defaultArgs), {
      pages,
      pageParams: pages.map((_, index) => (index === 0 ? null : `page-${index + 1}`)),
    });

    renderHook(defaultArgs);
    expect(currentResult().builds).toEqual([]);
    expect(currentResult().error).toMatchObject({ message });
  });

  it("reports an unavailable snapshot", async () => {
    convexQueryMock.mockResolvedValue({ state: "unavailable" });

    renderHook(defaultArgs);

    await vi.waitFor(() => {
      expect(currentResult().error).toMatchObject({
        message: "Repository inventory builds are no longer available.",
      });
      expect(currentResult().builds).toEqual([]);
      expect(currentResult().isLoading).toBe(false);
    });
  });

  it("isolates cached pages by vault, snapshot, and row key", async () => {
    convexQueryMock.mockImplementation(async (_reference, args) => {
      const currentVaultId = String(args.vaultId);
      const currentSnapshotId = String(args.snapshotId);
      const currentRowKey = String(args.rowKey);
      return readyPage({
        expectedBuildCount: 1,
        page: [build(`${currentVaultId}/${currentSnapshotId}/${currentRowKey}`)],
        isDone: true,
      });
    });
    const variants: HookArgs[] = [
      defaultArgs,
      { ...defaultArgs, vaultId: vaultId("vault-two") },
      { ...defaultArgs, snapshotId: snapshotId("snapshot-two") },
      { ...defaultArgs, rowKey: "pull-request:PR_two" },
    ];

    for (const args of variants) {
      renderHook(args);
      await vi.waitFor(() => {
        expect(currentResult().builds[0]?.sourceKey).toBe(
          `${args.vaultId}/${args.snapshotId}/${args.rowKey}`,
        );
      });
    }
    expect(convexQueryMock).toHaveBeenCalledTimes(4);

    renderHook(defaultArgs);
    expect(currentResult().builds[0]?.sourceKey).toBe(
      `${defaultArgs.vaultId}/${defaultArgs.snapshotId}/${defaultArgs.rowKey}`,
    );
    expect(convexQueryMock).toHaveBeenCalledTimes(4);
  });
});
