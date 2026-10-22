// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { useRepositoryProviderObservations } from "./useRepositoryProviderObservations";

const providerActions = vi.hoisted(() => ({
  observeCloudflareWorkers: vi.fn(async () => []),
  observeCloudflareWorkerBuilds: vi.fn(async () => []),
  observeCloudflareWorkerConvexBuildAccess: vi.fn(async () => []),
  observeConvexProjects: vi.fn(async () => []),
  observeAlchemyState: vi.fn(async (): Promise<unknown> => ({ store: "missing" })),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useAction: (reference: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(reference)) {
        case "repository/providerObservations:observeCloudflareWorkers":
          return providerActions.observeCloudflareWorkers;
        case "repository/providerObservations:observeCloudflareWorkerBuilds":
          return providerActions.observeCloudflareWorkerBuilds;
        case "repository/providerObservations:observeCloudflareWorkerConvexBuildAccess":
          return providerActions.observeCloudflareWorkerConvexBuildAccess;
        case "repository/providerObservations:observeConvexProjects":
          return providerActions.observeConvexProjects;
        case "repository/alchemyState:observe":
          return providerActions.observeAlchemyState;
        default:
          throw new Error(`Unexpected provider observation action: ${getFunctionName(reference)}`);
      }
    },
  };
});

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

function fakeCloudflareWorkerId(value: string): Id<"repositoryCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

function fakeConvexProjectId(value: string): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable query keys.
  return value;
}

