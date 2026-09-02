// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SIMPLE_VIEW_CONFIG_PATH } from "@/lib/simpleView";
import { useRepositorySimpleViewConfig } from "./useRepositorySimpleViewConfig";

const testState = vi.hoisted(() => ({
  getRepositoryFileContent: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: () => testState.getRepositoryFileContent,
  };
});

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

type HookProps = Parameters<typeof useRepositorySimpleViewConfig>[0];
type HookResult = ReturnType<typeof useRepositorySimpleViewConfig>;

let latestResult: HookResult | null = null;

function Probe(props: HookProps) {
  latestResult = useRepositorySimpleViewConfig(props);
  return <output>{latestResult.content ?? "none"}</output>;
}

describe("useRepositorySimpleViewConfig", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  const baseProps: HookProps = {
    branch: "main",
    githubRepositoryFullName: "samebase/samebase",
    stagedConfigFile: null,
    treeSHA: "tree-a",
    repositoryId: "repository-a",
  };

  beforeEach(() => {
    latestResult = null;
    testState.getRepositoryFileContent.mockReset();
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

  async function renderHook(props: HookProps): Promise<void> {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe {...props} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  it("waits for staging and skips the repository action when staging owns the file", async () => {
    await renderHook({ ...baseProps, stagedConfigFile: undefined });
    expect(latestResult).toEqual({ content: null, resolved: false });

    await renderHook({
      ...baseProps,
      stagedConfigFile: { content: "staged", fileDeleted: false },
    });
    expect(latestResult).toEqual({ content: null, resolved: true });

    await renderHook({
      ...baseProps,
      stagedConfigFile: { content: "", fileDeleted: true },
    });
    expect(latestResult).toEqual({ content: null, resolved: true });
    expect(testState.getRepositoryFileContent).not.toHaveBeenCalled();
  });

  it("loads repository content once staging resolves to null", async () => {
    testState.getRepositoryFileContent.mockResolvedValue({
      content: "exclude:\n  - archive/**",
      exists: true,
    });

    await renderHook(baseProps);
    await vi.waitFor(() => {
      expect(latestResult).toEqual({
        content: "exclude:\n  - archive/**",
        resolved: true,
      });
    });
    expect(testState.getRepositoryFileContent).toHaveBeenCalledWith({
      githubRepositoryFullName: "samebase/samebase",
      filePath: SIMPLE_VIEW_CONFIG_PATH,
      branch: "main",
    });
  });

  it("settles to null after a missing file or one action error", async () => {
    testState.getRepositoryFileContent.mockResolvedValueOnce({ exists: false });
    await renderHook(baseProps);
    await vi.waitFor(() => expect(latestResult).toEqual({ content: null, resolved: true }));

    vi.useFakeTimers();
    testState.getRepositoryFileContent.mockRejectedValueOnce(new Error("GitHub unavailable"));
    await renderHook({ ...baseProps, treeSHA: "tree-b" });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(latestResult).toEqual({ content: null, resolved: true });

    await renderHook({
      ...baseProps,
      stagedConfigFile: { content: "staged", fileDeleted: false },
      treeSHA: "tree-b",
    });
    await renderHook({ ...baseProps, treeSHA: "tree-b" });

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(testState.getRepositoryFileContent).toHaveBeenCalledTimes(2);
  });

  it("uses a new branch or tree key without showing the old result", async () => {
    const oldRequest = createDeferred<{ content: string; exists: true }>();
    testState.getRepositoryFileContent
      .mockImplementationOnce(async () => oldRequest.promise)
      .mockResolvedValueOnce({ content: "new config", exists: true });

    await renderHook(baseProps);
    await renderHook({ ...baseProps, branch: "feature", treeSHA: "tree-b" });
    await vi.waitFor(() => expect(latestResult?.content).toBe("new config"));

    await act(async () => oldRequest.resolve({ content: "old config", exists: true }));
    expect(latestResult?.content).toBe("new config");
    expect(testState.getRepositoryFileContent).toHaveBeenCalledTimes(2);
  });
});
