import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { VaultPullRequestList } from "@/components/vault-dashboard/VaultPullRequestList";
import type {
  PullRequestResourceState,
  VaultPullRequestObservation,
} from "@/hooks/useVaultPullRequestObservations";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { Id } from "../../../convex/_generated/dataModel";

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

type SettledObservation = Extract<VaultPullRequestObservation, { page: unknown }>;
type PullRequest = SettledObservation["page"]["pullRequests"][number];
type WorkerObservation = Extract<
  PullRequestResourceState,
  { state: "current" }
>["observation"] extends infer Observation
  ? Observation extends { workers: readonly (infer Worker)[] }
    ? Worker
    : never
  : never;

function fakeWorkerId(value: string): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this rendering test
  // only needs a stable worker identity.
  return value;
}

function fakeAppId(value: string): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this rendering test
  // only needs a stable app identity.
  return value;
}

function fakeConvexProjectId(value: string): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this rendering test
  // only needs a stable project identity.
  return value;
}

function pullRequest(
  args: {
    number?: number;
    fork?: boolean;
    checks?: PullRequest["checks"];
  } = {},
): PullRequest {
  const number = args.number ?? 1243;
  const url = `https://github.com/samebase/samebase/pull/${number}`;
  const headRepositoryNodeId = args.fork ? "repository:contributor/fork" : "repository:samebase";

  return {
    nodeId: `pull-request:${number}`,
    number,
    title: "Use live provider truth",
    url,
    isDraft: false,
    isCrossRepository: args.fork === true,
    additions: 120,
    deletions: 34,
    changedFiles: 9,
    updatedAt: OBSERVED_AT - 5_000,
    baseRefName: "main",
    headRefName: "codex/live-provider-truth",
    headRepository: {
      state: "available",
      nodeId: headRepositoryNodeId,
      nameWithOwner: args.fork ? "contributor/samebase" : "samebase/samebase",
      owner: args.fork ? "contributor" : "samebase",
    },
    labels: [{ name: "product", color: "0969da" }],
    head: {
      baseRepositoryNodeId: "repository:samebase",
      pullRequestNodeId: `pull-request:${number}`,
      pullRequestNumber: number,
      pullRequestUrl: url,
      headRepositoryNodeId,
      headRefName: "codex/live-provider-truth",
      headCommitNodeId: `commit:${number}`,
      headOid: number.toString(16).padStart(40, "0"),
    },
    checks:
      args.checks ??
      ({
        ...NO_CHECKS,
        state: "success",
        totalCount: 4,
        checkRunCount: 4,
        successCount: 4,
      } satisfies PullRequest["checks"]),
  };
}

function availableWorker(args: {
  workerId: string;
  workerName: string;
  rootDirectory?: string;
  preview?: "available" | "unavailable";
}): WorkerObservation {
  return {
    state: "available",
    workerId: fakeWorkerId(args.workerId),
    appId: fakeAppId(`app:${args.workerId}`),
    rootDirectory: args.rootDirectory ?? "apps/samebase",
    workerName: args.workerName,
    buildUuid: `build:${args.workerId}`,
    buildState: "success",
    createdAt: OBSERVED_AT - 120_000,
    startedAt: OBSERVED_AT - 110_000,
    finishedAt: OBSERVED_AT - 60_000,
    convexPreview:
      args.preview === "unavailable"
        ? { state: "unavailable", reason: "fork_head" }
        : {
            state: "available",
            convexProjectId: fakeConvexProjectId("convex:samebase"),
            deploymentName: "precise-otter-1243",
            deploymentUrl: "https://precise-otter-1243.convex.cloud",
            dashboardUrl: "https://dashboard.convex.dev/t/samebase/samebase/precise-otter-1243",
          },
  };
}

