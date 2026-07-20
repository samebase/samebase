import { useCallback, useState, type ReactNode } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  VaultConvexSchemaGraphContent,
  VaultConvexSchemaGraphRouteWorkspaceContent,
  type VaultConvexSchemaGraphRouteContext,
  type VaultConvexSchemaGraphState,
} from "@/components/vault-dashboard/VaultConvexSchemaGraph";
import { VaultProvisioningLogViewer } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import {
  VaultDashboardView,
  VaultDashboardAppRootDialog,
  VaultDashboardCloudflareDialog,
  VaultDashboardConvexDialog,
  VaultDashboardDeleteControl,
  VaultDashboardDeleteDialog,
  VaultDashboardVaultList,
  VaultDashboardVaultPickerPane,
  type VaultDeleteDialogTarget,
  type VaultDashboardVault,
  VaultProviderSetupSection,
  VaultSetupProgressSection,
} from "@/components/vault-dashboard/VaultDashboard";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import {
  filterVaultPullRequests,
  getDefaultVaultPullRequestFilters,
  type VaultPullRequestFilters,
} from "@/components/vault-dashboard/vaultDashboardPullRequestFilters";
import type { VaultPullRequestObservation } from "@/hooks/useVaultPullRequestObservations";
import { validateRootRouteSearch } from "@/routeSearch/root";
import type { VaultCloudflareProviderObservationState } from "@/components/vault-dashboard/useVaultProviderObservations";
import type { Id } from "../../../convex/_generated/dataModel";

export type VaultDashboardVisualMode =
  | "vault-dashboard-dev-tools-hidden"
  | "vault-dashboard-dev-tools-visible"
  | "vault-dashboard-add-first-app-root-open"
  | "vault-dashboard-add-app-root-open"
  | "vault-dashboard-connect-cloudflare-open"
  | "vault-dashboard-connect-cloudflare-mobile-shell-open"
  | "vault-dashboard-connect-convex-open"
  | "vault-dashboard-delete-open"
  | "vault-dashboard-infra-setup"
  | "vault-dashboard-cloudflare-github-app-auth-failure"
  | "vault-dashboard-cloudflare-build-trigger-missing"
  | "vault-dashboard-provisioning-log"
  | "vault-dashboard-sticky-header"
  | "vault-dashboard-root-picker"
  | "vault-dashboard-sidebar-list"
  | "vault-dashboard-list-spacing"
  | "vault-convex-schema-graph"
  | "vault-convex-schema-route-mobile"
  | "vault-pull-request-filters";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");
const LOADING_CLOUDFLARE_OBSERVATIONS = {
  workers: { state: "loading" },
  builds: { state: "loading" },
  convexBuildAccess: { state: "loading" },
} satisfies VaultCloudflareProviderObservationState;
const FIXTURE_ROOT_ROUTE_SEARCH = validateRootRouteSearch({});

function fakeVaultId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeVaultAppId(value: string): Id<"vaultApps"> {
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

function fakeProvisioningRunId(): Id<"workflow_vaultProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeConvexDeploymentId(): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "nd7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeConvexSchemaSnapshotId(): Id<"observations_vaultConvexSchema_snapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "mx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fixtureAvailableCloudflareWorker(workerName: string, workerTag: string) {
  return {
    workerName,
    workerTag,
    discovery: {
      classification: "available" as const,
      evidence: { state: "none" as const },
    },
  };
}

const FIXTURE_CLOUDFLARE_WORKERS = [
  {
    workerName: "app-start-workers",
    workerTag: "72dc5c8bc9104b20af13ac36dcdbe9d1",
    discovery: {
      classification: "recommended" as const,
      evidence: {
        state: "matching_repo" as const,
        repoId: "919458151",
        repoName: "samebase/atelier",
        triggerName: "Production Deploy",
        rootDirectory: "apps/atelier",
      },
    },
  },
  {
    workerName: "app-admin",
    workerTag: "29c1d1a06f944e81a78f6241dd5ef5d3",
    discovery: {
      classification: "blocked" as const,
      evidence: {
        state: "same_repo_different_root" as const,
        repoId: "919458151",
        repoName: "samebase/atelier",
        triggerName: "Production Deploy",
        rootDirectory: "apps/admin",
        expectedRootDirectory: "apps/atelier",
      },
    },
  },
  fixtureAvailableCloudflareWorker("app-workers", "c2f8194c2c7047a6991a736d8f708aaf"),
  fixtureAvailableCloudflareWorker(
    "nicu-chiciuc-samebase-86xc0t",
    "70d0ab9620b44d7b99a9964cde102887",
  ),
  fixtureAvailableCloudflareWorker("samebase-worker", "f832053cb31b46f0bff56f70b8c9b57e"),
  fixtureAvailableCloudflareWorker("tmp-flow-123", "f19375e848d44311ae35716d8ab0c59f"),
  fixtureAvailableCloudflareWorker("tmp-flow-1234", "62b44171ee3f41de80bfaf42a90cf8d7"),
  fixtureAvailableCloudflareWorker("tmp-my-asdf-app", "476a67f8258f4fa3bdd3e73cf825c3a5"),
  fixtureAvailableCloudflareWorker("tmp-my-first", "2f44c6d9c45e451ea825f52774a7f583"),
  fixtureAvailableCloudflareWorker("tmp-something", "9c0c2d7cfdce4d4480f6e043b2e9f11d"),
  fixtureAvailableCloudflareWorker("tsx-tsx-md", "abcb6778514d4e58b6f9a747d92f9234"),
];

function FixtureRepositoryLinks() {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <a href="https://github.com/samebase/samebase">GitHub</a>
      <a href="https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase/production/settings">
        Cloudflare
      </a>
      <a href="https://dashboard.convex.dev/t/nicu/samebase/settings">Project settings</a>
    </div>
  );
}

