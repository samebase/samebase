// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  useRepositoryInventoryChecks,
  type RepositoryInventoryCheck,
} from "./useRepositoryInventoryChecks";

const { convexActionMock, convexClientMock } = vi.hoisted(() => {
  const action =
    vi.fn<
      (reference: FunctionReference<"action">, args: Record<string, unknown>) => Promise<unknown>
    >();
  return { convexActionMock: action, convexClientMock: { action } };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useConvex: () => convexClientMock,
  };
});

type HookArgs = Parameters<typeof useRepositoryInventoryChecks>[0];
type HookResult = ReturnType<typeof useRepositoryInventoryChecks>;
type ChecksPage =
  (typeof api.repositoryInventoryChecks.listRepositoryInventoryChecksPage)["_returnType"];

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function snapshotId(value: string): Id<"vaultRepositoryInventorySnapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function check(sourceKey: string): RepositoryInventoryCheck {
  return {
    source: "commit_status",
    sourceKey,
    name: `check-${sourceKey}`,
    state: "success",
    status: "success",
  };
}

function page(args: {
  items: RepositoryInventoryCheck[];
  totalCount: number;
  nextCursor?: string | null;
  githubChecksUrl?: string;
}): ChecksPage {
  return {
    items: args.items,
    totals: {
      state: args.totalCount === 0 ? "unknown" : "success",
      totalCount: args.totalCount,
      checkRunCount: 0,
      statusContextCount: args.totalCount,
      successCount: args.totalCount,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    },
    pageSignature: args.items.map((item) => `${item.source}:${item.sourceKey}`).join(","),
    nextCursor: args.nextCursor ?? null,
    githubChecksUrl:
      args.githubChecksUrl ?? "https://github.com/samebase/samebase/commit/abc/checks",
  };
}

function ChecksProbe({
  args,
  onRender,
}: {
  args: HookArgs;
  onRender: (value: HookResult) => void;
}) {
  onRender(useRepositoryInventoryChecks(args));
  return null;
}

describe("useRepositoryInventoryChecks", () => {
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
          createElement(ChecksProbe, {
            args,
            onRender: (value) => {
              latestResult = value;
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
    convexActionMock.mockReset();
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

  it("loads one page only after the details component mounts", async () => {
    convexActionMock.mockResolvedValue(page({ items: [check("one")], totalCount: 1 }));

    renderHook(defaultArgs);

    await vi.waitFor(() => {
      expect(currentResult().checks.map((item) => item.sourceKey)).toEqual(["one"]);
      expect(currentResult().isLoading).toBe(false);
      expect(currentResult().hasNextPage).toBe(false);
    });
    const [reference, args] = convexActionMock.mock.calls[0] ?? [];
    expect(getFunctionName(reference)).toBe(
      "repositoryInventoryChecks:listRepositoryInventoryChecksPage",
    );
    expect(args).toEqual({ ...defaultArgs, cursor: null, previousPageSignatures: [] });
  });

  it("retries when another repository observation temporarily owns the GitHub lease", async () => {
    convexActionMock
      .mockRejectedValueOnce(
        new ConvexError({
          code: "github_checks_temporarily_unavailable",
          reason: "queue",
          retryAt: Date.now(),
        }),
      )
      .mockResolvedValue(page({ items: [check("one")], totalCount: 1 }));

    renderHook(defaultArgs);

    await vi.waitFor(() => {
      expect(currentResult().checks.map((item) => item.sourceKey)).toEqual(["one"]);
      expect(currentResult().error).toBeNull();
    });
    expect(convexActionMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a GitHub rate-limit wait", async () => {
    convexActionMock.mockRejectedValue(
      new ConvexError({
        code: "github_checks_temporarily_unavailable",
        reason: "rate_limit",
        retryAt: Date.now() + 60_000,
      }),
    );

    renderHook(defaultArgs);

    await vi.waitFor(() => expect(currentResult().error).not.toBeNull());
    expect(convexActionMock).toHaveBeenCalledTimes(1);
  });

  it("accumulates explicit pages", async () => {
    convexActionMock.mockImplementation(async (_reference, args) =>
      args.cursor === null
        ? page({ items: [check("one")], totalCount: 2, nextCursor: "page-two" })
        : page({ items: [check("two")], totalCount: 2 }),
    );

    renderHook(defaultArgs);
    await vi.waitFor(() => expect(currentResult().hasNextPage).toBe(true));
    await act(async () => {
      await currentResult().fetchNextPage();
    });
    await vi.waitFor(() => {
      expect(currentResult().checks.map((item) => item.sourceKey)).toEqual(["one", "two"]);
      expect(currentResult().hasNextPage).toBe(false);
    });
  });

  it("rejects duplicate checks across pages", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    client.setQueryData(
      [
        "repository-inventory-checks",
        defaultArgs.vaultId,
        defaultArgs.snapshotId,
        defaultArgs.rowKey,
      ],
      {
        pages: [
          page({ items: [check("one")], totalCount: 2, nextCursor: "page-two" }),
          page({ items: [check("one")], totalCount: 2 }),
        ],
        pageParams: [
          { cursor: null, previousPageSignatures: [] },
          { cursor: "page-two", previousPageSignatures: ["commit_status:one"] },
        ],
      },
    );

    renderHook(defaultArgs);
    expect(currentResult().checks).toEqual([]);
    expect(currentResult().error).toMatchObject({
      message: "GitHub returned a duplicate check while loading.",
    });
  });

  it("rejects changed totals or an incomplete final page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    client.setQueryData(
      [
        "repository-inventory-checks",
        defaultArgs.vaultId,
        defaultArgs.snapshotId,
        defaultArgs.rowKey,
      ],
      {
        pages: [page({ items: [check("one")], totalCount: 2 })],
        pageParams: [{ cursor: null, previousPageSignatures: [] }],
      },
    );

    renderHook(defaultArgs);
    expect(currentResult().checks).toEqual([]);
    expect(currentResult().error).toMatchObject({
      message: "GitHub checks ended before every check was loaded.",
    });
  });

  it("isolates the browser cache by vault, snapshot, and row", async () => {
    convexActionMock.mockImplementation(async (_reference, args) =>
      page({
        items: [check(`${String(args.vaultId)}/${String(args.snapshotId)}/${String(args.rowKey)}`)],
        totalCount: 1,
      }),
    );
    const variants: HookArgs[] = [
      defaultArgs,
      { ...defaultArgs, vaultId: vaultId("vault-two") },
      { ...defaultArgs, snapshotId: snapshotId("snapshot-two") },
      { ...defaultArgs, rowKey: "pull-request:two" },
    ];

    for (const args of variants) {
      renderHook(args);
      await vi.waitFor(() => {
        expect(currentResult().checks[0]?.sourceKey).toBe(
          `${args.vaultId}/${args.snapshotId}/${args.rowKey}`,
        );
      });
    }
    expect(convexActionMock).toHaveBeenCalledTimes(4);

    renderHook(defaultArgs);
    expect(currentResult().checks[0]?.sourceKey).toBe(
      `${defaultArgs.vaultId}/${defaultArgs.snapshotId}/${defaultArgs.rowKey}`,
    );
    expect(convexActionMock).toHaveBeenCalledTimes(4);
  });
});