function settledObservation(
  args: {
    pullRequests?: PullRequest[];
    workers?: WorkerObservation[];
    state?: "current" | "stale";
    resourceState?: "current" | "stale" | "failed";
    continuation?: SettledObservation["page"]["continuation"];
  } = {},
): SettledObservation {
  const pullRequests = args.pullRequests ?? [pullRequest()];
  const workers = args.workers ?? [];
  const continuation = args.continuation ?? { kind: "complete" as const };
  const resourcesByPullRequestNodeId = new Map(
    pullRequests.map((item) => [item.nodeId, { head: item.head, workers }]),
  );

  return {
    state: args.state ?? "current",
    page: {
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
      providerOpenPullRequestCount: pullRequests.length,
      scannedPullRequestCount: pullRequests.length,
      providerSequenceDrifted: false,
      pullRequests,
      continuation,
      requestUsage: {
        requestCount: 1,
        cost: 1,
        limit: 5_000,
        remaining: 4_999,
        resetAt: OBSERVED_AT + 60 * 60_000,
      },
    },
    refreshProblem:
      args.state === "stale" ? { state: "provider_failure", reason: "request_failed" } : null,
    refreshing: false,
    pullRequests,
    resourceState: args.resourceState ?? "current",
    resourcesByPullRequestNodeId: new Map(
      Array.from(resourcesByPullRequestNodeId, ([pullRequestNodeId, observation]) => [
        pullRequestNodeId,
        args.resourceState === "failed"
          ? { state: "failed" as const }
          : {
              state: args.resourceState ?? ("current" as const),
              observation,
            },
      ]),
    ),
    hasMore: continuation.kind !== "complete",
    scanGuardrailReached: continuation.kind === "scan_guardrail",
    isLoadingMore: false,
    canLoadMore: continuation.kind !== "complete",
    loadMoreProblem: null,
    reload: () => {},
    reloadResources: () => {},
    loadMore: () => {},
  };
}

function renderList(observation: VaultPullRequestObservation): string {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
      <VaultPullRequestList
        buildSamebaseUrl={(branchName) => `/vault/samebase/samebase/fs/${branchName}?compare`}
        now={OBSERVED_AT}
        observation={observation}
        repositoryFullName="samebase/samebase"
      />
    </TestRouterProvider>,
  );
}

describe("VaultPullRequestList", () => {
  it("renders the exact provider-proven preview and keeps Workers distinct by stable identity", () => {
    const markup = renderList(
      settledObservation({
        workers: [
          availableWorker({ workerId: "worker:app", workerName: "samebase-worker" }),
          availableWorker({ workerId: "worker:docs", workerName: "docs-worker" }),
        ],
      }),
    );

    expect(markup).toContain("PR #1243 Use live provider truth");
    expect(markup).toContain("4 passed");
    expect(markup).toContain("samebase-worker");
    expect(markup).toContain("docs-worker");
    expect(markup).toContain("precise-otter-1243");
    expect(markup).toContain(
      'href="https://dashboard.convex.dev/t/samebase/samebase/precise-otter-1243"',
    );
    expect(markup).toContain("View changes");
  });

  it("does not offer a Samebase branch route or Convex preview for a fork head", () => {
    const forkPullRequest = pullRequest({ number: 1244, fork: true });
    const markup = renderList(
      settledObservation({
        pullRequests: [forkPullRequest],
        workers: [
          availableWorker({
            workerId: "worker:fork",
            workerName: "samebase-worker",
            preview: "unavailable",
          }),
        ],
      }),
    );

    expect(markup).toContain("fork");
    expect(markup).toContain("contributor/samebase:codex/live-provider-truth");
    expect(markup).not.toContain("View changes");
    expect(markup).not.toContain("precise-otter-1243");
  });

  it("distinguishes loading, blocked, stale, empty, and bounded-page states", () => {
    expect(renderList({ state: "loading" })).toContain("Loading pull requests");
    expect(
      renderList({
        state: "problem",
        problem: {
          state: "budget_deferred",
          reason: "request_budget",
          retryAt: OBSERVED_AT + 30_000,
        },
        reload: () => {},
      }),
    ).toContain("GitHub refresh deferred");
    expect(renderList(settledObservation({ state: "stale" }))).toContain(
      "Pull requests may be out of date",
    );
    expect(renderList(settledObservation({ resourceState: "stale" }))).toContain(
      "Deploy status may be out of date",
    );
    expect(renderList(settledObservation({ resourceState: "failed" }))).toContain(
      "Deploy status unavailable",
    );
    expect(renderList(settledObservation({ pullRequests: [] }))).toContain("No open pull requests");
    const boundedMarkup = renderList(
      settledObservation({
        continuation: { kind: "scan_guardrail", cursor: "cursor:4", scannedProviderPages: 4 },
      }),
    );
    expect(boundedMarkup).toContain("GitHub scan limit reached");
    expect(boundedMarkup).toContain("Load more");
    expect(boundedMarkup).toContain('href="https://github.com/samebase/samebase/pulls"');
  });
});
