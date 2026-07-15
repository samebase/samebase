// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";

const requestRefresh = vi.fn(async () => ({ kind: "scheduled" as const }));

vi.mock("convex/react", () => ({
  useMutation: () => requestRefresh,
}));

import { useRepositoryInventoryDemand } from "./useRepositoryInventoryDemand";

const { act } = React;

// @ts-expect-error Convex ids are strings at runtime; the hook only forwards this test id.
const firstVaultId: Id<"vaults"> = "first-vault";
// @ts-expect-error Convex ids are strings at runtime; the hook only forwards this test id.
const secondVaultId: Id<"vaults"> = "second-vault";

let visibilityState: DocumentVisibilityState = "visible";

function RepositoryInventoryDemandProbe({ vaultId }: { vaultId: Id<"vaults"> | null }) {
  useRepositoryInventoryDemand(vaultId);
  return null;
}

describe("useRepositoryInventoryDemand", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
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
    requestRefresh.mockClear();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("polls only the visible vault owned by the mounted route", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    act(() => {
      mountedRoot.render(<RepositoryInventoryDemandProbe vaultId={firstVaultId} />);
    });
    expect(requestRefresh).toHaveBeenLastCalledWith({ vaultId: firstVaultId });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(requestRefresh).toHaveBeenCalledTimes(2);

    visibilityState = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(120_000);
    });
    expect(requestRefresh).toHaveBeenCalledTimes(2);

    visibilityState = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requestRefresh).toHaveBeenCalledTimes(3);
    expect(requestRefresh).toHaveBeenLastCalledWith({ vaultId: firstVaultId });

    act(() => {
      mountedRoot.render(<RepositoryInventoryDemandProbe vaultId={secondVaultId} />);
    });
    expect(requestRefresh).toHaveBeenCalledTimes(4);
    expect(requestRefresh).toHaveBeenLastCalledWith({ vaultId: secondVaultId });
  });
});
