// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { RepositoryPullRequestPage } from "../../convex/repositoryPullRequests";
import {
  useVaultPullRequestObservations,
  type VaultPullRequestObservation,
} from "./useVaultPullRequestObservations";

const actionState = vi.hoisted(() => ({
  handlersByFunctionName: new Map<string, (args: unknown) => Promise<unknown>>(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: (action: Parameters<typeof actual.useAction>[0]) => {
      const handler = actionState.handlersByFunctionName.get(getFunctionName(action));
      if (!handler) {
        throw new Error("Missing action handler for " + getFunctionName(action) + ".");
      }
      return handler;
    },
  };
});

const OBSERVED_AT = Date.parse("2026-07-20T12:00:00Z");
const NO_CHECKS = {
  state: "none",
  totalCount: 0,
  checkRunCount: 0,
  statusContextCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
} as const;

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; the hook test only
  // needs a stable identity.
  return "vault:test";
}

function fakeWorkerId(): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; the hook test only
  // needs a stable identity.
  return "worker:test";
}

function fakeProjectId(): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; the hook test only
  // needs a stable identity.
  return "project:test";
}

function page(args: {
  number: number;
  continuation: RepositoryPullRequestPage["continuation"];
}): RepositoryPullRequestPage {
  const nodeId = "pull-request:" + args.number;
  const headOid = args.number.toString(16).padStart(40, "0");
  const headRefName = "codex/pr-" + args.number;
  const pullRequestUrl = "https://github.com/samebase/samebase/pull/" + args.number;

  return {
    state: "current",
    observedAt: OBSERVED_AT,
    freshUntil: OBSERVED_AT + 60_000,
    repositoryNodeId: "repository:samebase",
    repositoryDatabaseId: "919458151",
    repositoryFullName: "samebase/samebase",
    defaultBranch: {
      state: "ready",
      name: "main",
      headCommitNodeId: "commit:main",
      headOid: "1234567890abcdef1234567890abcdef12345678",
      checks: NO_CHECKS,
    },
    providerOpenPullRequestCount: 2,
    scannedPullRequestCount: 1,
    providerSequenceDrifted: false,
    pullRequests: [
      {
        nodeId,
        number: args.number,
        title: "Pull request " + args.number,
        url: pullRequestUrl,
        isDraft: false,
        isCrossRepository: false,
        additions: 1,
        deletions: 0,
        changedFiles: 1,
        updatedAt: OBSERVED_AT,
        baseRefName: "main",
        headRefName,
        headRepository: {
          state: "available",
          nodeId: "repository:samebase",
          nameWithOwner: "samebase/samebase",
          owner: "samebase",
        },
        labels: [],
        head: {
          baseRepositoryNodeId: "repository:samebase",
          pullRequestNodeId: nodeId,
          pullRequestNumber: args.number,
          pullRequestUrl,
          headRepositoryNodeId: "repository:samebase",
          headRefName,
          headCommitNodeId: "commit:" + args.number,
          headOid,
        },
        checks: NO_CHECKS,
      },
    ],
    continuation: args.continuation,
    requestUsage: {
      requestCount: 1,
      cost: 1,
      limit: 5_000,
      remaining: 4_999,
      resetAt: OBSERVED_AT + 60 * 60_000,
    },
  };
}

let rootElement: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient;
let latestObservation: VaultPullRequestObservation | null = null;

function ObservationHarness() {
  latestObservation = useVaultPullRequestObservations({
    vault: {
      _id: fakeVaultId(),
      cloudflareWorkers: [{ workerId: fakeWorkerId() }],
      convexProjects: [{ convexProjectId: fakeProjectId() }],
    },
    filters: {
      hiddenLabels: [],
      includeDrafts: false,
      includeNoLabel: true,
    },
    now: OBSERVED_AT,
  });
  return null;
}

function readObservation(): VaultPullRequestObservation {
  if (!latestObservation) {
    throw new Error("Observation has not rendered.");
  }
  return latestObservation;
}

function readSettledObservation() {
  const observation = readObservation();
  if (observation.state !== "current" && observation.state !== "stale") {
    throw new Error("Observation is not settled: " + observation.state + ".");
  }
  return observation;
}

async function waitForObservation(
  predicate: (observation: VaultPullRequestObservation) => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (latestObservation && predicate(latestObservation)) {
      return;
    }
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    });
  }
  throw new Error("Timed out waiting for observation state.");
}

beforeEach(() => {
  actionState.handlersByFunctionName.clear();
  latestObservation = null;
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  queryClient.clear();
  rootElement?.remove();
  root = null;
  rootElement = null;
});

async function renderHarness(): Promise<void> {
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <ObservationHarness />
      </QueryClientProvider>,
    );
  });
}

function installResourceHandler() {
  const handler = vi.fn(async (value: unknown) => {
    if (!value || typeof value !== "object" || !("heads" in value) || !Array.isArray(value.heads)) {
      throw new Error("Resource observation heads are required.");
    }
    return {
      state: "current",
      observedAt: OBSERVED_AT,
      observations: value.heads.map((head) => ({ head, workers: [] })),
    };
  });
  actionState.handlersByFunctionName.set(
    getFunctionName(api.vault.pullRequestResourceObservations.observeVisiblePullRequestResources),
    handler,
  );
  return handler;
}

describe("useVaultPullRequestObservations", () => {
  it("loads continuation pages only after explicit demand", async () => {
    const firstPage = page({
      number: 1260,
      continuation: { kind: "next_page", cursor: "cursor:2" },
    });
    const secondPage = page({
      number: 1259,
      continuation: { kind: "complete" },
    });
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("cursor" in value)) {
        throw new Error("Pull request cursor is required.");
      }
      return value.cursor === null ? firstPage : secondPage;
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    const resourceHandler = installResourceHandler();

    await renderHarness();
    await waitForObservation(
      (observation) =>
        (observation.state === "current" || observation.state === "stale") &&
        observation.pullRequests.length === 1,
    );

    expect(listHandler).toHaveBeenCalledTimes(1);
    expect(resourceHandler).toHaveBeenCalledTimes(1);
    expect(readSettledObservation().hasMore).toBe(true);

    act(() => {
      readSettledObservation().loadMore();
    });
    await waitForObservation(
      (observation) =>
        (observation.state === "current" || observation.state === "stale") &&
        observation.pullRequests.length === 2,
    );

    expect(listHandler).toHaveBeenCalledTimes(2);
    expect(listHandler.mock.calls[1]?.[0]).toMatchObject({ cursor: "cursor:2" });
    expect(resourceHandler).toHaveBeenCalledTimes(2);
    expect(readSettledObservation().hasMore).toBe(false);
  });

  it("keeps cached resource evidence but labels it stale after a failed refresh", async () => {
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      vi.fn(async () =>
        page({
          number: 1260,
          continuation: { kind: "complete" },
        }),
      ),
    );
    const resourceHandler = installResourceHandler();

    await renderHarness();
    await waitForObservation(
      (observation) =>
        (observation.state === "current" || observation.state === "stale") &&
        observation.resourceState === "current",
    );

    resourceHandler.mockRejectedValueOnce(new Error("provider failed"));
    act(() => {
      readSettledObservation().reloadResources();
    });
    await waitForObservation(
      (observation) =>
        (observation.state === "current" || observation.state === "stale") &&
        observation.resourceState === "stale",
    );

    const resource = readSettledObservation().resourcesByPullRequestNodeId.get("pull-request:1260");
    expect(resource?.state).toBe("stale");
    expect(resource && "observation" in resource ? resource.observation.workers : null).toEqual([]);
  });
});
