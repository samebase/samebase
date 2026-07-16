// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  mutationCallCount: { value: 0 },
  requestInventoryRefresh: vi.fn(async (_args: { vaultId: string }) => ({
    state: "scheduled" as const,
  })),
  requestSummaryRefresh: vi.fn(async (_args: { visibleVaultIds: string[] }) => ({
    state: "scheduled" as const,
  })),
  useMutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: mocks.useMutation,
}));

import { useRepositoryObservationDemand } from "./useRepositoryObservationDemand";

const { act } = React;
let visibilityState: DocumentVisibilityState = "visible";

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; the hook only forwards these test ids.
  return value;
}

function RepositoryObservationDemandProbe({
  selectedInventoryVaultId,
  selectedSummaryVaultId,
  visibleSummaryVaultIds,
}: {
  selectedInventoryVaultId: Id<"vaults"> | null;
  selectedSummaryVaultId: Id<"vaults"> | null;
  visibleSummaryVaultIds: readonly Id<"vaults">[];
}) {
  useRepositoryObservationDemand({
    selectedInventoryVaultId,
    selectedSummaryVaultId,
    visibleSummaryVaultIds,
  });
  return null;
}

describe("useRepositoryObservationDemand", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    mocks.requestInventoryRefresh.mockClear();
    mocks.requestSummaryRefresh.mockClear();
    mocks.mutationCallCount.value = 0;
    mocks.useMutation.mockReset();
    mocks.useMutation.mockImplementation(() => {
      const mutation =
        mocks.mutationCallCount.value % 2 === 0
          ? mocks.requestInventoryRefresh
          : mocks.requestSummaryRefresh;
      mocks.mutationCallCount.value += 1;
      return mutation;
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

  it("prioritizes the selected inventory before summaries and polls only while visible", async () => {
    const selectedVaultId = vaultId("selected-vault");
    const visibleVaultIds = [
      selectedVaultId,
      ...Array.from({ length: 30 }, (_, index) => vaultId(`visible-${index}`)),
      vaultId("visible-0"),
    ];
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <RepositoryObservationDemandProbe
          selectedInventoryVaultId={selectedVaultId}
          selectedSummaryVaultId={selectedVaultId}
          visibleSummaryVaultIds={visibleVaultIds}
        />,
      );
      await Promise.resolve();
    });

    expect(mocks.requestInventoryRefresh).toHaveBeenLastCalledWith({ vaultId: selectedVaultId });
    expect(mocks.requestSummaryRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.requestInventoryRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requestSummaryRefresh.mock.invocationCallOrder[0],
    );
    const firstSummaryRequest = mocks.requestSummaryRefresh.mock.calls[0][0];
    expect(firstSummaryRequest.visibleVaultIds).toHaveLength(25);
    expect(firstSummaryRequest.visibleVaultIds[0]).toBe(selectedVaultId);
    expect(new Set(firstSummaryRequest.visibleVaultIds).size).toBe(25);

    await act(async () => {
      mountedRoot.render(
        <RepositoryObservationDemandProbe
          selectedInventoryVaultId={selectedVaultId}
          selectedSummaryVaultId={selectedVaultId}
          visibleSummaryVaultIds={[...visibleVaultIds]}
        />,
      );
      await Promise.resolve();
    });
    expect(mocks.requestSummaryRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mocks.requestSummaryRefresh).toHaveBeenCalledTimes(2);

    visibilityState = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(mocks.requestSummaryRefresh).toHaveBeenCalledTimes(2);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(mocks.requestSummaryRefresh).toHaveBeenCalledTimes(3);
    expect(mocks.requestInventoryRefresh).toHaveBeenCalledTimes(3);
  });

  it("requests the selected inventory immediately when selected detail resolves", async () => {
    const selectedVaultId = vaultId("selected-vault");
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <RepositoryObservationDemandProbe
          selectedInventoryVaultId={null}
          selectedSummaryVaultId={selectedVaultId}
          visibleSummaryVaultIds={[selectedVaultId]}
        />,
      );
      await Promise.resolve();
    });
    expect(mocks.requestInventoryRefresh).not.toHaveBeenCalled();

    await act(async () => {
      mountedRoot.render(
        <RepositoryObservationDemandProbe
          selectedInventoryVaultId={selectedVaultId}
          selectedSummaryVaultId={selectedVaultId}
          visibleSummaryVaultIds={[selectedVaultId]}
        />,
      );
      await Promise.resolve();
    });
    expect(mocks.requestInventoryRefresh).toHaveBeenCalledWith({ vaultId: selectedVaultId });
    expect(mocks.requestSummaryRefresh).toHaveBeenCalledTimes(2);
  });

  it("requests fair background summary work before any directory rows load", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <RepositoryObservationDemandProbe
          selectedInventoryVaultId={null}
          selectedSummaryVaultId={null}
          visibleSummaryVaultIds={[]}
        />,
      );
      await Promise.resolve();
    });

    expect(mocks.requestSummaryRefresh).toHaveBeenCalledWith({ visibleVaultIds: [] });
    expect(mocks.requestInventoryRefresh).not.toHaveBeenCalled();
  });
});
