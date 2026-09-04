// @vitest-environment jsdom

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RepositoryMediaViewer } from "./RepositoryMediaViewer";

const testState = vi.hoisted(() => ({
  getRepositoryMediaAsset: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: () => testState.getRepositoryMediaAsset,
  };
});

vi.mock("@/repository/editor/RepositoryVoxPreview", () => ({
  RepositoryVoxPreview: () => <div data-testid="vox-preview" />,
}));

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function imageAsset(fileName: string, url: string) {
  return {
    fileName,
    found: true as const,
    kind: "image" as const,
    mimeType: "image/png",
    url,
  };
}

describe("RepositoryMediaViewer", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    testState.getRepositoryMediaAsset.mockReset();
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

  async function renderViewer(
    props: {
      branch?: string;
      filePath?: string;
      skipStaging?: boolean;
    } = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RepositoryMediaViewer
            githubRepositoryFullName="samebase/samebase"
            branch={props.branch ?? "main"}
            filePath={props.filePath ?? "assets/example.png"}
            skipStaging={props.skipStaging}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  async function flushQueryUpdates(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("shows a fast image result without the delayed spinner", async () => {
    testState.getRepositoryMediaAsset.mockResolvedValue(
      imageAsset("example.png", "https://storage.example/one"),
    );

    await renderViewer();
    await flushQueryUpdates();

    expect(testState.getRepositoryMediaAsset).toHaveBeenCalledWith({
      githubRepositoryFullName: "samebase/samebase",
      filePath: "assets/example.png",
      branch: "main",
      skipStaging: false,
    });
    expect(rootElement.querySelector(".animate-spin")).toBeNull();
    expect(rootElement.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.example/one",
    );
  });

  it("shows the spinner only after 500 milliseconds", async () => {
    const pending = createDeferred<ReturnType<typeof imageAsset>>();
    testState.getRepositoryMediaAsset.mockImplementation(async () => pending.promise);

    await renderViewer();
    await act(async () => vi.advanceTimersByTimeAsync(499));
    expect(rootElement.querySelector(".animate-spin")).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(rootElement.querySelector(".animate-spin")).not.toBeNull();

    await act(async () =>
      pending.resolve(imageAsset("example.png", "https://storage.example/one")),
    );
    await flushQueryUpdates();
    expect(rootElement.querySelector(".animate-spin")).toBeNull();
  });

  it("does not show a late result for the previous file key", async () => {
    const first = createDeferred<ReturnType<typeof imageAsset>>();
    const second = createDeferred<ReturnType<typeof imageAsset>>();
    testState.getRepositoryMediaAsset
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);

    await renderViewer({ filePath: "assets/first.png" });
    await renderViewer({ filePath: "assets/second.png", skipStaging: true });
    expect(testState.getRepositoryMediaAsset).toHaveBeenCalledTimes(2);

    await act(async () => first.resolve(imageAsset("first.png", "https://storage.example/first")));
    await flushQueryUpdates();
    expect(rootElement.querySelector("img")).toBeNull();

    await act(async () =>
      second.resolve(imageAsset("second.png", "https://storage.example/second")),
    );
    await flushQueryUpdates();
    expect(rootElement.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.example/second",
    );
    expect(testState.getRepositoryMediaAsset).toHaveBeenLastCalledWith({
      githubRepositoryFullName: "samebase/samebase",
      filePath: "assets/second.png",
      branch: "main",
      skipStaging: true,
    });
  });

  it("shows one action error without a focus retry", async () => {
    testState.getRepositoryMediaAsset.mockRejectedValue(new Error("Preview failed."));

    await renderViewer();
    await flushQueryUpdates();
    expect(rootElement.textContent).toBe("Preview failed.");

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(testState.getRepositoryMediaAsset).toHaveBeenCalledTimes(1);
  });

  it("does not render the old URL after an immediate same-key remount", async () => {
    const nextRequest = createDeferred<ReturnType<typeof imageAsset>>();
    testState.getRepositoryMediaAsset
      .mockResolvedValueOnce(imageAsset("example.png", "https://storage.example/one"))
      .mockImplementationOnce(async () => nextRequest.promise);

    await renderViewer();
    await flushQueryUpdates();
    expect(rootElement.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.example/one",
    );

    await act(async () => {
      root.render(<QueryClientProvider client={queryClient}>{null}</QueryClientProvider>);
    });
    await renderViewer();

    expect(testState.getRepositoryMediaAsset).toHaveBeenCalledTimes(2);
    expect(rootElement.querySelector("img")).toBeNull();

    await act(async () =>
      nextRequest.resolve(imageAsset("example.png", "https://storage.example/two")),
    );
    await flushQueryUpdates();
    expect(rootElement.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.example/two",
    );
  });

  it("keeps one active request through the Strict Mode effect cycle", async () => {
    testState.getRepositoryMediaAsset.mockResolvedValue(
      imageAsset("example.png", "https://storage.example/strict"),
    );

    await act(async () => {
      root.render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <RepositoryMediaViewer
              githubRepositoryFullName="samebase/samebase"
              branch="main"
              filePath="assets/example.png"
            />
          </QueryClientProvider>
        </StrictMode>,
      );
      await Promise.resolve();
    });
    await flushQueryUpdates();

    expect(testState.getRepositoryMediaAsset).toHaveBeenCalledTimes(1);
    expect(rootElement.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.example/strict",
    );
  });
});
