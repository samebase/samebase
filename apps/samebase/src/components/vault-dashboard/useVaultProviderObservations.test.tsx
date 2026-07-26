// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { vaultExternalDataQueryKey } from "@/lib/vaultExternalDataQueryKey";
import { useVaultProviderObservations } from "./useVaultProviderObservations";

vi.mock("convex/react", () => ({
  useAction: () => async () => [],
}));

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

describe("useVaultProviderObservations", () => {
  it("settles empty provider collections without leaving disabled queries loading", async () => {
    const queryClient = new QueryClient();
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultProviderObservations> | undefined;

    function Probe() {
      latest = useVaultProviderObservations({
        _id: fakeVaultId("vault-empty"),
        cloudflareWorkers: [],
        convexProjects: [],
      });
      return null;
    }

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Probe />
          </QueryClientProvider>,
        );
      });

      expect(latest?.cloudflare.workers).toMatchObject({
        state: "loaded",
        observations: [],
      });
      expect(latest?.cloudflare.builds).toMatchObject({
        state: "loaded",
        observations: [],
      });
      expect(latest?.cloudflare.convexBuildAccess).toMatchObject({
        state: "loaded",
        observations: [],
      });
      expect(latest?.convex).toMatchObject({
        state: "loaded",
        observations: [],
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("invalidates only the selected vault's external data", async () => {
    const vaultId = fakeVaultId("vault-a");
    const otherVaultId = fakeVaultId("vault-b");
    const queryClient = new QueryClient();
    const selectedVaultProviderQueryKey = [
      ...vaultExternalDataQueryKey(vaultId),
      "cloudflare-workers",
    ];
    const selectedVaultPullRequestResourceQueryKey = [
      ...vaultExternalDataQueryKey(vaultId),
      "pull-request-resources",
    ];
    const otherVaultQueryKey = [...vaultExternalDataQueryKey(otherVaultId), "cloudflare-workers"];
    queryClient.setQueryData(selectedVaultProviderQueryKey, []);
    queryClient.setQueryData(selectedVaultPullRequestResourceQueryKey, []);
    queryClient.setQueryData(otherVaultQueryKey, []);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let invalidate: (() => Promise<void>) | undefined;

    function Probe() {
      invalidate = useVaultProviderObservations({
        _id: vaultId,
        cloudflareWorkers: [],
        convexProjects: [],
      }).invalidateExternalData;
      return null;
    }

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Probe />
          </QueryClientProvider>,
        );
      });
      if (!invalidate) {
        throw new Error("Expected provider observation invalidation.");
      }

      await act(async () => {
        await invalidate?.();
      });

      expect(queryClient.getQueryState(selectedVaultProviderQueryKey)?.isInvalidated).toBe(true);
      expect(
        queryClient.getQueryState(selectedVaultPullRequestResourceQueryKey)?.isInvalidated,
      ).toBe(true);
      expect(queryClient.getQueryState(otherVaultQueryKey)?.isInvalidated).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });
});
