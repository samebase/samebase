import { useState } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  VaultOverviewLoadingPage,
  VaultOverviewPage,
  VaultOverviewSidebar,
  VaultOverviewSidebarLoading,
} from "@/components/vault-dashboard/VaultOverviewPage";
import { buildVaultDashboardResourceRailState } from "@/components/vault-dashboard/vaultResourceRailState";
import { buildVaultProductionRoots } from "@/components/vault-dashboard/vaultProductionRoots";
import type { VaultWorkspaceSelected } from "@/components/vault-dashboard/vaultWorkspaceModel";
import {
  VaultOverviewVaultPickerPane,
  type VaultDashboardVault,
} from "@/components/vault-dashboard/VaultDashboard";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { getDefaultVaultPullRequestFilters } from "@/components/vault-dashboard/vaultDashboardPullRequestFilters";
import type {
  VaultDefaultBranchObservation,
  VaultPullRequest,
  VaultPullRequestsState,
} from "@/hooks/useVaultPullRequests";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import type {
  VaultCloudflareProviderObservationState,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "@/components/vault-dashboard/useVaultProviderObservations";
import type { Id } from "../../../convex/_generated/dataModel";
import { ROLE_ACCESS_GRANTS } from "../../../shared/accessModel";

export type VaultOverviewVisualMode =
  | "vault-overview-v2"
  | "vault-overview-v2-auto-pagination"
  | "vault-overview-v2-dev"
  | "vault-overview-v2-loading"
  | "vault-overview-v2-partial-loading"
  | "vault-overview-v2-provisioning-source"
  | "vault-overview-v2-provisioning-github"
  | "vault-overview-v2-provisioning-early-empty"
  | "vault-overview-v2-provisioning-complete-empty"
  | "vault-overview-v2-provisioning-stale-empty"
  | "vault-overview-v2-provisioning-commit"
  | "vault-overview-v2-provisioning-worker"
  | "vault-overview-v2-provisioning-ready"
  | "vault-overview-v2-root"
  | "vault-overview-v2-settings";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");
const LOADING_CLOUDFLARE_OBSERVATIONS = {
  workers: { state: "loading" },
  builds: { state: "loading" },
  convexBuildAccess: { state: "loading" },
} satisfies VaultCloudflareProviderObservationState;
function fakeVaultId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeCloudflareWorkerId(value: string): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeConvexProjectId(value: string): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeVaultProvisioningRunId(value: string): Id<"workflow_vaultProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

const LIST_SPACING_VAULT_ID = fakeVaultId();
const LIST_SPACING_DOMAIN_WORKER_ID = fakeCloudflareWorkerId("worker-domain-router");
const LIST_SPACING_SAMEBASE_WORKER_ID = fakeCloudflareWorkerId("worker-samebase");
const LIST_SPACING_CONVEX_PROJECT_ID = fakeConvexProjectId("convex-project-samebase");
const LIST_SPACING_VAULT = {
  _id: LIST_SPACING_VAULT_ID,
  _creationTime: FIXTURE_NOW - 900_000,
  ghRepoOwner: "samebase",
  ghRepoName: "samebase",
  repositoryFullName: "samebase/samebase",
  defaultBranch: "main",
  fileCount: 18,
  sourceSetup: { status: "ready" },
  providerSetup: { status: "ready" },
  deletion: {
    state: "not_deleting",
    deleteAction: { state: "available" },
  },
  isSamebaseManaged: true,
  hasConnectedGitHubRepository: true,
  hasConvexProvision: true,
  hasCloudflareProvision: true,
  canRemoveConvexProvision: true,
  canRemoveCloudflareProvision: true,
  cloudflareWorkers: [
    {
      workerId: LIST_SPACING_DOMAIN_WORKER_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "domain-router",
      workerTag: "domain-router-tag",
    },
    {
      workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "samebase-worker",
      workerTag: "samebase-worker-tag",
    },
  ],
  convexProjects: [
    {
      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
      codeLocation: { kind: "config", convexConfigPath: "apps/samebase/convex.json" },
      teamId: "samebase-team-id",
      projectId: "samebase",
    },
  ],
} satisfies VaultDashboardVault;

const LIST_SPACING_CLOUDFLARE_OBSERVATIONS = {
  workers: {
    state: "loaded",
    freshness: "current",
    refreshing: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: LIST_SPACING_DOMAIN_WORKER_ID,
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://domain-router.samebase.workers.dev",
        },
      },
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
        customDomains: ["samebase.com"],
        workersDev: {
          state: "enabled",
          url: "https://samebase.samebase.workers.dev",
        },
      },
    ],
  },
  builds: {
    state: "loaded",
    freshness: "current",
    refreshing: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: LIST_SPACING_DOMAIN_WORKER_ID,
        repository: {
          state: "ready",
          rootDirectory: "apps/domain-router",
          builds: { state: "not_available" },
        },
        builds: { state: "not_connected" },
        productionBuild: { state: "unavailable" },
      },
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
        repository: {
          state: "ready",
          rootDirectory: "apps/samebase",
          builds: { state: "not_available" },
        },
        builds: { state: "not_connected" },
        productionBuild: { state: "unavailable" },
      },
    ],
  },
  convexBuildAccess: {
    state: "loaded",
    freshness: "current",
    refreshing: false,
    reload: () => {},
    observations: [],
  },
} satisfies VaultCloudflareProviderObservationState;

