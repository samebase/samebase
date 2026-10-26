// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GitHubTree } from "@samebase/git-editor/model";
import { useProjectFiles, type ProjectFile } from "./useProjectFiles";

const testState = vi.hoisted(() => ({
  batchReadFiles: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: () => testState.batchReadFiles,
  };
});

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable identity.
  return value;
}

function treeEntry(path: string, options: { size?: number; type?: string } = {}): GitHubTree {
  return {
    mode: "100644",
    path,
    sha: `sha:${path}`,
    size: options.size,
    type: options.type ?? "blob",
  };
}

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type HookProps = {
  activeFilePath: string;
  branch: string;
  tree: GitHubTree[];
  treeSHA: string;
  repositoryId: Id<"repositories"> | undefined;
};

type HookResult = ReturnType<typeof useProjectFiles>;

const latestResults = new Map<string, HookResult>();

function Probe({ id, props }: { id: string; props: HookProps }) {
  const result = useProjectFiles(
    props.repositoryId,
    props.branch,
    props.tree,
    props.treeSHA,
    props.activeFilePath,
  );
  latestResults.set(id, result);
  return <output data-testid={id}>{result.files.map((file) => file.path).join(",")}</output>;
}

describe("useProjectFiles", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    latestResults.clear();
    testState.batchReadFiles.mockReset();
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

  async function renderProbes(probes: Array<{ id: string; props: HookProps }>): Promise<void> {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          {probes.map((probe) => (
            <Probe key={probe.id} id={probe.id} props={probe.props} />
          ))}
        </QueryClientProvider>,
      );
    });
  }

  const baseProps = {
    activeFilePath: "apps/samebase/src/main.ts",
    branch: "main",
    treeSHA: "tree-a",
    repositoryId: fakeRepositoryId("repository:a"),
  };

  it("loads the eligible files for one scoped project snapshot", async () => {
    const files: ProjectFile[] = [{ path: "apps/samebase/src/main.ts", content: "export {}" }];
    testState.batchReadFiles.mockResolvedValue(files);
    const tree = [
      treeEntry("packages/other/src/index.ts"),
      treeEntry("package.json"),
      treeEntry("apps/samebase/src/main.ts"),
      treeEntry("apps/samebase/tsconfig.json"),
      treeEntry("tsconfig.json"),
      treeEntry("tsconfig.base.json"),
      treeEntry("apps/samebase/node_modules/skip.ts"),
      treeEntry("apps/samebase/src/large.ts", { size: 100_001 }),
      treeEntry("apps/samebase/src/folder", { type: "tree" }),
    ];

    await renderProbes([{ id: "one", props: { ...baseProps, tree } }]);

    await vi.waitFor(() => {
      expect(latestResults.get("one")?.loading).toBe(false);
      expect(latestResults.get("one")?.files).toEqual(files);
    });
    expect(testState.batchReadFiles).toHaveBeenCalledWith({
      repositoryId: baseProps.repositoryId,
      branch: "main",
      filePaths: [
        "tsconfig.base.json",
        "tsconfig.json",
        "apps/samebase/tsconfig.json",
        "apps/samebase/src/main.ts",
        "package.json",
      ],
    });
  });

  it("shares one action request between equal hook users", async () => {
    const pending = createDeferred<ProjectFile[]>();
    testState.batchReadFiles.mockImplementation(async () => pending.promise);
    const props = { ...baseProps, tree: [treeEntry("apps/samebase/src/main.ts")] };

    await renderProbes([
      { id: "one", props },
      { id: "two", props },
    ]);

    expect(testState.batchReadFiles).toHaveBeenCalledTimes(1);
    const files: ProjectFile[] = [{ path: "apps/samebase/src/main.ts", content: "one" }];
    await act(async () => pending.resolve(files));
    await vi.waitFor(() => {
      expect(latestResults.get("one")?.files).toEqual(files);
      expect(latestResults.get("two")?.files).toEqual(files);
    });
  });

  it("does not show an old tree result after the tree changes", async () => {
    const oldPending = createDeferred<ProjectFile[]>();
    const newFiles: ProjectFile[] = [{ path: "apps/samebase/src/new.ts", content: "new" }];
    testState.batchReadFiles
      .mockImplementationOnce(async () => oldPending.promise)
      .mockResolvedValueOnce(newFiles);

    await renderProbes([
      {
        id: "one",
        props: { ...baseProps, tree: [treeEntry("apps/samebase/src/old.ts")] },
      },
    ]);
    expect(testState.batchReadFiles).toHaveBeenCalledTimes(1);

    await renderProbes([
      {
        id: "one",
        props: {
          ...baseProps,
          tree: [treeEntry("apps/samebase/src/new.ts")],
          treeSHA: "tree-b",
        },
      },
    ]);
    await vi.waitFor(() => expect(latestResults.get("one")?.files).toEqual(newFiles));

    await act(async () => {
      oldPending.resolve([{ path: "apps/samebase/src/old.ts", content: "old" }]);
      await oldPending.promise;
    });
    expect(latestResults.get("one")?.files).toEqual(newFiles);
  });

  it("settles without retries after an action failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    testState.batchReadFiles.mockRejectedValue(new Error("read failed"));

    await renderProbes([
      {
        id: "one",
        props: { ...baseProps, tree: [treeEntry("apps/samebase/src/main.ts")] },
      },
    ]);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(latestResults.get("one")).toMatchObject({ files: [], loading: false });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(testState.batchReadFiles).toHaveBeenCalledTimes(1);
  });

  it("does not request files without a repository or an eligible path", async () => {
    await renderProbes([
      {
        id: "no-repository",
        props: {
          ...baseProps,
          tree: [treeEntry("apps/samebase/src/main.ts")],
          repositoryId: undefined,
        },
      },
      {
        id: "no-path",
        props: { ...baseProps, tree: [treeEntry("README.md")] },
      },
    ]);

    expect(testState.batchReadFiles).not.toHaveBeenCalled();
    expect(latestResults.get("no-repository")).toMatchObject({ files: [], loading: false });
    expect(latestResults.get("no-path")).toMatchObject({ files: [], loading: false });
  });

  it("clears cached files when the same snapshot has no eligible paths", async () => {
    const files: ProjectFile[] = [{ path: "apps/samebase/src/main.ts", content: "export {}" }];
    testState.batchReadFiles.mockResolvedValue(files);

    await renderProbes([
      {
        id: "one",
        props: { ...baseProps, tree: [treeEntry("apps/samebase/src/main.ts")] },
      },
    ]);
    await vi.waitFor(() => expect(latestResults.get("one")?.files).toEqual(files));

    await renderProbes([
      {
        id: "one",
        props: { ...baseProps, tree: [treeEntry("README.md")] },
      },
    ]);

    expect(latestResults.get("one")).toMatchObject({ files: [], loading: false });
    expect(testState.batchReadFiles).toHaveBeenCalledTimes(1);
  });
});