function FixtureDeleteControl() {
  return (
    <VaultDashboardDeleteControl
      repositoryFullName="samebase/samebase"
      deleteAction={{ state: "available" }}
    />
  );
}

const fixtureDeleteDialogTarget = {
  repositoryFullName: "samebase/samebase",
  isSamebaseManaged: true,
  canRemoveGithubRepo: true,
  hasConvexProvision: true,
  hasCloudflareProvision: true,
  canRemoveConvexProvision: true,
  canRemoveCloudflareProvision: true,
} satisfies VaultDeleteDialogTarget;

const LIST_SPACING_VAULT_ID = fakeVaultId();
const LIST_SPACING_DOMAIN_APP_ID = fakeVaultAppId("app-domain-router");
const LIST_SPACING_SAMEBASE_APP_ID = fakeVaultAppId("app-samebase");
const LIST_SPACING_DOMAIN_WORKER_ID = fakeCloudflareWorkerId("worker-domain-router");
const LIST_SPACING_SAMEBASE_WORKER_ID = fakeCloudflareWorkerId("worker-samebase");
const LIST_SPACING_CONVEX_PROJECT_ID = fakeConvexProjectId("convex-project-samebase");
const LIST_SPACING_VAULT = {
  _id: LIST_SPACING_VAULT_ID,
  _creationTime: FIXTURE_NOW - 900_000,
  ghRepoOwner: "samebase",
  ghRepoName: "samebase",
  repositoryFullName: "samebase/samebase",
  commitSHA: "1234567890abcdef1234567890abcdef12345678",
  fileCount: 18,
  lastTreeRefreshAt: FIXTURE_NOW - 12_000,
  state: "ready",
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
  apps: [
    { appId: LIST_SPACING_DOMAIN_APP_ID, rootDirectory: "apps/domain-router" },
    { appId: LIST_SPACING_SAMEBASE_APP_ID, rootDirectory: "apps/samebase" },
  ],
  cloudflareWorkers: [
    {
      workerId: LIST_SPACING_DOMAIN_WORKER_ID,
      appId: LIST_SPACING_DOMAIN_APP_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "domain-router",
      workerTag: "domain-router-tag",
    },
    {
      workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
      appId: LIST_SPACING_SAMEBASE_APP_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "samebase-worker",
      workerTag: "samebase-worker-tag",
    },
  ],
  convexProjects: [
    {
      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
      appId: LIST_SPACING_SAMEBASE_APP_ID,
      teamId: "samebase-team-id",
      projectId: "samebase",
    },
  ],
} satisfies VaultDashboardVault;

const CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID = fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8e");
const CLOUDFLARE_BUILD_ACCESS_MISSING_WORKER_ID = fakeCloudflareWorkerId(
  "jh76f8cc9pq3m7r1s8v5x2z4n6k0b3d9",
);
const CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT = {
  ...LIST_SPACING_VAULT,
  _id: CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID,
  _creationTime: FIXTURE_NOW - 3_600_000,
  ghRepoOwner: "nicu-chiciuc",
  ghRepoName: "tmp-my-super-app-2",
  repositoryFullName: "nicu-chiciuc/tmp-my-super-app-2",
  commitSHA: "abcdef1234567890abcdef1234567890abcdef12",
  fileCount: 9,
  lastTreeRefreshAt: FIXTURE_NOW - 3_480_000,
  sourceSetup: { status: "ready" },
  providerSetup: { status: "not_applicable" },
  apps: [{ appId: LIST_SPACING_DOMAIN_APP_ID, rootDirectory: "/" }],
  cloudflareWorkers: [
    {
      workerId: LIST_SPACING_DOMAIN_WORKER_ID,
      appId: LIST_SPACING_DOMAIN_APP_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "tmp-my-super-app-234",
      workerTag: "tmp-my-super-app-234-tag",
    },
    {
      workerId: CLOUDFLARE_BUILD_ACCESS_MISSING_WORKER_ID,
      appId: LIST_SPACING_DOMAIN_APP_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "tmp-my-super-app-admin",
      workerTag: "tmp-my-super-app-admin-tag",
    },
  ],
  convexProjects: [
    {
      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
      appId: LIST_SPACING_DOMAIN_APP_ID,
      teamId: "nicu-team-id",
      projectId: "tmp-my-super-app-2",
    },
  ],
} satisfies VaultDashboardVault;