const LIST_SPACING_CONVEX_OBSERVATIONS = {
  state: "loaded",
  freshness: "current",
  refreshing: false,
  reload: () => {},
  observations: [
    {
      observedAt: FIXTURE_NOW,
      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
      projectId: "samebase",
      codeLocation: { kind: "config", convexConfigPath: "apps/samebase/convex.json" },
      source: { kind: "config", state: "valid", blobSha: "fixture-samebase-convex-config" },
      provider: {
        state: "current",
        teamId: "samebase-team-id",
        projectName: "Samebase",
        projectSlug: "samebase",
        teamSlug: "samebase",
        productionDeployment: {
          state: "available",
          deploymentName: "calm-swan-123",
          cloudUrl: "https://calm-swan-123.convex.cloud",
          siteUrl: "https://calm-swan-123.convex.site",
        },
      },
    },
  ],
} satisfies VaultProviderObservationState<VaultConvexProjectObservation>;

const SIDEBAR_LIST_SELECTED_VAULT_ID = fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8c");
const SIDEBAR_LIST_VAULTS = [
  {
    ...LIST_SPACING_VAULT,
    _id: LIST_SPACING_VAULT_ID,
    ghRepoOwner: "samebase",
    ghRepoName: "samebase",
    repositoryFullName: "samebase/samebase",
  },
  {
    ...LIST_SPACING_VAULT,
    _id: SIDEBAR_LIST_SELECTED_VAULT_ID,
    ghRepoOwner: "samebase",
    ghRepoName: "marketing-site",
    repositoryFullName: "samebase/marketing-site",
  },
  {
    ...LIST_SPACING_VAULT,
    _id: fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8d"),
    ghRepoOwner: "noter",
    ghRepoName: "guestbook",
    repositoryFullName: "noter/guestbook",
  },
] satisfies VaultDashboardVault[];

const FIXTURE_NO_CHECKS = {
  state: "none",
  totalCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
} as const;

type FixturePullRequest = VaultPullRequest;

const FIXTURE_SUCCESSFUL_STATUS_CHECK_ROLLUP = {
  state: "SUCCESS",
  contexts: {
    totalCount: 4,
    checkRunCount: 3,
    statusContextCount: 1,
    checkRunCountsByState: [{ state: "SUCCESS", count: 3 }],
    statusContextCountsByState: [{ state: "SUCCESS", count: 1 }],
    nodes: [
      {
        kind: "check_run",
        name: "supply-chain",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/1",
        title: null,
      },
      {
        kind: "check_run",
        name: "checks (24.x)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/2",
        title: null,
      },
      {
        kind: "check_run",
        name: "Workers Builds: samebase",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl:
          "https://dash.cloudflare.com/account-1/workers/services/view/samebase/production/builds/build-1",
        title: "Workers Builds: samebase",
      },
      {
        kind: "status_context",
        context: "Cloudflare Workers",
        state: "SUCCESS",
        targetUrl: "https://dash.cloudflare.com/builds/legacy-1",
        description: "Deployment completed",
      },
    ],
  },
} satisfies NonNullable<FixturePullRequest["statusCheckRollup"]>;