describe("useRepositoryProviderObservations", () => {
  beforeEach(() => {
    for (const action of Object.values(providerActions)) {
      action.mockReset();
      action.mockResolvedValue([]);
    }
  });

  it("settles empty provider collections without leaving disabled queries loading", async () => {
    const queryClient = new QueryClient();
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-empty"),
        cloudflareWorkers: [],
        convexProjects: [],
        providerWrite: { status: "idle", lastWriteAt: {} },
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
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-failed"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-failed") }],
        convexProjects: [
          {
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            convexProjectId: fakeConvexProjectId("convex-failed"),
            projectId: "project-failed",
            teamId: "team-failed",
          },
        ],
        providerWrite: { status: "idle", lastWriteAt: {} },
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
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-stale"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-stale") }],
        convexProjects: [],
        providerWrite: { status: "idle", lastWriteAt: {} },
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

  it("checks fresh provider data when the client did not observe the active write", async () => {
    let resolveWorkers: ((value: never[]) => void) | undefined;
    let resolveConvex: ((value: never[]) => void) | undefined;
    providerActions.observeCloudflareWorkers.mockImplementationOnce(
      () =>
        new Promise<never[]>((resolve) => {
          resolveWorkers = resolve;
        }),
    );
    providerActions.observeConvexProjects.mockImplementationOnce(
      () =>
        new Promise<never[]>((resolve) => {
          resolveConvex = resolve;
        }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-missed-active"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-missed-active") }],
        convexProjects: [
          {
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            convexProjectId: fakeConvexProjectId("convex-missed-active"),
            projectId: "project-missed-active",
            teamId: "team-missed-active",
          },
        ],
        providerWrite: {
          status: "idle",
          lastWriteAt: { cloudflare: 100, convex: 200 },
        },
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
      expect(latest?.cloudflare.workers.state).toBe("checking");
      expect(latest?.convex.state).toBe("checking");

      await act(async () => {
        resolveWorkers?.([]);
        resolveConvex?.([]);
      });

      await vi.waitFor(() => {
        expect(latest?.cloudflare.workers.state).toBe("loaded");
        expect(latest?.convex.state).toBe("loaded");
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("suppresses stale Cloudflare results while a manual Cloudflare write is active", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-active-manual-write"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-active-manual-write") }],
        convexProjects: [],
        providerWrite: {
          status: "active",
          owner: { kind: "manual_provider_write" },
          affectedProviders: ["cloudflare"],
          lastWriteAt: {},
        },
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

      expect(latest?.cloudflare.workers.state).toBe("checking");
      expect(latest?.cloudflare.builds.state).toBe("checking");
      expect(latest?.cloudflare.convexBuildAccess.state).toBe("checking");
      expect(latest?.convex.state).toBe("loaded");
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("starts one new Cloudflare read after an observation resolves during the write", async () => {
    let resolveFirstWorkers: ((value: never[]) => void) | undefined;
    let resolveSecondWorkers: ((value: never[]) => void) | undefined;
    providerActions.observeCloudflareWorkers
      .mockImplementationOnce(
        () =>
          new Promise<never[]>((resolve) => {
            resolveFirstWorkers = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<never[]>((resolve) => {
            resolveSecondWorkers = resolve;
          }),
      );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;
    const repositoryId = fakeRepositoryId("repository-resolved-during-write");
    const workerId = fakeCloudflareWorkerId("worker-resolved-during-write");
    const convexProjectId = fakeConvexProjectId("convex-unchanged");

    function Probe({ cloudflareLastWriteAt }: { cloudflareLastWriteAt?: number }) {
      latest = useRepositoryProviderObservations({
        repositoryId,
        cloudflareWorkers: [{ workerId }],
        convexProjects: [
          {
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            convexProjectId,
            projectId: "project-unchanged",
            teamId: "team-unchanged",
          },
        ],
        providerWrite: {
          status: "idle",
          lastWriteAt:
            cloudflareLastWriteAt === undefined ? {} : { cloudflare: cloudflareLastWriteAt },
        },
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
      await act(async () => {
        resolveFirstWorkers?.([]);
      });
      await vi.waitFor(() => {
        expect(latest?.cloudflare.workers.state).toBe("loaded");
      });

      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Probe cloudflareLastWriteAt={300} />
          </QueryClientProvider>,
        );
      });

      expect(latest?.cloudflare.workers.state).toBe("checking");
      expect(providerActions.observeCloudflareWorkers).toHaveBeenCalledTimes(2);
      expect(providerActions.observeConvexProjects).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSecondWorkers?.([]);
      });
      await vi.waitFor(() => {
        expect(latest?.cloudflare.workers.state).toBe("loaded");
      });
      expect(providerActions.observeCloudflareWorkers).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("reads no team store for ?attachments, even with a stack in the cache", async () => {
    providerActions.observeAlchemyState.mockResolvedValue({
      store: "found",
      liveDeployments: [],
      stacks: [
        {
          name: "samebase/base-alchemy",
          stages: [{ name: "prod", run: { state: "none" }, resources: [], output: null }],
        },
      ],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;
    const repositoryId = fakeRepositoryId("repository-attachments");

    function Probe({ source }: { source?: "attachments" }) {
      latest = useRepositoryProviderObservations(
        {
          repositoryId,
          convexTeamId: "38516",
          cloudflareWorkers: [],
          convexProjects: [
            {
              codeLocation: { kind: "config", convexConfigPath: "convex.json" },
              convexProjectId: fakeConvexProjectId("convex-attached"),
              projectId: "3245938",
              teamId: "38516",
            },
          ],
          providerWrite: { status: "idle", lastWriteAt: {} },
        },
        source,
      );
      return null;
    }

    async function render(source?: "attachments") {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Probe source={source} />
          </QueryClientProvider>,
        );
      });
    }

    try {
      await render("attachments");
      expect(providerActions.observeAlchemyState).not.toHaveBeenCalled();
      expect(providerActions.observeConvexProjects).toHaveBeenCalledWith({ repositoryId });
      expect(latest?.alchemy).toMatchObject({ state: "loaded", observations: [] });

      // Without the param the overview reads the stack, and the cache keeps it.
      await render();
      await vi.waitFor(() => {
        expect(latest?.alchemy).toMatchObject({
          state: "loaded",
          observations: [{ store: "found" }],
        });
      });

      await render("attachments");
      expect(latest?.alchemy).toMatchObject({ state: "loaded", observations: [] });
      expect(providerActions.observeAlchemyState).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      queryClient.clear();
      rootElement.remove();
    }
  });

  it("polls Cloudflare build status while the selected repository remains mounted", async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let mounted = true;

    function Probe() {
      useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-build-polling"),
        cloudflareWorkers: [{ workerId: fakeCloudflareWorkerId("worker-build-polling") }],
        convexProjects: [],
        providerWrite: { status: "idle", lastWriteAt: {} },
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