const SIDEBAR_LIST_SELECTED_VAULT_ID = fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8c");
const SIDEBAR_LIST_VAULTS = [
  {
    ...LIST_SPACING_VAULT,
    _id: fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8b"),
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
  checkRunCount: 0,
  statusContextCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
} as const;

type FixturePullRequest = Extract<
  VaultPullRequestObservation,
  { page: unknown }
>["page"]["pullRequests"][number];

function fixturePullRequest({
  index,
  labels = [],
  checks = FIXTURE_NO_CHECKS,
  isDraft = false,
}: {
  index: number;
  labels?: FixturePullRequest["labels"];
  checks?: FixturePullRequest["checks"];
  isDraft?: boolean;
}): FixturePullRequest {
  const number = 1_260 - index;
  const nodeId = `pull-request:${number}`;
  const branchName = `codex/live-provider-truth-${String(index + 1).padStart(2, "0")}`;
  const headOid = (index + 1).toString(16).padStart(40, "0");
  const url = `https://github.com/samebase/samebase/pull/${number}`;

  return {
    nodeId,
    number,
    title:
      index === 0
        ? "Show the exact preview for each pull request"
        : `Live provider update ${number}`,
    url,
    isDraft,
    isCrossRepository: false,
    additions: 40 + index,
    deletions: 10 + index,
    changedFiles: 3 + index,
    updatedAt: FIXTURE_NOW - index * 60_000,
    baseRefName: "main",
    headRefName: branchName,
    headRepository: {
      state: "available",
      nodeId: "repository:samebase/samebase",
      nameWithOwner: "samebase/samebase",
      owner: "samebase",
    },
    labels,
    head: {
      baseRepositoryNodeId: "repository:samebase/samebase",
      pullRequestNodeId: nodeId,
      pullRequestNumber: number,
      pullRequestUrl: url,
      headRepositoryNodeId: "repository:samebase/samebase",
      headRefName: branchName,
      headCommitNodeId: `commit:${headOid}`,
      headOid,
    },
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
      checkRunCount: 4,
      successCount: 4,
    },
  }),
  fixturePullRequest({
    index: 1,
    labels: [{ name: "research", color: "0969da" }],
    checks: {
      ...FIXTURE_NO_CHECKS,
      state: "running",
      totalCount: 3,
      checkRunCount: 3,
      successCount: 1,
      runningCount: 2,
    },
  }),
  fixturePullRequest({ index: 2, isDraft: true }),
];