const FIXTURE_DEFAULT_BRANCH_CHECKS = {
  headCommitOid: "81145b7d2a32186823452c7515b2d5ba2d79b350",
  headCommitTitle: "Keep vault provider observations explicit",
  headCommitCommittedAt: "2026-07-21T09:30:00Z",
  headCommitUrl:
    "https://github.com/samebase/samebase/commit/81145b7d2a32186823452c7515b2d5ba2d79b350",
  statusCheckRollup: FIXTURE_SUCCESSFUL_STATUS_CHECK_ROLLUP,
  checks: {
    ...FIXTURE_NO_CHECKS,
    state: "success",
    totalCount: 4,
    successCount: 4,
  },
} satisfies VaultDefaultBranchObservation;

const FIXTURE_SIDEBAR_SUMMARIES = {
  state: "loaded",
  summaries: SIDEBAR_LIST_VAULTS.map((vault, index) => ({
    vaultId: vault._id,
    openPullRequestCount: index + 1,
    checks: FIXTURE_DEFAULT_BRANCH_CHECKS.checks,
  })),
} satisfies VaultSidebarSummariesState;

function fixturePullRequest({
  index,
  labels = [],
  checks = FIXTURE_NO_CHECKS,
  statusCheckRollup = null,
  isDraft = false,
}: {
  index: number;
  labels?: FixturePullRequest["labels"];
  checks?: FixturePullRequest["checks"];
  statusCheckRollup?: FixturePullRequest["statusCheckRollup"];
  isDraft?: boolean;
}): FixturePullRequest {
  const number = 1_260 - index;
  const id = `pull-request:${number}`;
  const branchName = `codex/live-provider-truth-${String(index + 1).padStart(2, "0")}`;
  const headRefOid = (index + 1).toString(16).padStart(40, "0");

  return {
    id,
    number,
    title:
      index === 0
        ? "Show the exact preview for each pull request"
        : `Live provider update ${number}`,
    url: `https://github.com/samebase/samebase/pull/${number}`,
    isDraft,
    isCrossRepository: false,
    additions: 40 + index,
    deletions: 10 + index,
    changedFiles: 3 + index,
    updatedAt: new Date(FIXTURE_NOW - index * 60_000).toISOString(),
    baseRefName: "main",
    headRefName: branchName,
    headRefOid,
    headRepository: {
      id: "repository:samebase/samebase",
      nameWithOwner: "samebase/samebase",
      owner: { login: "samebase" },
    },
    labels,
    statusCheckRollup,
    checks,
  };
}

const LIST_SPACING_PULL_REQUESTS = [
  fixturePullRequest({
    index: 0,
    labels: [
      { name: "needs review", color: "bf8700" },
      { name: "customer", color: "1a7f37" },
    ],
    checks: {
      ...FIXTURE_NO_CHECKS,
      state: "success",
      totalCount: 4,
      successCount: 4,
    },
    statusCheckRollup: FIXTURE_SUCCESSFUL_STATUS_CHECK_ROLLUP,
  }),
  fixturePullRequest({
    index: 1,
    labels: [{ name: "research", color: "0969da" }],
    checks: {
      ...FIXTURE_NO_CHECKS,
      state: "running",
      totalCount: 3,
      successCount: 1,
      runningCount: 2,
    },
  }),
  fixturePullRequest({ index: 2, isDraft: true }),
];

