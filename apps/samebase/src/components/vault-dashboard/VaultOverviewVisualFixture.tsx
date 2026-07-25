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

export type VaultOverviewVisualMode =
  | "vault-overview-v2"
  | "vault-overview-v2-auto-pagination"
  | "vault-overview-v2-dev"
  | "vault-overview-v2-loading"
  | "vault-overview-v2-partial-loading"
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

function VaultOverviewV2Fixture({
  mode,
}: {
  mode:
    | "vault-overview-v2"
    | "vault-overview-v2-auto-pagination"
    | "vault-overview-v2-dev"
    | "vault-overview-v2-loading"
    | "vault-overview-v2-partial-loading"
    | "vault-overview-v2-root"
    | "vault-overview-v2-settings";
}) {
  const [nextPullRequestPageLoaded, setNextPullRequestPageLoaded] = useState(false);
  const page = mode === "vault-overview-v2-settings" ? "settings" : "overview";

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
    access: { state: "ready", schemaGraphEnabled: true },
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