function fixturePullRequestObservation(
  pullRequests: readonly FixturePullRequest[],
): VaultPullRequestObservation {
  const observedAt = FIXTURE_NOW - 12_000;
  const filteredPullRequests = [...pullRequests];
  const byPullRequestNodeId = new Map(
    filteredPullRequests.map((pullRequest) => [
      pullRequest.nodeId,
      {
        head: pullRequest.head,
        workers:
          pullRequest.number === 1260
            ? [
                {
                  state: "available" as const,
                  workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
                  appId: LIST_SPACING_SAMEBASE_APP_ID,
                  rootDirectory: "apps/samebase",
                  workerName: "samebase-worker",
                  buildUuid: "build-preview-1260",
                  buildState: "success" as const,
                  createdAt: FIXTURE_NOW - 180_000,
                  startedAt: FIXTURE_NOW - 170_000,
                  finishedAt: FIXTURE_NOW - 120_000,
                  convexPreview: {
                    state: "available" as const,
                    convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
                    deploymentName: "precise-otter-1260",
                    deploymentUrl: "https://precise-otter-1260.convex.cloud",
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
                    appId: LIST_SPACING_DOMAIN_APP_ID,
                    rootDirectory: "apps/domain-router",
                    workerName: "domain-router",
                    buildUuid: "build-preview-1259",
                    buildState: "running" as const,
                    createdAt: FIXTURE_NOW - 30_000,
                    startedAt: FIXTURE_NOW - 20_000,
                    finishedAt: null,
                    convexPreview: {
                      state: "unavailable" as const,
                      reason: "build_not_successful" as const,
                    },
                  },
                ]
              : [],
      },
    ]),
  );

  return {
    state: "current",
    page: {
      state: "current",
      observedAt,
      freshUntil: observedAt + 60_000,
      repositoryNodeId: "repository:samebase/samebase",
      repositoryDatabaseId: "919458151",
      repositoryFullName: "samebase/samebase",
      defaultBranch: {
        state: "ready",
        name: "main",
        headCommitNodeId: "commit:main",
        headOid: "1234567890abcdef1234567890abcdef12345678",
        checks: FIXTURE_NO_CHECKS,
      },
      providerOpenPullRequestCount: filteredPullRequests.length,
      scannedPullRequestCount: filteredPullRequests.length,
      providerSequenceDrifted: false,
      pullRequests: filteredPullRequests,
      continuation: { kind: "complete" },
      requestUsage: {
        requestCount: 1,
        cost: 1,
        limit: 5_000,
        remaining: 4_999,
        resetAt: FIXTURE_NOW + 60 * 60_000,
      },
    },
    refreshProblem: null,
    refreshing: false,
    pullRequests: filteredPullRequests,
    resourceState: "current",
    resourcesByPullRequestNodeId: new Map(
      Array.from(byPullRequestNodeId, ([pullRequestNodeId, observation]) => [
        pullRequestNodeId,
        { state: "current" as const, observation },
      ]),
    ),
    hasMore: false,
    scanGuardrailReached: false,
    isLoadingMore: false,
    canLoadMore: false,
    loadMoreProblem: null,
    reload: () => {},
    reloadResources: () => {},
    loadMore: () => {},
  };
}

const STICKY_HEADER_PULL_REQUESTS = [
  ...LIST_SPACING_PULL_REQUESTS.slice(0, 2),
  ...Array.from({ length: 23 }, (_, index) => fixturePullRequest({ index: index + 3 })),
];

function VaultDashboardListSpacingFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  const [vaultPullRequestFilters, setVaultPullRequestFilters] = useState(() =>
    mode === "vault-pull-request-filters"
      ? {
          hiddenLabels: ["research"],
          includeDrafts: false,
          includeNoLabel: false,
        }
      : getDefaultVaultPullRequestFilters(),
  );
  const [resourceLinksOpen, setResourceLinksOpen] = useState(false);
  const sourcePullRequests =
    mode === "vault-dashboard-sticky-header"
      ? STICKY_HEADER_PULL_REQUESTS
      : LIST_SPACING_PULL_REQUESTS;
  const filteredPullRequests = filterVaultPullRequests(sourcePullRequests, vaultPullRequestFilters);
  const persistedVaultPullRequestFiltersByVaultId = new Map<string, VaultPullRequestFilters>([
    [LIST_SPACING_VAULT_ID, vaultPullRequestFilters],
  ]);
  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>([
    [LIST_SPACING_VAULT_ID, resourceLinksOpen],
  ]);
  const dashboardView = (
    <VaultDashboardView
      deleteModeActive={false}
      developerToolsVisible={false}
      cloudflareObservations={LOADING_CLOUDFLARE_OBSERVATIONS}
      cloudflareWorkerConfigurationActionInFlight={null}
      convexObservations={{ state: "loading" }}
      isRemovingVault={false}
      providerAttachmentRemovalInFlight={null}
      pullRequestObservation={fixturePullRequestObservation(filteredPullRequests)}
      retryingDeletionRunId={null}
      retryingInfrastructureVaultId={null}
      now={FIXTURE_NOW}
      viewModel={{
        vaults: [LIST_SPACING_VAULT],
      }}
      logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
      replaceLogoRouteSearch={() => {}}
      openDeveloperToolsByVaultId={{}}
      persistedVaultPullRequestFiltersByVaultId={persistedVaultPullRequestFiltersByVaultId}
      persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
      rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
      onConfigureWorkersBuildsForGitHub={() => {}}
      onRotateConvexDeployKeysForWorkersBuilds={() => {}}
      onOpenDeveloperToolsChange={() => {}}
      onRemoveMissingCloudflareWorker={() => {}}
      onRemoveMissingConvexProject={() => {}}
      onRetryInfrastructureProvisioning={() => {}}
      onRetryVaultDeletion={() => {}}
      onSaveVaultPullRequestFilters={(vaultId, nextVaultPullRequestFilters) => {
        if (vaultId === LIST_SPACING_VAULT_ID) {
          setVaultPullRequestFilters(nextVaultPullRequestFilters);
        }
      }}
      onResourceLinksOpenChange={(vaultId, nextOpen) => {
        if (vaultId === LIST_SPACING_VAULT_ID) {
          setResourceLinksOpen(nextOpen);
        }
      }}
    />
  );

  if (mode === "vault-dashboard-sticky-header") {
    return (
      <div
        data-testid="vault-dashboard-visual-fixture"
        data-mode={mode}
        className="h-dvh w-full bg-background text-foreground"
      >
        <FixtureDashboardShell mainContent={<div className="py-8">{dashboardView}</div>} />
      </div>
    );
  }

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
        {dashboardView}
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardCloudflareBuildTriggerMissingFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-cloudflare-build-trigger-missing"
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider initialEntries={["/vault/nicu-chiciuc/tmp-my-super-app-2"]}>
        <VaultDashboardView
          deleteModeActive={false}
          developerToolsVisible={false}
          cloudflareObservations={{
            workers: {
              state: "loaded",
              reload: () => {},
              observations: [
                {
                  state: "available",
                  observedAt: FIXTURE_NOW,
                  workerId: LIST_SPACING_DOMAIN_WORKER_ID,
                  workersDev: {
                    state: "enabled",
                    url: "https://tmp-my-super-app-234.pfp.workers.dev",
                  },
                },
                {
                  state: "available",
                  observedAt: FIXTURE_NOW,
                  workerId: CLOUDFLARE_BUILD_ACCESS_MISSING_WORKER_ID,
                  workersDev: {
                    state: "enabled",
                    url: "https://tmp-my-super-app-admin.pfp.workers.dev",
                  },
                },
              ],
            },
            builds: {
              state: "loaded",
              reload: () => {},
              observations: [
                {
                  state: "available",
                  observedAt: FIXTURE_NOW,
                  workerId: LIST_SPACING_DOMAIN_WORKER_ID,
                  repository: {
                    classification: "available",
                    evidence: { state: "none" },
                  },
                  builds: { state: "not_connected" },
                },
                {
                  state: "available",
                  observedAt: FIXTURE_NOW,
                  workerId: CLOUDFLARE_BUILD_ACCESS_MISSING_WORKER_ID,
                  repository: {
                    classification: "recommended",
                    evidence: {
                      state: "matching_repo",
                      repoId: "123",
                      repoName: "nicu-chiciuc/tmp-my-super-app-2",
                      triggerName: "Production Deploy",
                      rootDirectory: "/",
                    },
                  },
                  builds: {
                    state: "connected",
                    productionTriggerUuid: "production-trigger",
                    previewTriggerUuid: "preview-trigger",
                  },
                },
              ],
            },
            convexBuildAccess: {
              state: "loaded",
              reload: () => {},
              observations: [
                {
                  state: "available",
                  observedAt: FIXTURE_NOW,
                  workerId: CLOUDFLARE_BUILD_ACCESS_MISSING_WORKER_ID,
                  convexBuildAccess: { state: "not_configured" },
                },
              ],
            },
          }}
          cloudflareWorkerConfigurationActionInFlight={null}
          convexObservations={{ state: "loading" }}
          isRemovingVault={false}
          providerAttachmentRemovalInFlight={null}
          pullRequestObservation={fixturePullRequestObservation([])}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={FIXTURE_NOW}
          viewModel={{
            vaults: [CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT],
          }}
          logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultPullRequestFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={
            new Map([[CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID, true]])
          }
          rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          onConfigureWorkersBuildsForGitHub={() => {}}
          onRotateConvexDeployKeysForWorkersBuilds={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onRemoveMissingCloudflareWorker={() => {}}
          onRemoveMissingConvexProject={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultPullRequestFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
        />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardSidebarListFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  const selectedVaults = SIDEBAR_LIST_VAULTS.filter(
    (vault) => vault._id === SIDEBAR_LIST_SELECTED_VAULT_ID,
  );

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="h-dvh w-full bg-background text-foreground"
    >
      <FixtureDashboardShell
        leftContent={
          <VaultDashboardVaultList
            selectedVaultId={SIDEBAR_LIST_SELECTED_VAULT_ID}
            vaults={SIDEBAR_LIST_VAULTS}
          />
        }
        mainContent={
          <VaultDashboardView
            deleteModeActive={false}
            developerToolsVisible={false}
            cloudflareObservations={LOADING_CLOUDFLARE_OBSERVATIONS}
            cloudflareWorkerConfigurationActionInFlight={null}
            convexObservations={{ state: "loading" }}
            isRemovingVault={false}
            providerAttachmentRemovalInFlight={null}
            pullRequestObservation={fixturePullRequestObservation(LIST_SPACING_PULL_REQUESTS)}
            retryingDeletionRunId={null}
            retryingInfrastructureVaultId={null}
            now={FIXTURE_NOW}
            viewModel={{
              vaults: selectedVaults,
            }}
            logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
            replaceLogoRouteSearch={() => {}}
            openDeveloperToolsByVaultId={{}}
            persistedVaultPullRequestFiltersByVaultId={new Map()}
            persistedVaultResourceLinksOpenByVaultId={new Map()}
            rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
            onConfigureWorkersBuildsForGitHub={() => {}}
            onRotateConvexDeployKeysForWorkersBuilds={() => {}}
            onOpenDeveloperToolsChange={() => {}}
            onRemoveMissingCloudflareWorker={() => {}}
            onRemoveMissingConvexProject={() => {}}
            onRetryInfrastructureProvisioning={() => {}}
            onRetryVaultDeletion={() => {}}
            onSaveVaultPullRequestFilters={() => {}}
            onResourceLinksOpenChange={() => {}}
          />
        }
      />
    </div>
  );
}

function VaultDashboardRootPickerFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="h-dvh w-full bg-background text-foreground"
    >
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultDashboardVaultPickerPane vaults={SIDEBAR_LIST_VAULTS} />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardDeveloperToolsFixture({ visible }: { visible: boolean }) {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={visible ? "vault-dashboard-dev-tools-visible" : "vault-dashboard-dev-tools-hidden"}
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <div data-testid="vault-dashboard-dev-tools-card">
            <VaultDashboardRepositoryCard
              isReady={true}
              repositoryName="samebase"
              repositoryLinks={<FixtureRepositoryLinks />}
              repositoryLinksOpen={false}
              onRepositoryLinksOpenChange={() => {}}
              topRightAction={<FixtureDeleteControl />}
              primarySection={
                <div className="space-y-1.5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Pull requests
                  </p>
                  <div className="-mx-4 border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    None open
                  </div>
                </div>
              }
              developerToolsSection={{
                visible,
                open: false,
                onOpenChange: () => {},
                content: <div className="text-xs text-muted-foreground">Codespace ready</div>,
              }}
            />
          </div>
        </VaultDashboardRepositoryList>
      </TestRouterProvider>
    </div>
  );
}