type VaultOverviewProvisioningVisualMode = Extract<
  VaultOverviewVisualMode,
  | "vault-overview-v2-provisioning-source"
  | "vault-overview-v2-provisioning-github"
  | "vault-overview-v2-provisioning-early-empty"
  | "vault-overview-v2-provisioning-complete-empty"
  | "vault-overview-v2-provisioning-stale-empty"
  | "vault-overview-v2-provisioning-commit"
  | "vault-overview-v2-provisioning-worker"
  | "vault-overview-v2-provisioning-ready"
>;

// Captured from a real Samebase-managed repository. The first five states occurred
// during provisioning. Reloading the stuck empty state exposed commit, Worker, then
// Convex data in that order.
const PROVISIONING_WORKER_ID = fakeCloudflareWorkerId("worker-provisioning-fixture");
const PROVISIONING_CONVEX_PROJECT_ID = fakeConvexProjectId("convex-project-provisioning-fixture");
const PROVISIONING_RUN_ID = fakeVaultProvisioningRunId("vault-provisioning-run-fixture");
const PROVISIONING_VAULT = {
  ...LIST_SPACING_VAULT,
  ghRepoOwner: "nicu-chiciuc",
  ghRepoName: "tmp-f149-vault-loading-states",
  repositoryFullName: "nicu-chiciuc/tmp-f149-vault-loading-states",
  cloudflareWorkers: [
    {
      workerId: PROVISIONING_WORKER_ID,
      accountId: "fixture-cloudflare-account",
      workerName: "tmp-f149-vault-loading-states",
      workerTag: "tmp-f149-vault-loading-states-tag",
    },
  ],
  convexProjects: [
    {
      convexProjectId: PROVISIONING_CONVEX_PROJECT_ID,
      codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      teamId: "38516",
      projectId: "2653471",
    },
  ],
} satisfies VaultDashboardVault;

const PROVISIONING_CLOUDFLARE_OBSERVATIONS = {
  workers: {
    state: "loaded",
    freshness: "current",
    refreshing: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: PROVISIONING_WORKER_ID,
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://tmp-f149-vault-loading-states.pfp.workers.dev",
        },
      },
    ],
  },
  builds: {
    state: "loaded",
    freshness: "current",
    refreshing: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: PROVISIONING_WORKER_ID,
        repository: {
          state: "ready",
          rootDirectory: "/",
          builds: {
            state: "available",
            productionTriggerUuid: "fixture-production-trigger",
            previewTriggerUuid: "fixture-preview-trigger",
          },
        },
        builds: {
          state: "connected",
          productionTriggerUuid: "fixture-production-trigger",
          previewTriggerUuid: "fixture-preview-trigger",
        },
        productionBuild: {
          state: "available",
          uuid: "fixture-production-build",
          buildState: "success",
        },
      },
    ],
  },
  convexBuildAccess: {
    state: "loaded",
    freshness: "current",
    refreshing: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        observedAt: FIXTURE_NOW,
        workerId: PROVISIONING_WORKER_ID,
        convexBuildAccess: {
          state: "configured",
          convexProject: {
            state: "attached",
            attachedTeamId: "38516",
            convexProjectId: PROVISIONING_CONVEX_PROJECT_ID,
            projectId: "2653471",
            teamId: "38516",
            teamState: "matches",
          },
        },
      },
    ],
  },
} satisfies VaultCloudflareProviderObservationState;

const PROVISIONING_CONVEX_OBSERVATIONS = {
  state: "loaded",
  freshness: "current",
  refreshing: false,
  reload: () => {},
  observations: [
    {
      observedAt: FIXTURE_NOW,
      convexProjectId: PROVISIONING_CONVEX_PROJECT_ID,
      projectId: "2653471",
      codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      source: { kind: "config", state: "valid", blobSha: "fixture-convex-config" },
      provider: {
        state: "current",
        teamId: "38516",
        projectName: "tmp-f149-vault-loading-states",
        projectSlug: "tmp-f149-vault-loading-states",
        teamSlug: "nicu",
        productionDeployment: {
          state: "available",
          deploymentName: "dazzling-pheasant-894",
          cloudUrl: "https://dazzling-pheasant-894.convex.cloud",
          siteUrl: "https://dazzling-pheasant-894.convex.site",
        },
      },
    },
  ],
} satisfies VaultProviderObservationState<VaultConvexProjectObservation>;

