// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { useFileViewInventoryTreeSync } from "./useFileViewInventoryTreeSync";

const { act } = React;

// @ts-expect-error Convex ids are strings at runtime; the hook only forwards this test id.
const vaultId: Id<"vaults"> = "inventory-tree-sync-vault";

describe("useFileViewInventoryTreeSync", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
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
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("retries the published inventory head until the cached tree catches up", async () => {
    const refreshTree = vi.fn(async () => ({
      refreshed: false,
      reason: "in_progress" as const,
    }));
    const Probe = ({ cachedTreeCommitSha }: { cachedTreeCommitSha: string }) => {
      useFileViewInventoryTreeSync({
        vaultId,
        branch: "main",
        cachedTreeCommitSha,
        inventoryHeadCommitSha: "published-head",
        treeRefreshCooldownUntil: undefined,
        refreshTree,
      });
      return null;
    };

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(<Probe cachedTreeCommitSha="cached-head" />);
    });
    expect(refreshTree).toHaveBeenCalledTimes(1);
    expect(refreshTree).toHaveBeenLastCalledWith({
      vaultId,
      branch: "main",
      request: {
        kind: "inventory_mismatch",
        expectedHeadCommitSha: "published-head",
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(refreshTree).toHaveBeenCalledTimes(2);

    await act(async () => {
      mountedRoot.render(<Probe cachedTreeCommitSha="published-head" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(refreshTree).toHaveBeenCalledTimes(2);
  });

  it("settles after GitHub returns a current head newer than the inventory snapshot", async () => {
    const refreshTree = vi.fn(async () => ({ refreshed: true }));
    const Probe = ({ inventoryHeadCommitSha }: { inventoryHeadCommitSha: string }) => {
      useFileViewInventoryTreeSync({
        vaultId,
        branch: "main",
        cachedTreeCommitSha: "provider-newer-head",
        inventoryHeadCommitSha,
        treeRefreshCooldownUntil: undefined,
        refreshTree,
      });
      return null;
    };

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(<Probe inventoryHeadCommitSha="older-inventory-head" />);
    });
    expect(refreshTree).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(refreshTree).toHaveBeenCalledTimes(1);

    await act(async () => {
      mountedRoot.render(<Probe inventoryHeadCommitSha="provider-newer-head" />);
    });
    expect(refreshTree).toHaveBeenCalledTimes(1);

    await act(async () => {
      mountedRoot.render(<Probe inventoryHeadCommitSha="older-inventory-head" />);
    });
    expect(refreshTree).toHaveBeenCalledTimes(2);
  });

  it("does not let an older canceled refresh settle a repeated inventory head", async () => {
    let resolveFirstRefresh: () => void = () => {
      throw new Error("First refresh was not initialized.");
    };
    const firstRefresh = new Promise<{ refreshed: true }>((resolve) => {
      resolveFirstRefresh = () => resolve({ refreshed: true });
    });
    let resolveSecondRefresh: () => void = () => {
      throw new Error("Second refresh was not initialized.");
    };
    const secondRefresh = new Promise<{ refreshed: true }>((resolve) => {
      resolveSecondRefresh = () => resolve({ refreshed: true });
    });
    const refreshTree = vi
      .fn(async () => ({ refreshed: true }))
      .mockImplementationOnce(() => firstRefresh)
      .mockImplementationOnce(() => secondRefresh);
    const Probe = ({
      cachedTreeCommitSha,
      inventoryHeadCommitSha,
    }: {
      cachedTreeCommitSha: string;
      inventoryHeadCommitSha: string;
    }) => {
      useFileViewInventoryTreeSync({
        vaultId,
        branch: "main",
        cachedTreeCommitSha,
        inventoryHeadCommitSha,
        treeRefreshCooldownUntil: undefined,
        refreshTree,
      });
      return null;
    };

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <Probe cachedTreeCommitSha="provider-head" inventoryHeadCommitSha="repeated-head" />,
      );
    });
    expect(refreshTree).toHaveBeenCalledTimes(1);

    await act(async () => {
      mountedRoot.render(
        <Probe cachedTreeCommitSha="provider-head" inventoryHeadCommitSha="provider-head" />,
      );
    });
    await act(async () => {
      mountedRoot.render(
        <Probe cachedTreeCommitSha="provider-head" inventoryHeadCommitSha="repeated-head" />,
      );
    });
    expect(refreshTree).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirstRefresh();
    });
    await act(async () => {
      mountedRoot.render(
        <Probe cachedTreeCommitSha="newer-provider-head" inventoryHeadCommitSha="repeated-head" />,
      );
    });
    expect(refreshTree).toHaveBeenCalledTimes(3);

    resolveSecondRefresh();
  });

  it("waits for the persisted failure cooldown before retrying", async () => {
    const refreshTree = vi.fn(async () => ({ refreshed: true }));
    const cooldownUntil = Date.now() + 30_000;
    const Probe = () => {
      useFileViewInventoryTreeSync({
        vaultId,
        branch: "main",
        cachedTreeCommitSha: "cached-head",
        inventoryHeadCommitSha: "published-head",
        treeRefreshCooldownUntil: cooldownUntil,
        refreshTree,
      });
      return null;
    };

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(<Probe />);
    });
    expect(refreshTree).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(refreshTree).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refreshTree).toHaveBeenCalledTimes(1);
  });
});