function buildFixtureConvexSchemaGraphState(): VaultConvexSchemaGraphState {
  const convexProjectId = fakeConvexDeploymentId();
  return {
    projects: [
      {
        convexProjectId,
        appId: fakeVaultAppId("schema-app"),
        rootDirectory: "/",
        projectId: "samebase-project",
      },
    ],
    selectedConvexProjectId: convexProjectId,
    snapshot: {
      _id: fakeConvexSchemaSnapshotId(),
      fetchedAt: Date.parse("2026-06-29T09:00:00Z"),
      schemaHash: "f7c9a120",
      graph: {
        tables: [
          {
            name: "users",
            source: "mixed",
            documentCount: 124,
            indexes: [{ name: "email", fields: ["email"] }],
            fields: [
              {
                path: "email",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "name",
                kind: "string",
                optional: true,
                source: "declared",
              },
              {
                path: "isApproved",
                kind: "boolean",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "providerConnections",
            source: "declared",
            documentCount: 42,
            indexes: [{ name: "by_user_kind", fields: ["userId", "kind"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "kind",
                kind: "union",
                optional: false,
                source: "declared",
              },
              {
                path: "auth.method",
                kind: "union",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "connectedMachines",
            source: "declared",
            documentCount: 6,
            indexes: [{ name: "by_user_machine_id", fields: ["userId", "machineId"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "machineId",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "lastSeenAt",
                kind: "number",
                optional: true,
                source: "declared",
              },
            ],
          },
          {
            name: "vaults",
            source: "mixed",
            documentCount: 48,
            indexes: [{ name: "by_userId", fields: ["userId"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "owner",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "name",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "lastTreeRefreshAt",
                kind: "number",
                optional: true,
                source: "inferred",
              },
            ],
          },
          {
            name: "observations_vaultRepository_branches",
            source: "mixed",
            documentCount: 96,
            indexes: [{ name: "by_vault_branch", fields: ["vaultId", "branch"] }],
            fields: [
              {
                path: "vaultId",
                kind: "Id<vaults>",
                optional: false,
                source: "declared",
                targetTable: "vaults",
              },
              {
                path: "branch",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "headCommitSha",
                kind: "string",
                optional: true,
                source: "inferred",
              },
            ],
          },
          {
            name: "workflow_vaultProvisioning_writeLocks",
            source: "declared",
            documentCount: 16,
            indexes: [{ name: "by_user_kind", fields: ["userId", "kind"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "kind",
                kind: "union",
                optional: false,
                source: "declared",
              },
              {
                path: "auth.method",
                kind: "union",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "workflow_vaultProvisioning_runs",
            source: "declared",
            documentCount: 24,
            indexes: [{ name: "by_vault", fields: ["vaultId"] }],
            fields: [
              {
                path: "vaultId",
                kind: "Id<vaults>",
                optional: false,
                source: "declared",
                targetTable: "vaults",
              },
              {
                path: "state",
                kind: "union",
                optional: false,
                source: "declared",
              },
              {
                path: "createdAt",
                kind: "number",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "vaultStagedFiles",
            source: "mixed",
            documentCount: 318,
            indexes: [{ name: "by_vault_and_branch", fields: ["vaultId", "branch"] }],
            fields: [
              {
                path: "vaultId",
                kind: "Id<vaults>",
                optional: false,
                source: "declared",
                targetTable: "vaults",
              },
              {
                path: "lastEditUserId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "filePath",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "content.kind",
                kind: "union",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "chatThreadContexts",
            source: "mixed",
            documentCount: 54,
            indexes: [{ name: "by_user", fields: ["userId"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "vaultId",
                kind: "Id<vaults>",
                optional: true,
                source: "declared",
                targetTable: "vaults",
              },
              {
                path: "threadId",
                kind: "string",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "mcpGrants",
            source: "declared",
            documentCount: 12,
            indexes: [{ name: "by_user_client", fields: ["userId", "clientId"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "clientId",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "scope",
                kind: "array",
                optional: false,
                source: "declared",
              },
            ],
          },
        ],
        relationships: [
          {
            id: "declared:providerConnections:userId:users",
            fromTable: "providerConnections",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:connectedMachines:userId:users",
            fromTable: "connectedMachines",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:vaults:userId:users",
            fromTable: "vaults",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:observations_vaultRepository_branches:vaultId:vaults",
            fromTable: "observations_vaultRepository_branches",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:workflow_vaultProvisioning_writeLocks:userId:users",
            fromTable: "workflow_vaultProvisioning_writeLocks",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:workflow_vaultProvisioning_runs:vaultId:vaults",
            fromTable: "workflow_vaultProvisioning_runs",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:vaultStagedFiles:vaultId:vaults",
            fromTable: "vaultStagedFiles",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:vaultStagedFiles:lastEditUserId:users",
            fromTable: "vaultStagedFiles",
            fromField: "lastEditUserId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:chatThreadContexts:userId:users",
            fromTable: "chatThreadContexts",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:mcpGrants:userId:users",
            fromTable: "mcpGrants",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
        ],
        warnings: [],
      },
    },
    layout: [],
  };
}

function saveFixtureConvexSchemaGraphLayout(
  layout: VaultConvexSchemaGraphState["layout"],
  nodeId: string,
  x: number,
  y: number,
): VaultConvexSchemaGraphState["layout"] {
  return [
    ...layout.filter((entry) => entry.nodeId !== nodeId),
    {
      nodeId,
      x,
      y,
    },
  ].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function VaultConvexSchemaGraphFixture() {
  const [graphState, setGraphState] = useState(buildFixtureConvexSchemaGraphState);
  const handleSaveLayout = useCallback((nodeId: string, x: number, y: number) => {
    setGraphState((currentState) => ({
      ...currentState,
      layout: saveFixtureConvexSchemaGraphLayout(currentState.layout, nodeId, x, y),
    }));
  }, []);

  return (
    <div
      data-testid="vault-convex-schema-graph-fixture"
      className="w-full bg-background p-4 text-foreground"
    >
      <VaultConvexSchemaGraphContent
        state={graphState}
        refreshPending={false}
        refreshError={null}
        onRefresh={() => {}}
        onSaveLayout={handleSaveLayout}
      />
    </div>
  );
}

function VaultConvexSchemaRouteMobileFixture() {
  const [graphState, setGraphState] = useState(buildFixtureConvexSchemaGraphState);
  const handleSaveLayout = useCallback((nodeId: string, x: number, y: number) => {
    setGraphState((currentState) => ({
      ...currentState,
      layout: saveFixtureConvexSchemaGraphLayout(currentState.layout, nodeId, x, y),
    }));
  }, []);
  const context = {
    appRoot: ".",
    branch: "main",
    repositoryFullName: "samebase/samebase",
  } satisfies VaultConvexSchemaGraphRouteContext;

  return (
    <VaultConvexSchemaGraphRouteWorkspaceContent
      context={context}
      state={graphState}
      refreshPending={false}
      refreshError={null}
      onProjectChange={() => {}}
      onRefresh={() => {}}
      onSaveLayout={handleSaveLayout}
    />
  );
}

function VaultDashboardDeleteOpenFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-delete-open"
      className="w-full bg-background p-4 text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="samebase"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
          />
        </VaultDashboardRepositoryList>
        <VaultDashboardDeleteDialog
          commitError={null}
          connectedCodespacesCount={2}
          deleteError={null}
          didAttemptCommit={false}
          isCommitting={false}
          isDeleting={false}
          onCommitBeforeRemove={() => {}}
          onDeleteOptionChange={() => {}}
          onOpenChange={() => {}}
          onRemoveVault={() => {}}
          open={true}
          removeCodespaces={false}
          removeConvexProvision={false}
          removeGithubRepo={false}
          removeCloudflareProvision={false}
          stagedChangesCount={3}
          vaultToDelete={fixtureDeleteDialogTarget}
        />
      </TestRouterProvider>
    </div>
  );
}

function FixtureCloudflareConnectDialog() {
  return (
    <VaultDashboardCloudflareDialog
      accounts={[
        {
          accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
          accountName: "Samebase",
        },
      ]}
      appRoot="apps/atelier"
      appRootReadOnly={true}
      createWorkerName="atelier"
      error={null}
      isLoading={false}
      isSubmitting={false}
      mode="existing"
      onAccountChange={() => {}}
      onAppRootChange={() => {}}
      onCreateWorkerNameChange={() => {}}
      onModeChange={() => {}}
      onOpenChange={() => {}}
      onSubmit={() => {}}
      onWorkerChange={() => {}}
      open={true}
      selectedAccountId="fe57d01d7ab41f60d00ba1aade20eb33"
      selectedWorkerName="app-start-workers"
      vault={{
        appId: fakeVaultAppId("app-atelier"),
        id: fakeVaultId(),
        repositoryFullName: "samebase/atelier",
        repositoryName: "atelier",
        rootDirectory: "apps/atelier",
      }}
      workers={FIXTURE_CLOUDFLARE_WORKERS}
    />
  );
}

function VaultDashboardConnectCloudflareOpenFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-connect-cloudflare-open"
      className="w-full bg-background p-4 text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="atelier"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
          />
        </VaultDashboardRepositoryList>
        <FixtureCloudflareConnectDialog />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardAddAppRootConvertOpenFixture() {
  const [appRoot, setAppRoot] = useState("");

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-add-app-root-open"
      className="w-full bg-background p-4 text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="samebase"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
          />
        </VaultDashboardRepositoryList>
        <VaultDashboardAppRootDialog
          appRoot={appRoot}
          error={null}
          folderSuggestions={["apps/domain-router", "apps/samebase", "packages/sync"]}
          isSubmitting={false}
          mode="monorepo"
          onAppRootChange={setAppRoot}
          onModeChange={() => {}}
          onOpenChange={() => {}}
          onSubmit={() => {}}
          open={true}
          vault={{
            hasAppRoots: true,
            hasRootAppRoot: true,
            id: fakeVaultId(),
            repositoryFullName: "samebase/samebase",
          }}
        />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardAddFirstAppRootOpenFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-add-first-app-root-open"
      className="w-full bg-background p-4 text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="atelier"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
          />
        </VaultDashboardRepositoryList>
        <VaultDashboardAppRootDialog
          appRoot="/"
          error={null}
          folderSuggestions={[]}
          isSubmitting={false}
          mode="app"
          onAppRootChange={() => {}}
          onModeChange={() => {}}
          onOpenChange={() => {}}
          onSubmit={() => {}}
          open={true}
          vault={{
            hasAppRoots: false,
            hasRootAppRoot: false,
            id: fakeVaultId(),
            repositoryFullName: "samebase/atelier",
          }}
        />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardConnectCloudflareMobileShellOpenFixture() {
  return (
    <FixtureDashboardShell
      mainContent={
        <>
          <VaultDashboardRepositoryList>
            <VaultDashboardRepositoryCard
              isReady={true}
              repositoryName="atelier"
              repositoryLinks={<FixtureRepositoryLinks />}
              repositoryLinksOpen={false}
              onRepositoryLinksOpenChange={() => {}}
              topRightAction={<FixtureDeleteControl />}
              repositoryStatus={<span>Updated 12s ago</span>}
            />
          </VaultDashboardRepositoryList>
          <FixtureCloudflareConnectDialog />
        </>
      }
      rightContent={<div className="h-full w-full bg-background" />}
    />
  );
}

function VaultDashboardConnectConvexOpenFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-connect-convex-open"
      className="w-full bg-background p-4 text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="samebase-app"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
          />
        </VaultDashboardRepositoryList>
        <VaultDashboardConvexDialog
          appRoot="/"
          appRootReadOnly={false}
          createProjectName="samebase-app"
          projects={[
            {
              projectId: "jaded-heron-123",
              projectName: "samebase-app",
              projectSlug: "samebase-app",
              teamSlug: "samebase",
            },
          ]}
          error={null}
          isLoading={false}
          isSubmitting={false}
          mode="existing"
          onAppRootChange={() => {}}
          onCreateProjectNameChange={() => {}}
          onProjectChange={() => {}}
          onModeChange={() => {}}
          onOpenChange={() => {}}
          onSubmit={() => {}}
          open={true}
          selectedProjectId="jaded-heron-123"
          vault={{
            appId: fakeVaultAppId("app-root"),
            id: fakeVaultId(),
            repositoryFullName: "samebase/app",
            repositoryName: "samebase-app",
            rootDirectory: "/",
          }}
        />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardProvisioningLogFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-provisioning-log"
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="samebase-app"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            developerToolsSection={{
              visible: true,
              open: true,
              onOpenChange: () => {},
              content: (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Infra: Provisioning</div>
                  <VaultProvisioningLogViewer
                    repositoryFullName="samebase/app"
                    events={[
                      {
                        createdAt: Date.parse("2026-05-02T12:30:01Z"),
                        level: "info",
                        step: "create_github_repo",
                        message:
                          'API GitHub POST /user/repos values={"body":{"auto_init":false,"name":"[redacted]","private":true}}',
                      },
                      {
                        createdAt: Date.parse("2026-05-02T12:30:04Z"),
                        level: "info",
                        step: "attach_convex",
                        message:
                          'API Convex POST /teams/{team_id}/create_project values={"body":{"deploymentType":"prod","projectName":"[redacted]"},"params":{"path":{"team_id":"[redacted]"}}}',
                      },
                      {
                        createdAt: Date.parse("2026-05-02T12:30:08Z"),
                        level: "info",
                        step: "attach_worker",
                        message:
                          'API Cloudflare POST /accounts/{account_id}/workers/workers values={"body":{"logpush":false,"name":"[redacted]","observability":{"enabled":true,"head_sampling_rate":1},"subdomain":{"enabled":true,"previews_enabled":true}},"params":{"path":{"account_id":"[redacted]"}}}',
                      },
                      {
                        createdAt: Date.parse("2026-05-02T12:30:10Z"),
                        level: "info",
                        step: "attach_worker",
                        message:
                          'API Cloudflare PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables values={"body":{"CONVEX_DEPLOY_KEY":"[secret]","PREVIEW_CONVEX_DEPLOY_KEY":"[secret]"},"params":{"path":{"account_id":"[redacted]","trigger_uuid":"[redacted]"}}}',
                      },
                    ]}
                  />
                </div>
              ),
            }}
          />
        </VaultDashboardRepositoryList>
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardInfrastructureSetupFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-infra-setup"
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="samebase-app"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            setupSection={
              <VaultSetupProgressSection status="running" label="Infra: provisioning">
                <VaultProvisioningLogViewer
                  repositoryFullName="samebase/app"
                  events={[
                    {
                      createdAt: Date.parse("2026-05-08T09:15:00Z"),
                      level: "info",
                      step: "sync_tree",
                      message: "Synced the default branch tree.",
                    },
                    {
                      createdAt: Date.parse("2026-05-08T09:15:02Z"),
                      level: "info",
                      step: "claim_infra",
                      message: "Claiming infrastructure provisioning.",
                    },
                    {
                      createdAt: Date.parse("2026-05-08T09:15:05Z"),
                      level: "info",
                      step: "attach_convex",
                      message: "Ensuring Convex project and production deployment.",
                    },
                  ]}
                />
              </VaultSetupProgressSection>
            }
          />
        </VaultDashboardRepositoryList>
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardCloudflareGitHubAppAuthorizationFailureFixture() {
  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-dashboard-cloudflare-github-app-auth-failure"
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="tmp-manual-test"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={true}
            onRepositoryLinksOpenChange={() => {}}
            setupSection={
              <VaultProviderSetupSection
                isRetrying={false}
                onRetry={() => {}}
                repositoryFullName="noter-guest/tmp-manual-test"
                providerSetup={{
                  status: "failed",
                  provider: "cloudflare",
                  runId: fakeProvisioningRunId(),
                  step: "attach_worker",
                  message:
                    "Cloudflare Workers and Pages GitHub App is not authorized for noter-guest/tmp-manual-test. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include noter-guest/tmp-manual-test, then retry.",
                  updatedAt: Date.parse("2026-06-24T12:00:00Z"),
                }}
              />
            }
          />
        </VaultDashboardRepositoryList>
      </TestRouterProvider>
    </div>
  );
}

function FixtureDashboardShell({
  leftContent,
  mainContent,
  rightContent,
}: {
  leftContent?: ReactNode;
  mainContent?: ReactNode;
  rightContent?: ReactNode;
}) {
  return (
    <TestRouterProvider>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId="vault-dashboard-visual-fixture-shell"
        shortcutPaneSide="right"
        left={
          leftContent
            ? {
                header: (
                  <div className="flex h-full items-center px-2 text-sm font-medium text-foreground">
                    Vaults
                  </div>
                ),
                content: leftContent,
              }
            : undefined
        }
        right={{
          content: rightContent,
        }}
        main={{
          content: mainContent,
        }}
      />
    </TestRouterProvider>
  );
}

export function VaultDashboardVisualFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  if (mode === "vault-dashboard-dev-tools-hidden") {
    return <VaultDashboardDeveloperToolsFixture visible={false} />;
  }

  if (mode === "vault-dashboard-dev-tools-visible") {
    return <VaultDashboardDeveloperToolsFixture visible={true} />;
  }

  if (mode === "vault-dashboard-add-first-app-root-open") {
    return <VaultDashboardAddFirstAppRootOpenFixture />;
  }

  if (mode === "vault-dashboard-add-app-root-open") {
    return <VaultDashboardAddAppRootConvertOpenFixture />;
  }

  if (mode === "vault-dashboard-connect-cloudflare-open") {
    return <VaultDashboardConnectCloudflareOpenFixture />;
  }

  if (mode === "vault-dashboard-connect-cloudflare-mobile-shell-open") {
    return <VaultDashboardConnectCloudflareMobileShellOpenFixture />;
  }

  if (mode === "vault-dashboard-connect-convex-open") {
    return <VaultDashboardConnectConvexOpenFixture />;
  }

  if (mode === "vault-dashboard-delete-open") {
    return <VaultDashboardDeleteOpenFixture />;
  }

  if (mode === "vault-dashboard-infra-setup") {
    return <VaultDashboardInfrastructureSetupFixture />;
  }

  if (mode === "vault-dashboard-cloudflare-github-app-auth-failure") {
    return <VaultDashboardCloudflareGitHubAppAuthorizationFailureFixture />;
  }

  if (mode === "vault-dashboard-cloudflare-build-trigger-missing") {
    return <VaultDashboardCloudflareBuildTriggerMissingFixture />;
  }

  if (mode === "vault-dashboard-provisioning-log") {
    return <VaultDashboardProvisioningLogFixture />;
  }

  if (mode === "vault-dashboard-list-spacing") {
    return <VaultDashboardListSpacingFixture mode={mode} />;
  }

  if (mode === "vault-dashboard-root-picker") {
    return <VaultDashboardRootPickerFixture mode={mode} />;
  }

  if (mode === "vault-dashboard-sidebar-list") {
    return <VaultDashboardSidebarListFixture mode={mode} />;
  }

  if (mode === "vault-convex-schema-graph") {
    return <VaultConvexSchemaGraphFixture />;
  }

  if (mode === "vault-convex-schema-route-mobile") {
    return <VaultConvexSchemaRouteMobileFixture />;
  }

  mode satisfies "vault-dashboard-sticky-header" | "vault-pull-request-filters";
  return <VaultDashboardListSpacingFixture mode={mode} />;
}
