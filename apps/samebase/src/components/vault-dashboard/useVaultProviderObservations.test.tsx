// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { vaultExternalDataQueryKey } from "@/lib/vaultExternalDataQueryKey";
import { useVaultProviderObservations } from "./useVaultProviderObservations";

const providerActions = vi.hoisted(() => ({
  observeCloudflareWorkers: vi.fn(async () => []),
  observeCloudflareWorkerBuilds: vi.fn(async () => []),
  observeCloudflareWorkerConvexBuildAccess: vi.fn(async () => []),
  observeConvexProjects: vi.fn(async () => []),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useAction: (reference: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(reference)) {
        case "vault/providerObservations:observeCloudflareWorkers":
          return providerActions.observeCloudflareWorkers;
        case "vault/providerObservations:observeCloudflareWorkerBuilds":
          return providerActions.observeCloudflareWorkerBuilds;
        case "vault/providerObservations:observeCloudflareWorkerConvexBuildAccess":
          return providerActions.observeCloudflareWorkerConvexBuildAccess;
        case "vault/providerObservations:observeConvexProjects":
          return providerActions.observeConvexProjects;
        default:
          throw new Error(`Unexpected provider observation action: ${getFunctionName(reference)}`);
      }
    },
  };
});

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

function fakeCloudflareWorkerId(value: string): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

function fakeConvexProjectId(value: string): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

describe("useVaultProviderObservations", () => {
  beforeEach(() => {
    for (const action of Object.values(providerActions)) {
      action.mockReset();
      action.mockResolvedValue([]);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
        refreshFailed: false,
      });
      expect(latest?.cloudflare.builds).toMatchObject({
        state: "loaded",
        observations: [],
        refreshFailed: false,
      });
      expect(latest?.cloudflare.convexBuildAccess).toMatchObject({
        state: "loaded",
        observations: [],
        refreshFailed: false,
      });
      expect(latest?.convex).toMatchObject({
        state: "loaded",
        observations: [],
        refreshFailed: false,
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("keeps independent provider failures visible", async () => {
    providerActions.observeCloudflareWorkers.mockRejectedValueOnce(
      new Error("Cloudflare unavailable"),
    );
    providerActions.observeConvexProjects.mockRejectedValueOnce(new Error("Convex unavailable"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultProviderObservations> | undefined;

    function Probe() {
      latest = useVaultProviderObservations({
        _id: fakeVaultId("vault-failed"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-failed") }],
        convexProjects: [
          {
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            convexProjectId: fakeConvexProjectId("convex-failed"),
            projectId: "project-failed",
            teamId: "team-failed",
          },
        ],
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

      await vi.waitFor(() => {
        expect(latest?.cloudflare.workers.state).toBe("failed");
        expect(latest?.cloudflare.builds.state).toBe("loaded");
        expect(latest?.convex.state).toBe("failed");
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("marks retained observations stale when a background refresh fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultProviderObservations> | undefined;

    function Probe() {
      latest = useVaultProviderObservations({
        _id: fakeVaultId("vault-stale"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-stale") }],
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
      await vi.waitFor(() => {
        expect(latest?.cloudflare.workers).toMatchObject({
          state: "loaded",
          refreshFailed: false,
        });
      });

      providerActions.observeCloudflareWorkers.mockRejectedValueOnce(
        new Error("Cloudflare refresh failed"),
      );
      await act(async () => {
        if (latest?.cloudflare.workers.state !== "loaded") {
          throw new Error("Expected loaded Cloudflare observations before refresh.");
        }
        latest.cloudflare.workers.reload();
      });

      await vi.waitFor(() => {
        expect(latest?.cloudflare.workers).toMatchObject({
          state: "loaded",
          refreshFailed: true,
        });
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

  it("polls Cloudflare build status while the selected vault remains mounted", async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let mounted = true;

    function Probe() {
      useVaultProviderObservations({
        _id: fakeVaultId("vault-build-polling"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-build-polling") }],
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
        await Promise.resolve();
      });
      expect(providerActions.observeCloudflareWorkerBuilds).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60 * 1000);
      });
      expect(providerActions.observeCloudflareWorkerBuilds).toHaveBeenCalledTimes(2);

      await act(async () => {
        root.unmount();
      });
      mounted = false;
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(providerActions.observeCloudflareWorkerBuilds).toHaveBeenCalledTimes(2);
    } finally {
      if (mounted) {
        await act(async () => {
          root.unmount();
        });
      }
      queryClient.clear();
      rootElement.remove();
    }
  });
});