const PROVISIONING_DEFAULT_BRANCH = {
  headCommitOid: "e027945fddf37a983c3b44e88dcdb7d55ebe2109",
  headCommitTitle: "chore: seed starter template",
  headCommitCommittedAt: "2026-07-25T15:40:42Z",
  headCommitUrl:
    "https://github.com/nicu-chiciuc/tmp-f149-vault-loading-states/commit/e027945fddf37a983c3b44e88dcdb7d55ebe2109",
  statusCheckRollup: null,
  checks: FIXTURE_NO_CHECKS,
} satisfies VaultDefaultBranchObservation;

const PROVISIONING_EMPTY_CLOUDFLARE_OBSERVATIONS = {
  workers: {
    state: "loaded",
    freshness: "current",
    observations: [],
    refreshing: false,
    reload: () => {},
  },
  builds: {
    state: "loaded",
    freshness: "current",
    observations: [],
    refreshing: false,
    reload: () => {},
  },
  convexBuildAccess: {
    state: "loaded",
    freshness: "current",
    observations: [],
    refreshing: false,
    reload: () => {},
  },
} satisfies VaultCloudflareProviderObservationState;

const PROVISIONING_EMPTY_CONVEX_OBSERVATIONS = {
  state: "loaded",
  freshness: "current",
  observations: [],
  refreshing: false,
  reload: () => {},
} satisfies VaultProviderObservationState<VaultConvexProjectObservation>;

function fixturePullRequests(
  pullRequests: readonly FixturePullRequest[],
  defaultBranch: VaultDefaultBranchObservation | null,
): Extract<VaultPullRequestsState, { state: "current" | "stale" }> {
  return {
    state: "current",
    defaultBranch,
    refreshing: false,
    pullRequests: [...pullRequests],
    allPullRequests: [...pullRequests],
    resourceState: "current",
    resourcesByPullRequestId: new Map(
      pullRequests.map((pullRequest) => [
        pullRequest.id,
        {
          state: "current" as const,
          resources: {
            pullRequestId: pullRequest.id,
            workers:
              pullRequest.number === 1260
                ? [
                    {
                      state: "available" as const,
                      workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
                      rootDirectory: "apps/samebase",
                      workerName: "samebase-worker",
                      cloudflareBuild: {
                        uuid: "da8f8183-6ef8-4e92-bc32-34c04f117f6f",
                        state: "success" as const,
                        logsUrl:
                          "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase-worker/production/builds/da8f8183-6ef8-4e92-bc32-34c04f117f6f",
                      },
                      cloudflareBranchPreview: {
                        state: "available" as const,
                        url: "https://codex-restore-convex-dashboard-links-samebase-worker.samebase.workers.dev",
                      },
                      convexPreview: {
                        state: "available" as const,
                        deploymentName: "precise-otter-1260",
                        dashboardUrl:
                          "https://dashboard.convex.dev/t/samebase/samebase/precise-otter-1260",
                      },
                    },
                  ]
                : pullRequest.number === 1259
                  ? [
                      {
                        state: "available" as const,
                        workerId: LIST_SPACING_DOMAIN_WORKER_ID,
                        rootDirectory: "apps/domain-router",
                        workerName: "domain-router",
                        cloudflareBuild: {
                          uuid: "running-build-1259",
                          state: "running" as const,
                          logsUrl:
                            "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/domain-router/production/builds/running-build-1259",
                        },
                        cloudflareBranchPreview: { state: "absent" as const },
                        convexPreview: { state: "unavailable" as const },
                      },
                    ]
                  : [],
          },
        },
      ]),
    ),
    hasMore: false,
    isLoadingMore: false,
    canLoadMore: false,
    loadMoreFailed: false,
    loadMore: () => {},
  };
}

