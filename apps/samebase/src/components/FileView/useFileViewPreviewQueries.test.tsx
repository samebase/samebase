// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../../convex/_generated/api";
import { useBranchComparePreviewQuery, useCommitPreviewQuery } from "./useFileViewPreviewQueries";

const testState = vi.hoisted(() => ({
  actions: new Map<string, ReturnType<typeof vi.fn>>(),
  onCommitSuccess: vi.fn(),
  onUpstreamConflict: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) => {
      const handler = testState.actions.get(getFunctionName(reference));
      if (!handler) {
        throw new Error(`Missing action handler for ${getFunctionName(reference)}.`);
      }
      return handler;
    },
  };
});

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function previewFile(path: string) {
  return {
    additions: 1,
    deletions: 0,
    isBinary: false,
    isMarkdown: false,
    newLineCount: 1,
    oldLineCount: 0,
    patchTruncated: false,
    path,
    status: "added" as const,
  };
}

function commitPreview(path: string) {
  return {
    branch: "feature",
    files: [previewFile(path)],
    hasDestructiveChanges: false,
    safety: {
      destructiveFileCount: 0,
      includesTruncatedPatches: false,
      truncatedPatchFileCount: 0,
    },
    totals: {
      added: 1,
      additions: 1,
      deleted: 0,
      deletions: 0,
      files: 1,
      modified: 0,
      renamed: 0,
    },
  };
}

function branchComparePreview(path: string) {
  return {
    baseBranch: "main",
    branch: "feature",
    files: [previewFile(path)],
    hasDestructiveChanges: false,
    safety: {
      destructiveFileCount: 0,
      includesTruncatedPatches: false,
      truncatedPatchFileCount: 0,
    },
    source: "branch_compare" as const,
    sourceFileListTruncated: false,
    totals: {
      added: 1,
      additions: 1,
      deleted: 0,
      deletions: 0,
      files: 1,
      modified: 0,
      renamed: 0,
    },
  };
}

type CommitHookProps = Omit<
  Parameters<typeof useCommitPreviewQuery>[0],
  "onSuccess" | "onUpstreamConflict"
>;
type BranchHookProps = Parameters<typeof useBranchComparePreviewQuery>[0];
type CommitHookResult = ReturnType<typeof useCommitPreviewQuery>;
type BranchHookResult = ReturnType<typeof useBranchComparePreviewQuery>;

let latestCommitResult: CommitHookResult | null = null;
let latestBranchResult: BranchHookResult | null = null;

function CommitProbe(props: CommitHookProps) {
  latestCommitResult = useCommitPreviewQuery({
    ...props,
    onSuccess: testState.onCommitSuccess,
    onUpstreamConflict: testState.onUpstreamConflict,
  });
  return <output>{latestCommitResult.preview?.files[0]?.path ?? "none"}</output>;
}

function BranchProbe(props: BranchHookProps) {
  latestBranchResult = useBranchComparePreviewQuery(props);
  return <output>{latestBranchResult.preview?.files[0]?.path ?? "none"}</output>;
}

