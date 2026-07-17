// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName, type FunctionReference } from "convex/server";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  useRepositoryInventoryUnattributedCloudflareBuilds,
  type RepositoryInventoryUnattributedCloudflareBuild,
} from "./useRepositoryInventoryUnattributedCloudflareBuilds";

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

type HookArgs = Parameters<typeof useRepositoryInventoryUnattributedCloudflareBuilds>[0];
type HookResult = ReturnType<typeof useRepositoryInventoryUnattributedCloudflareBuilds>;
type BuildPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryUnattributedCloudflareBuildPage)["_returnType"];
type ReadyBuildPage = Extract<BuildPageResult, { state: "ready" }>;

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function snapshotId(value: string): Id<"vaultRepositoryInventorySnapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function build(sourceKey: string): RepositoryInventoryUnattributedCloudflareBuild {
  return {
    commitSha: `${sourceKey}-commit-sha`,
    build: {
      sourceKey,
      checkName: `Workers Builds: ${sourceKey}`,
      workerName: sourceKey,
      rootDirectory: { state: "unknown" },
      branch: { state: "conflicting_evidence", suiteBranch: "main" },
      providerStatus: "completed",
      providerConclusion: "success",
      state: "success",
      preview: { state: "disabled" },
    },
  };
}

function readyPage(args: {
  expectedBuildCount: number;
  page: RepositoryInventoryUnattributedCloudflareBuild[];
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
    "repository-inventory-unattributed-cloudflare-builds",
    args.vaultId,
    args.snapshotId,
  ] as const;
}

function UnattributedBuildsProbe({
  args,
  onRender,
}: {
  args: HookArgs;
  onRender: (result: HookResult) => void;
}) {
  onRender(useRepositoryInventoryUnattributedCloudflareBuilds(args));
  return null;
}

describe("useRepositoryInventoryUnattributedCloudflareBuilds", () => {
  let client: QueryClient;
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  let latestResult: HookResult | undefined;

  const defaultArgs: HookArgs = {
    vaultId: vaultId("vault-one"),
    snapshotId: snapshotId("snapshot-one"),
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
          createElement(UnattributedBuildsProbe, {
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

  it("loads bounded pages and keeps commit evidence", async () => {
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
            expectedBuildCount: 2,
            page: [build("alpha")],
            isDone: false,
            continueCursor: "page-two",
          })
        : readyPage({ expectedBuildCount: 2, page: [build("beta")], isDone: true });
    });

    renderHook(defaultArgs);
    await vi.waitFor(() => {
      expect(currentResult().builds.map((item) => item.build.sourceKey)).toEqual(["alpha"]);
      expect(currentResult().hasNextPage).toBe(true);
    });
    await act(async () => {
      await currentResult().fetchNextPage();
    });
    await vi.waitFor(() => {
      expect(currentResult().builds).toMatchObject([
        { commitSha: "alpha-commit-sha", build: { sourceKey: "alpha" } },
        { commitSha: "beta-commit-sha", build: { sourceKey: "beta" } },
      ]);
      expect(currentResult().hasNextPage).toBe(false);
    });

    const [reference, args] = convexQueryMock.mock.calls[0] ?? [];
    expect(getFunctionName(reference)).toBe(
      "repositoryInventory:listRepositoryInventoryUnattributedCloudflareBuildPage",
    );
    expect(args).toEqual({
      ...defaultArgs,
      paginationOpts: { cursor: null, numItems: 25 },
    });
  });

  it("rejects duplicate provider build identities", () => {
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
      message: "Repository inventory returned a duplicate unattributed build.",
    });
  });

  it("reports an unavailable snapshot", async () => {
    convexQueryMock.mockResolvedValue({ state: "unavailable" });

    renderHook(defaultArgs);

    await vi.waitFor(() => {
      expect(currentResult().error).toMatchObject({
        message: "Repository inventory unattributed builds are no longer available.",
      });
      expect(currentResult().builds).toEqual([]);
      expect(currentResult().isLoading).toBe(false);
    });
  });
});