const AUTO_PAGINATION_PULL_REQUESTS = [
  ...LIST_SPACING_PULL_REQUESTS.slice(0, 2),
  ...Array.from({ length: 6 }, (_, index) => fixturePullRequest({ index: index + 3 })),
];

function VaultOverviewProvisioningFixture({ mode }: { mode: VaultOverviewProvisioningVisualMode }) {
  let vault: VaultDashboardVault;
  let pullRequests: VaultPullRequestsState;
  let cloudflareObservations: VaultCloudflareProviderObservationState;
  let convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;

  switch (mode) {
    case "vault-overview-v2-provisioning-source":
      vault = {
        ...PROVISIONING_VAULT,
        defaultBranch: undefined,
        hasConnectedGitHubRepository: false,
        cloudflareWorkers: [],
        convexProjects: [],
        sourceSetup: {
          status: "running",
          runId: PROVISIONING_RUN_ID,
          step: "create_github_repo",
          updatedAt: FIXTURE_NOW,
        },
        providerSetup: { status: "not_applicable" },
      };
      pullRequests = { state: "not_requested" };
      cloudflareObservations = PROVISIONING_EMPTY_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_EMPTY_CONVEX_OBSERVATIONS;
      break;
    case "vault-overview-v2-provisioning-github":
      vault = {
        ...PROVISIONING_VAULT,
        cloudflareWorkers: [],
        convexProjects: [],
        sourceSetup: {
          status: "running",
          runId: PROVISIONING_RUN_ID,
          step: "sync_tree",
          updatedAt: FIXTURE_NOW,
        },
        providerSetup: { status: "not_applicable" },
      };
      pullRequests = { state: "loading" };
      cloudflareObservations = PROVISIONING_EMPTY_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_EMPTY_CONVEX_OBSERVATIONS;
      break;
    case "vault-overview-v2-provisioning-early-empty":
      vault = {
        ...PROVISIONING_VAULT,
        sourceSetup: { status: "ready" },
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          runId: PROVISIONING_RUN_ID,
          step: "attach_worker",
          updatedAt: FIXTURE_NOW,
        },
      };
      pullRequests = fixturePullRequests([], null);
      cloudflareObservations = LOADING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = { state: "loading" };
      break;
    case "vault-overview-v2-provisioning-complete-empty":
      vault = PROVISIONING_VAULT;
      pullRequests = fixturePullRequests([], null);
      cloudflareObservations = PROVISIONING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_CONVEX_OBSERVATIONS;
      break;
    case "vault-overview-v2-provisioning-stale-empty":
      vault = PROVISIONING_VAULT;
      pullRequests = {
        ...fixturePullRequests([], null),
        state: "stale",
      };
      cloudflareObservations = PROVISIONING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_CONVEX_OBSERVATIONS;
      break;
    case "vault-overview-v2-provisioning-commit":
      vault = PROVISIONING_VAULT;
      pullRequests = fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH);
      cloudflareObservations = LOADING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = { state: "loading" };
      break;
    case "vault-overview-v2-provisioning-worker":
      vault = PROVISIONING_VAULT;
      pullRequests = fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH);
      cloudflareObservations = PROVISIONING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = { state: "loading" };
      break;
    case "vault-overview-v2-provisioning-ready":
      vault = PROVISIONING_VAULT;
      pullRequests = fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH);
      cloudflareObservations = PROVISIONING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_CONVEX_OBSERVATIONS;
      break;
  }

  const workspace = {
    access: { state: "ready", accessKeys: ROLE_ACCESS_GRANTS.role_member },
    cloudflareConnection: {
      state: "ready",
      connection: {
        connected: true,
        accountId: "fixture-cloudflare-account",
        accountName: "Fixture Account",
      },
    },
    cloudflareObservations,
    convexObservations,
    githubRepositoryUrl: "https://github.com/nicu-chiciuc/tmp-f149-vault-loading-states",
    productionRoots: buildVaultProductionRoots({
      cloudflareObservations,
      convexObservations,
      vault,
    }),
    pullRequestFilters: getDefaultVaultPullRequestFilters(),
    pullRequests,
    vault,
  } satisfies VaultWorkspaceSelected;
  const sidebarSummaries = {
    state: "loaded",
    summaries: [
      {
        vaultId: vault._id,
        openPullRequestCount: 0,
        checks: PROVISIONING_DEFAULT_BRANCH.checks,
      },
    ],
  } satisfies VaultSidebarSummariesState;
  const resourceRailState = buildVaultDashboardResourceRailState({
    addCloudflareWorkerOnClick: () => {},
    addConvexOnClick: () => {},
    changeConvexProjectConfigPathOnClick: () => {},
    cloudflareObservations,
    convexObservations,
    configureWorkersBuildsForGitHubOnClick: () => {},
    detachCloudflareWorkerOnClick: () => {},
    detachConvexProjectOnClick: () => {},
    githubRepositoryUrl: workspace.githubRepositoryUrl,
    reconcileConvexProjectTeamOnClick: () => {},
    rotateConvexDeployKeysForWorkersBuildsOnClick: () => {},
    vault,
  });

  return (
    <TestRouterProvider initialEntries={["/vault/nicu-chiciuc/tmp-f149-vault-loading-states"]}>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId={mode}
        left={{
          header: (
            <div className="flex h-full items-center px-2 text-sm font-medium text-foreground">
              Vaults
            </div>
          ),
          content: (
            <VaultOverviewSidebar
              page="overview"
              selectedVaultId={vault._id}
              sidebarSummaries={sidebarSummaries}
              vaults={[vault]}
              workspace={workspace}
            />
          ),
        }}
        main={{
          content: (
            <VaultOverviewPage
              developerToolsVisible={false}
              isRemovingVault={false}
              page="overview"
              resourceRailState={resourceRailState}
              workspace={workspace}
              onOpenDeleteDialog={() => {}}
              onRetryInfrastructureProvisioning={() => {}}
              onRetryVaultDeletion={() => {}}
            />
          ),
        }}
        shortcutPaneSide="left"
      />
    </TestRouterProvider>
  );
}