describe("FileView preview queries", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  const commitProps: CommitHookProps = {
    branch: "feature",
    enabled: true,
    refreshKey: "staging-a",
    githubRepositoryFullName: "samebase/samebase",
    repositoryId: "repository-a",
  };
  const branchProps: BranchHookProps = {
    branch: "feature",
    enabled: true,
    githubRepositoryFullName: "samebase/samebase",
    stagingRefreshKey: "staging-a",
    targetRefreshKey: "target-a",
    repositoryId: "repository-a",
  };

  beforeEach(() => {
    latestCommitResult = null;
    latestBranchResult = null;
    testState.actions.clear();
    testState.onCommitSuccess.mockReset();
    testState.onUpstreamConflict.mockReset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    rootElement.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function renderCommit(props: CommitHookProps): Promise<void> {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CommitProbe {...props} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  async function renderBranch(props: BranchHookProps): Promise<void> {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <BranchProbe {...props} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  it("loads a commit preview and reports its successful refresh", async () => {
    const getCommitPreview = vi.fn().mockResolvedValue(commitPreview("src/one.ts"));
    testState.actions.set(
      getFunctionName(api.fileStagingActions.getCommitPreview),
      getCommitPreview,
    );

    await renderCommit(commitProps);
    await vi.waitFor(() => expect(latestCommitResult?.preview?.files[0]?.path).toBe("src/one.ts"));

    expect(getCommitPreview).toHaveBeenCalledWith({
      githubRepositoryFullName: "samebase/samebase",
      branch: "feature",
      includePatch: true,
    });
    expect(testState.onCommitSuccess).toHaveBeenCalledTimes(1);
    expect(latestCommitResult?.error).toBeNull();
  });

  it("routes an upstream conflict without exposing it as a normal query error", async () => {
    vi.useFakeTimers();
    const conflictMessage =
      "Commit conflicts with upstream changes. Resolve and retry: src/conflict.ts";
    const getCommitPreview = vi.fn().mockRejectedValue(new Error(conflictMessage));
    testState.actions.set(
      getFunctionName(api.fileStagingActions.getCommitPreview),
      getCommitPreview,
    );

    await renderCommit(commitProps);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(testState.onUpstreamConflict).toHaveBeenCalledWith(conflictMessage);
    expect(latestCommitResult).toMatchObject({ error: null, preview: null });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(getCommitPreview).toHaveBeenCalledTimes(1);
  });

  it("debounces staging-only compare refreshes and retains current rows", async () => {
    vi.useFakeTimers();
    const nextRequest = createDeferred<ReturnType<typeof branchComparePreview>>();
    const getBranchComparePreview = vi
      .fn()
      .mockResolvedValueOnce(branchComparePreview("src/current.ts"))
      .mockImplementationOnce(async () => nextRequest.promise);
    testState.actions.set(
      getFunctionName(api.fileStagingActions.getBranchComparePreview),
      getBranchComparePreview,
    );

    await renderBranch(branchProps);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(latestBranchResult?.preview?.files[0]?.path).toBe("src/current.ts");

    await renderBranch({ ...branchProps, stagingRefreshKey: "staging-b" });
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(getBranchComparePreview).toHaveBeenCalledTimes(1);
    expect(latestBranchResult?.preview?.files[0]?.path).toBe("src/current.ts");

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(getBranchComparePreview).toHaveBeenCalledTimes(2);
    expect(latestBranchResult?.preview?.files[0]?.path).toBe("src/current.ts");

    await act(async () => nextRequest.resolve(branchComparePreview("src/next.ts")));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(latestBranchResult?.preview?.files[0]?.path).toBe("src/next.ts");
  });

  it("loads a new compare target immediately and ignores the old result", async () => {
    const oldRequest = createDeferred<ReturnType<typeof branchComparePreview>>();
    const newRequest = createDeferred<ReturnType<typeof branchComparePreview>>();
    const getBranchComparePreview = vi
      .fn()
      .mockImplementationOnce(async () => oldRequest.promise)
      .mockImplementationOnce(async () => newRequest.promise);
    testState.actions.set(
      getFunctionName(api.fileStagingActions.getBranchComparePreview),
      getBranchComparePreview,
    );

    await renderBranch(branchProps);
    expect(latestBranchResult?.isLoading).toBe(true);
    await renderBranch({ ...branchProps, targetRefreshKey: "target-b" });
    expect(getBranchComparePreview).toHaveBeenCalledTimes(2);
    expect(latestBranchResult).toMatchObject({ isLoading: true, preview: null });

    await act(async () => oldRequest.resolve(branchComparePreview("src/old.ts")));
    expect(latestBranchResult?.preview).toBeNull();

    await act(async () => newRequest.resolve(branchComparePreview("src/new.ts")));
    await vi.waitFor(() => expect(latestBranchResult?.preview?.files[0]?.path).toBe("src/new.ts"));
  });
});