function VaultOverviewV2Fixture({ mode }: { mode: VaultOverviewVisualMode }) {
  const [nextPullRequestPageLoaded, setNextPullRequestPageLoaded] = useState(false);
  const page = mode === "vault-overview-v2-settings" ? "settings" : "overview";

  switch (mode) {
    case "vault-overview-v2-provisioning-source":
    case "vault-overview-v2-provisioning-github":
    case "vault-overview-v2-provisioning-early-empty":
    case "vault-overview-v2-provisioning-complete-empty":
    case "vault-overview-v2-provisioning-stale-empty":
    case "vault-overview-v2-provisioning-commit":
    case "vault-overview-v2-provisioning-worker":
    case "vault-overview-v2-provisioning-ready":
      return <VaultOverviewProvisioningFixture mode={mode} />;
  }

  if (mode === "vault-overview-v2-root") {
    return (
      <TestRouterProvider initialEntries={["/vault"]}>
        <WorkspaceLayoutV2FixtureFrame
          dataTestId="vault-overview-v2-root"
          main={{
            content: (
              <VaultOverviewVaultPickerPane
                sidebarSummaries={FIXTURE_SIDEBAR_SUMMARIES}
                vaults={SIDEBAR_LIST_VAULTS}
              />
            ),
          }}
          shortcutPaneSide="left"
        />
      </TestRouterProvider>
    );
  }

  if (mode === "vault-overview-v2-loading") {
    return (
      <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
        <WorkspaceLayoutV2FixtureFrame
          dataTestId="vault-overview-v2-loading"
          left={{
            header: (
              <div className="flex h-full items-center px-2 text-sm font-medium text-foreground">
                Vaults
              </div>
            ),
            content: <VaultOverviewSidebarLoading />,
          }}
          main={{
            content: (
              <VaultOverviewLoadingPage owner="samebase" page="overview" repoName="samebase" />
            ),
          }}
          shortcutPaneSide="left"
        />
      </TestRouterProvider>
    );
  }

  const partialLoading = mode === "vault-overview-v2-partial-loading";
  const cloudflareObservations = partialLoading
    ? LOADING_CLOUDFLARE_OBSERVATIONS
    : LIST_SPACING_CLOUDFLARE_OBSERVATIONS;
  const convexObservations: VaultProviderObservationState<VaultConvexProjectObservation> =
    partialLoading ? { state: "loading" } : LIST_SPACING_CONVEX_OBSERVATIONS;
  const sourcePullRequests =
    mode === "vault-overview-v2-auto-pagination"
      ? AUTO_PAGINATION_PULL_REQUESTS.slice(0, nextPullRequestPageLoaded ? 8 : 6)
      : LIST_SPACING_PULL_REQUESTS;
  const currentPullRequests = fixturePullRequests(
    sourcePullRequests,
    FIXTURE_DEFAULT_BRANCH_CHECKS,
  );
  const pullRequests: VaultPullRequestsState =
    mode === "vault-overview-v2-auto-pagination"
      ? {
          ...currentPullRequests,
          hasMore: !nextPullRequestPageLoaded,
          canLoadMore: !nextPullRequestPageLoaded,
          loadMore: () => setNextPullRequestPageLoaded(true),
        }
      : currentPullRequests;
  const workspace = {
    access: { state: "ready", accessKeys: ROLE_ACCESS_GRANTS.role_member },
    cloudflareConnection: {
      state: "ready",
      connection: {
        connected: true,
        accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
        accountName: "Samebase",
      },
    },
    cloudflareObservations,
    convexObservations,
    githubRepositoryUrl: "https://github.com/samebase/samebase",
    productionRoots: buildVaultProductionRoots({
      cloudflareObservations,
      convexObservations,
      vault: LIST_SPACING_VAULT,
    }),
    pullRequestFilters: getDefaultVaultPullRequestFilters(),
    pullRequests,
    vault: LIST_SPACING_VAULT,
  } satisfies VaultWorkspaceSelected;
  const resourceRailState = buildVaultDashboardResourceRailState({
    addCloudflareWorkerOnClick: () => {},
    addConvexOnClick: () => {},
    changeConvexProjectConfigPathOnClick: () => {},
    cloudflareObservations,
    convexObservations,
    configureWorkersBuildsForGitHubOnClick: () => {},
    detachCloudflareWorkerOnClick: () => {},
    detachConvexProjectOnClick: () => {},
    githubRepositoryUrl: workspace.githubRepositoryUrl,
    reconcileConvexProjectTeamOnClick: () => {},
    rotateConvexDeployKeysForWorkersBuildsOnClick: () => {},
    vault: LIST_SPACING_VAULT,
  });

  return (
    <TestRouterProvider
      initialEntries={[
        page === "settings" ? "/vault/samebase/samebase/settings" : "/vault/samebase/samebase",
      ]}
    >
      <WorkspaceLayoutV2FixtureFrame
        dataTestId={mode}
        left={{
          header: (
            <div className="flex h-full items-center px-2 text-sm font-medium text-foreground">
              Vaults
            </div>
          ),
          content: (
            <VaultOverviewSidebar
              page={page}
              selectedVaultId={LIST_SPACING_VAULT_ID}
              sidebarSummaries={FIXTURE_SIDEBAR_SUMMARIES}
              vaults={SIDEBAR_LIST_VAULTS}
              workspace={workspace}
            />
          ),
        }}
        main={{
          content: (
            <VaultOverviewPage
              developerToolsVisible={mode === "vault-overview-v2-dev"}
              isRemovingVault={false}
              page={page}
              resourceRailState={resourceRailState}
              workspace={workspace}
              onOpenDeleteDialog={() => {}}
              onRetryInfrastructureProvisioning={() => {}}
              onRetryVaultDeletion={() => {}}
            />
          ),
        }}
        shortcutPaneSide="left"
      />
    </TestRouterProvider>
  );
}

export function VaultOverviewVisualFixture({ mode }: { mode: VaultOverviewVisualMode }) {
  return <VaultOverviewV2Fixture mode={mode} />;
}
