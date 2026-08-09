import { useState } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  VaultOverviewLoadingPage,
  VaultOverviewPage,
} from "@/components/vault-dashboard/VaultOverviewPage";
import {
  type VaultFolderCallbacks,
  VaultOverviewOrganizationSidebar,
  VaultOverviewSidebarLoading,
} from "@/components/vault-dashboard/VaultOverviewSidebar";
import { buildProductionEnvironmentRoots } from "@/components/vault-dashboard/vaultEnvironmentRoots";
import { buildVaultRepositorySettingsState } from "@/components/vault-dashboard/vaultRepositorySettingsState";
import type {
  VaultFolderState,
  VaultOrganizationTreeSettings,
  VaultWorkspaceSelected,
} from "@/components/vault-dashboard/vaultWorkspaceModel";
import {
  type VaultOrganization,
  VaultOverviewVaultListHeader,
  VaultOverviewVaultPickerPane,
} from "@/components/vault-dashboard/VaultOverviewVaultPickerPane";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
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
import {
  VaultOverviewDialogsVisualFixture,
  type VaultOverviewDialogsVisualMode,
} from "./VaultOverviewDialogsVisualFixture";
import {
  VaultConvexSchemaGraphVisualFixture,
  type VaultConvexSchemaGraphVisualMode,
} from "./VaultConvexSchemaGraphVisualFixture";

export type VaultOverviewVisualMode =
  | VaultOverviewDialogsVisualMode
  | VaultConvexSchemaGraphVisualMode
  | "vault-overview-v2"
  | "vault-overview-v2-auto-pagination"
  | "vault-overview-v2-cloudflare-build-status-unavailable"
  | "vault-overview-v2-dev"
  | "vault-overview-v2-loading"
  | "vault-overview-v2-partial-loading"
  | "vault-overview-v2-provider-failed"
  | "vault-overview-v2-provisioning-source"
  | "vault-overview-v2-provisioning-github"
  | "vault-overview-v2-provisioning-early-empty"
  | "vault-overview-v2-provisioning-complete-empty"
  | "vault-overview-v2-provisioning-stale-empty"
  | "vault-overview-v2-provisioning-commit"
  | "vault-overview-v2-provisioning-worker"
  | "vault-overview-v2-provisioning-ready"
  | "vault-overview-v2-root"
  | "vault-overview-v2-settings"
  | "vault-overview-v2-settings-active"
  | "vault-overview-v2-settings-checking"
  | "vault-overview-v2-settings-completed"
  | "vault-overview-v2-settings-loading";

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

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeFolderId(value: string): Id<"ui_vaultFolders"> {
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
const VISUAL_ORGANIZATION_ID = fakeOrganizationId("organization-samebase");
const VISUAL_NOTER_ORGANIZATION_ID = fakeOrganizationId("organization-noter");
const VISUAL_EMPTY_ORGANIZATION_ID = fakeOrganizationId("organization-empty");
const LIST_SPACING_DOMAIN_WORKER_ID = fakeCloudflareWorkerId("worker-domain-router");
const LIST_SPACING_SAMEBASE_WORKER_ID = fakeCloudflareWorkerId("worker-samebase");
const LIST_SPACING_CONVEX_PROJECT_ID = fakeConvexProjectId("convex-project-samebase");
const LIST_SPACING_VAULT = {
  _id: LIST_SPACING_VAULT_ID,
  organizationId: VISUAL_ORGANIZATION_ID,
  cloudflareAccountId: "fe57d01d7ab41f60d00ba1aade20eb33",
  convexTeamId: "samebase-team-id",
  ghRepoOwner: "samebase",
  ghRepoName: "samebase",
  repositoryFullName: "samebase/samebase",
  defaultBranch: "main",
  fileCount: 18,
  sourceSetup: { status: "ready" },
  providerSetup: { status: "ready" },
  providerPlan: null,
  providerWrite: { status: "idle", lastWriteAt: {} },
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
} satisfies UserVaultResult;

const LIST_SPACING_CLOUDFLARE_OBSERVATIONS = {
  workers: {
    state: "loaded",
    refreshFailed: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        workerId: LIST_SPACING_DOMAIN_WORKER_ID,
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://domain-router.samebase.workers.dev",
        },
      },
      {
        state: "available",
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
    refreshFailed: false,
    reload: () => {},
    observations: [
      {
        state: "available",
        workerId: LIST_SPACING_DOMAIN_WORKER_ID,
        repository: {
          state: "ready",
          rootDirectory: "apps/domain-router",
          builds: { state: "not_available" },
        },
        builds: { state: "not_connected" },
      },
      {
        state: "available",
        workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
        repository: {
          state: "ready",
          rootDirectory: "apps/samebase",
          builds: { state: "not_available" },
        },
        builds: { state: "not_connected" },
      },
    ],
  },
  convexBuildAccess: {
    state: "loaded",
    refreshFailed: false,
    reload: () => {},
    observations: [],
  },
} satisfies VaultCloudflareProviderObservationState;

const FAILED_CLOUDFLARE_OBSERVATIONS = {
  workers: { state: "failed", reload: () => {} },
  builds: LIST_SPACING_CLOUDFLARE_OBSERVATIONS.builds,
  convexBuildAccess: LIST_SPACING_CLOUDFLARE_OBSERVATIONS.convexBuildAccess,
} satisfies VaultCloudflareProviderObservationState;

const LIST_SPACING_CONVEX_OBSERVATIONS = {
  state: "loaded",
  refreshFailed: false,
  reload: () => {},
  observations: [
    {
      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
      projectId: "samebase",
      codeLocation: { kind: "config", convexConfigPath: "apps/samebase/convex.json" },
      source: { kind: "config", state: "valid" },
      provider: {
        state: "current",
        projectSlug: "samebase",
        teamSlug: "samebase",
        productionDeployment: {
          state: "available",
          deploymentName: "calm-swan-123",
          dashboardUrl: "https://dashboard.convex.dev/t/samebase/samebase/calm-swan-123",
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
    organizationId: VISUAL_NOTER_ORGANIZATION_ID,
    ghRepoOwner: "noter",
    ghRepoName: "guestbook",
    repositoryFullName: "noter/guestbook",
  },
] satisfies UserVaultResult[];

const FIXTURE_FOLDER_CALLBACKS = {
  onDeleteVaultFolder: async () => {},
  onMoveVaultFolder: async () => {},
  onMoveVaultToFolder: async () => {},
  onRenameVaultFolder: async () => {},
  onSetVaultFolderCollapsed: async () => {},
} satisfies VaultFolderCallbacks;

const VISUAL_PRODUCTS_FOLDER_ID = fakeFolderId("folder-products");
const VISUAL_FOLDER_STATE = {
  assignments: [
    {
      folderId: VISUAL_PRODUCTS_FOLDER_ID,
      vaultId: SIDEBAR_LIST_SELECTED_VAULT_ID,
    },
  ],
  folders: [
    {
      _id: VISUAL_PRODUCTS_FOLDER_ID,
      collapsed: false,
      name: "Products",
      organizationId: VISUAL_ORGANIZATION_ID,
      position: 0,
    },
    {
      _id: fakeFolderId("folder-archive"),
      collapsed: false,
      name: "Archive",
      organizationId: VISUAL_ORGANIZATION_ID,
      position: 1,
    },
  ],
} satisfies VaultFolderState;

const FIXTURE_VAULT_FOLDER_PROPS = {
  ...FIXTURE_FOLDER_CALLBACKS,
  folderState: VISUAL_FOLDER_STATE,
  onCreateVaultFolder: async () => {},
  onSetVaultOrganizationCollapsed: async () => {},
  organizationTreeSettings: [],
};

const VISUAL_ORGANIZATIONS = [
  {
    canCreateRepository: true,
    githubOwnerId: "github-owner-empty",
    githubOwnerLogin: "empty-owner",
    githubOwnerType: "organization",
    organizationId: VISUAL_EMPTY_ORGANIZATION_ID,
    role: "owner",
  },
  {
    canCreateRepository: true,
    githubOwnerId: "github-owner-noter",
    githubOwnerLogin: "noter",
    githubOwnerType: "user",
    organizationId: VISUAL_NOTER_ORGANIZATION_ID,
    role: "owner",
  },
  {
    canCreateRepository: true,
    githubOwnerId: "github-owner-samebase",
    githubOwnerLogin: "samebase",
    githubOwnerType: "organization",
    organizationId: VISUAL_ORGANIZATION_ID,
    role: "owner",
  },
] satisfies VaultOrganization[];

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
  summaries: SIDEBAR_LIST_VAULTS.map((vault) => ({
    vaultId: vault._id,
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
const PROVISIONING_ORGANIZATION = {
  canCreateRepository: true,
  githubOwnerId: "github-owner-nicu-chiciuc",
  githubOwnerLogin: "nicu-chiciuc",
  githubOwnerType: "user",
  organizationId: VISUAL_ORGANIZATION_ID,
  role: "owner",
} satisfies VaultOrganization;
const PROVISIONING_VAULT = {
  ...LIST_SPACING_VAULT,
  cloudflareAccountId: "fixture-cloudflare-account",
  convexTeamId: "38516",
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
} satisfies UserVaultResult;

const PROVISIONING_CLOUDFLARE_OBSERVATIONS = {
  workers: {
    state: "loaded",
    refreshFailed: false,
    reload: () => {},
    observations: [
      {
        state: "available",
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
    refreshFailed: false,
    reload: () => {},
    observations: [
      {
        state: "available",
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
          productionBuild: {
            state: "available",
            buildState: "success",
            logsUrl:
              "https://dash.cloudflare.com/fixture-account/workers/services/view/tmp-f149-vault-loading-states/production/builds/fixture-production-build",
          },
        },
      },
    ],
  },
  convexBuildAccess: {
    state: "loaded",
    refreshFailed: false,
    reload: () => {},
    observations: [
      {
        state: "available",
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
  refreshFailed: false,
  reload: () => {},
  observations: [
    {
      convexProjectId: PROVISIONING_CONVEX_PROJECT_ID,
      projectId: "2653471",
      codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      source: { kind: "config", state: "valid" },
      provider: {
        state: "current",
        projectSlug: "tmp-f149-vault-loading-states",
        teamSlug: "nicu",
        productionDeployment: {
          state: "available",
          deploymentName: "dazzling-pheasant-894",
          dashboardUrl:
            "https://dashboard.convex.dev/t/nicu/tmp-f149-vault-loading-states/dazzling-pheasant-894",
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
    observations: [],
    refreshFailed: false,
    reload: () => {},
  },
  builds: {
    state: "loaded",
    observations: [],
    refreshFailed: false,
    reload: () => {},
  },
  convexBuildAccess: {
    state: "loaded",
    observations: [],
    refreshFailed: false,
    reload: () => {},
  },
} satisfies VaultCloudflareProviderObservationState;

const PROVISIONING_EMPTY_CONVEX_OBSERVATIONS = {
  state: "loaded",
  observations: [],
  refreshFailed: false,
  reload: () => {},
} satisfies VaultProviderObservationState<VaultConvexProjectObservation>;

const PROVISIONING_CHECKING_CLOUDFLARE_OBSERVATIONS = {
  workers: { state: "checking" },
  builds: { state: "checking" },
  convexBuildAccess: { state: "checking" },
} satisfies VaultCloudflareProviderObservationState;

const PROVISIONING_CHECKING_CONVEX_OBSERVATIONS = {
  state: "checking",
} satisfies VaultProviderObservationState<VaultConvexProjectObservation>;

const PROVISIONING_PLANNED_PROVIDER_PLAN = {
  convexConfigPath: "convex.json",
  convex: {
    state: "planned",
    projectName: "tmp-f149-vault-loading-states",
    teamId: "38516",
  },
  cloudflare: {
    state: "planned",
    accountId: "fixture-cloudflare-account",
    workerName: "tmp-f149-vault-loading-states",
    rootDirectory: "/",
  },
} satisfies NonNullable<UserVaultResult["providerPlan"]>;

const PROVISIONING_CREATED_PROVIDER_PLAN = {
  convexConfigPath: "convex.json",
  convex: {
    state: "created",
    projectName: "tmp-f149-vault-loading-states",
    teamId: "38516",
    projectId: "2653471",
  },
  cloudflare: {
    state: "created",
    accountId: "fixture-cloudflare-account",
    workerName: "tmp-f149-vault-loading-states",
    workerTag: "tmp-f149-vault-loading-states-tag",
    rootDirectory: "/",
  },
} satisfies NonNullable<UserVaultResult["providerPlan"]>;

function fixturePullRequests(
  pullRequests: readonly FixturePullRequest[],
  defaultBranch: VaultDefaultBranchObservation | null,
  cloudflareBuildStatusUnavailable = false,
): Extract<VaultPullRequestsState, { state: "current" | "stale" }> {
  return {
    state: "current",
    defaultBranch,
    openPullRequestCount: pullRequests.length,
    refreshing: false,
    allPullRequests: [...pullRequests],
    resourcesStale: false,
    resourcesByPullRequestId: new Map(
      pullRequests.map((pullRequest) => [
        pullRequest.id,
        {
          state: "current" as const,
          resources: {
            pullRequestId: pullRequest.id,
            cloudflareBuilds:
              pullRequest.number === 1260 && cloudflareBuildStatusUnavailable
                ? { state: "unavailable" as const }
                : { state: "available" as const },
            workers:
              pullRequest.number === 1260 && !cloudflareBuildStatusUnavailable
                ? [
                    {
                      workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
                      workerName: "samebase-worker",
                      cloudflareBuild: {
                        state: "available" as const,
                        uuid: "comment-build-1260",
                        buildState: "running" as const,
                        logsUrl:
                          "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase-worker/production/builds/comment-build-1260",
                      },
                      cloudflareBranchPreview: {
                        state: "available" as const,
                        url: "https://codex-restore-convex-dashboard-links-samebase-worker.samebase.workers.dev",
                      },
                    },
                    {
                      workerId: LIST_SPACING_DOMAIN_WORKER_ID,
                      workerName: "domain-router",
                      cloudflareBuild: {
                        state: "available" as const,
                        uuid: "successful-build-1260",
                        buildState: "success" as const,
                        logsUrl:
                          "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/domain-router/production/builds/successful-build-1260",
                      },
                      cloudflareBranchPreview: { state: "absent" as const },
                    },
                  ]
                : pullRequest.number === 1259
                  ? [
                      {
                        workerId: LIST_SPACING_DOMAIN_WORKER_ID,
                        workerName: "domain-router",
                        cloudflareBuild: {
                          state: "available" as const,
                          uuid: "running-build-1259",
                          buildState: "running" as const,
                          logsUrl:
                            "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/domain-router/production/builds/running-build-1259",
                        },
                        cloudflareBranchPreview: { state: "absent" as const },
                      },
                    ]
                  : [],
            convexProjects:
              pullRequest.number === 1260
                ? [
                    {
                      state: "branch" as const,
                      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
                      rootDirectory: "apps/samebase",
                      deploymentName: "precise-otter-1260",
                      dashboardUrl:
                        "https://dashboard.convex.dev/t/samebase/samebase/precise-otter-1260",
                    },
                  ]
                : [],
            hostingPreviews:
              pullRequest.number === 1260 && !cloudflareBuildStatusUnavailable
                ? {
                    cloudflare: {
                      state: "available" as const,
                      previews: [
                        {
                          kind: "worker" as const,
                          name: "unconnected-preview-worker",
                          url: "https://codex-live-provider-truth-01-unconnected-preview-worker.samebase.workers.dev",
                        },
                      ],
                    },
                    netlify: {
                      state: "available" as const,
                      previews: [
                        {
                          name: "samebase",
                          url: "https://deploy-preview-1260--samebase.netlify.app",
                        },
                      ],
                    },
                  }
                : cloudflareBuildStatusUnavailable && pullRequest.number === 1260
                  ? {
                      cloudflare: { state: "unavailable" as const },
                      netlify: {
                        state: "available" as const,
                        previews: [
                          {
                            name: "samebase",
                            url: "https://deploy-preview-1260--samebase.netlify.app",
                          },
                        ],
                      },
                    }
                  : {
                      cloudflare: { state: "available" as const, previews: [] },
                      netlify: { state: "available" as const, previews: [] },
                    },
          },
        },
      ]),
    ),
    loadMore: { state: "exhausted" },
  };
}

const AUTO_PAGINATION_PULL_REQUESTS = [
  ...LIST_SPACING_PULL_REQUESTS.slice(0, 2),
  ...Array.from({ length: 6 }, (_, index) => fixturePullRequest({ index: index + 3 })),
];

function buildFixtureWorkspace({
  cloudflareAccountId,
  cloudflareAccountName,
  cloudflareObservations,
  convexObservations,
  githubRepositoryUrl,
  pullRequests,
  vault,
}: {
  cloudflareAccountId: string;
  cloudflareAccountName: string;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  githubRepositoryUrl: string;
  pullRequests: VaultPullRequestsState;
  vault: UserVaultResult;
}) {
  const workspace = {
    access: { state: "ready", accessKeys: ROLE_ACCESS_GRANTS.role_member },
    cloudflareConnection: {
      state: "ready",
      connection: {
        state: "connected",
        authMethod: "oauth",
        accountId: cloudflareAccountId,
        accountName: cloudflareAccountName,
      },
    },
    cloudflareObservations,
    convexObservations,
    environmentRoots: vault.defaultBranch
      ? buildProductionEnvironmentRoots({
          branch: vault.defaultBranch,
          cloudflareObservations,
          convexObservations,
          owner: vault.ghRepoOwner,
          repoName: vault.ghRepoName,
          schemaGraphEnabled: ROLE_ACCESS_GRANTS.role_member.includes("access_schema_graph"),
          vault,
        })
      : [],
    githubRepositoryUrl,
    pullRequests,
    vault,
  } satisfies VaultWorkspaceSelected;

  return {
    settingsState: buildVaultRepositorySettingsState({
      addCloudflareWorkerOnClick: () => {},
      addConvexOnClick: () => {},
      changeConvexProjectConfigPathOnClick: () => {},
      cloudflareObservations,
      cloudflareAccount: {
        accountId: cloudflareAccountId,
        accountName: cloudflareAccountName,
      },
      convexObservations,
      configureWorkersBuildsForGitHubOnClick: () => {},
      detachCloudflareWorkerOnClick: () => {},
      detachConvexProjectOnClick: () => {},
      pendingAction: null,
      rotateConvexDeployKeysForWorkersBuildsOnClick: () => {},
      vault,
    }),
    workspace,
  };
}

function VaultOverviewProvisioningFixture({ mode }: { mode: VaultOverviewProvisioningVisualMode }) {
  let vault: UserVaultResult;
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

  const { settingsState, workspace } = buildFixtureWorkspace({
    cloudflareAccountId: "fixture-cloudflare-account",
    cloudflareAccountName: "Fixture Account",
    cloudflareObservations,
    convexObservations,
    githubRepositoryUrl: "https://github.com/nicu-chiciuc/tmp-f149-vault-loading-states",
    pullRequests,
    vault,
  });
  const sidebarSummaries = {
    state: "loaded",
    summaries: [
      {
        vaultId: vault._id,
        checks: PROVISIONING_DEFAULT_BRANCH.checks,
      },
    ],
  } satisfies VaultSidebarSummariesState;
  return (
    <TestRouterProvider initialEntries={["/vault/nicu-chiciuc/tmp-f149-vault-loading-states"]}>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId={mode}
        left={{
          header: <VaultOverviewVaultListHeader />,
          content: (
            <VaultOverviewOrganizationSidebar
              {...FIXTURE_VAULT_FOLDER_PROPS}
              organizations={[PROVISIONING_ORGANIZATION]}
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
              isRetryingVaultAction={false}
              page="overview"
              settingsState={settingsState}
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

type VaultOverviewProviderSettingsVisualMode = Extract<
  VaultOverviewVisualMode,
  | "vault-overview-v2-settings-active"
  | "vault-overview-v2-settings-checking"
  | "vault-overview-v2-settings-completed"
>;

function VaultOverviewProviderSettingsFixture({
  mode,
}: {
  mode: VaultOverviewProviderSettingsVisualMode;
}) {
  let vault: UserVaultResult;
  let cloudflareObservations: VaultCloudflareProviderObservationState;
  let convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;

  switch (mode) {
    case "vault-overview-v2-settings-active":
      vault = {
        ...PROVISIONING_VAULT,
        cloudflareWorkers: [],
        convexProjects: [],
        providerPlan: PROVISIONING_PLANNED_PROVIDER_PLAN,
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          runId: PROVISIONING_RUN_ID,
          step: "attach_worker",
          updatedAt: FIXTURE_NOW,
        },
        providerWrite: {
          status: "active",
          owner: { kind: "managed_run" },
          lastWriteAt: {},
        },
        deletion: {
          state: "not_deleting",
          deleteAction: {
            state: "disabled",
            reason: "Vault setup is still running.",
          },
        },
      };
      cloudflareObservations = PROVISIONING_EMPTY_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_EMPTY_CONVEX_OBSERVATIONS;
      break;
    case "vault-overview-v2-settings-checking":
      vault = {
        ...PROVISIONING_VAULT,
        providerPlan: PROVISIONING_CREATED_PROVIDER_PLAN,
        providerWrite: {
          status: "idle",
          lastWriteAt: {
            cloudflare: FIXTURE_NOW,
            convex: FIXTURE_NOW,
          },
        },
      };
      cloudflareObservations = PROVISIONING_CHECKING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_CHECKING_CONVEX_OBSERVATIONS;
      break;
    case "vault-overview-v2-settings-completed":
      vault = {
        ...PROVISIONING_VAULT,
        providerPlan: PROVISIONING_CREATED_PROVIDER_PLAN,
        providerWrite: {
          status: "idle",
          lastWriteAt: {
            cloudflare: FIXTURE_NOW,
            convex: FIXTURE_NOW,
          },
        },
      };
      cloudflareObservations = PROVISIONING_CLOUDFLARE_OBSERVATIONS;
      convexObservations = PROVISIONING_CONVEX_OBSERVATIONS;
      break;
  }

  const { settingsState, workspace } = buildFixtureWorkspace({
    cloudflareAccountId: "fixture-cloudflare-account",
    cloudflareAccountName: "Fixture Account",
    cloudflareObservations,
    convexObservations,
    githubRepositoryUrl: "https://github.com/nicu-chiciuc/tmp-f149-vault-loading-states",
    pullRequests: fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH),
    vault,
  });

  return (
    <TestRouterProvider
      initialEntries={["/vault/nicu-chiciuc/tmp-f149-vault-loading-states/settings"]}
    >
      <WorkspaceLayoutV2FixtureFrame
        dataTestId={mode}
        left={{
          header: <VaultOverviewVaultListHeader />,
          content: (
            <VaultOverviewOrganizationSidebar
              {...FIXTURE_VAULT_FOLDER_PROPS}
              organizations={[PROVISIONING_ORGANIZATION]}
              page="settings"
              selectedVaultId={vault._id}
              sidebarSummaries={{
                state: "loaded",
                summaries: [{ vaultId: vault._id, checks: PROVISIONING_DEFAULT_BRANCH.checks }],
              }}
              vaults={[vault]}
              workspace={workspace}
            />
          ),
        }}
        main={{
          content: (
            <VaultOverviewPage
              developerToolsVisible={false}
              isRetryingVaultAction={false}
              page="settings"
              settingsState={settingsState}
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
  const [nextPullRequestPageLoaded, setNextPullRequestPageLoaded] = useState(false);
  const [organizationTreeSettings, setOrganizationTreeSettings] =
    useState<VaultOrganizationTreeSettings>([]);
  const page =
    mode === "vault-overview-v2-settings" || mode === "vault-overview-v2-settings-loading"
      ? "settings"
      : "overview";

  switch (mode) {
    case "vault-overview-v2-cloudflare-builds-repair":
    case "vault-overview-v2-cloudflare-dialog":
    case "vault-overview-v2-cloudflare-dialog-invalid-name":
    case "vault-overview-v2-cloudflare-dialog-loading":
    case "vault-overview-v2-convex-dialog":
    case "vault-overview-v2-convex-dialog-error":
    case "vault-overview-v2-convex-dialog-loading":
    case "vault-overview-v2-delete-dialog":
      return <VaultOverviewDialogsVisualFixture mode={mode} />;
    case "vault-overview-v2-convex-schema":
      return <VaultConvexSchemaGraphVisualFixture mode={mode} />;
    case "vault-overview-v2-provisioning-source":
    case "vault-overview-v2-provisioning-github":
    case "vault-overview-v2-provisioning-early-empty":
    case "vault-overview-v2-provisioning-complete-empty":
    case "vault-overview-v2-provisioning-stale-empty":
    case "vault-overview-v2-provisioning-commit":
    case "vault-overview-v2-provisioning-worker":
    case "vault-overview-v2-provisioning-ready":
      return <VaultOverviewProvisioningFixture mode={mode} />;
    case "vault-overview-v2-settings-active":
    case "vault-overview-v2-settings-checking":
    case "vault-overview-v2-settings-completed":
      return <VaultOverviewProviderSettingsFixture mode={mode} />;
  }

  if (mode === "vault-overview-v2-root") {
    return (
      <TestRouterProvider initialEntries={["/vault"]}>
        <WorkspaceLayoutV2FixtureFrame
          dataTestId="vault-overview-v2-root"
          main={{
            content: (
              <VaultOverviewVaultPickerPane
                {...FIXTURE_VAULT_FOLDER_PROPS}
                globalInventory
                organizations={VISUAL_ORGANIZATIONS}
                organizationTreeSettings={organizationTreeSettings}
                onSetVaultOrganizationCollapsed={async (setting) => {
                  setOrganizationTreeSettings((currentSettings) =>
                    currentSettings
                      .filter(
                        (currentSetting) =>
                          currentSetting.organizationId !== setting.organizationId,
                      )
                      .concat(setting),
                  );
                }}
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

  if (mode === "vault-overview-v2-loading" || mode === "vault-overview-v2-settings-loading") {
    return (
      <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
        <WorkspaceLayoutV2FixtureFrame
          dataTestId={mode}
          left={{
            header: <VaultOverviewVaultListHeader />,
            content: <VaultOverviewSidebarLoading />,
          }}
          main={{
            content: <VaultOverviewLoadingPage owner="samebase" page={page} repoName="samebase" />,
          }}
          shortcutPaneSide="left"
        />
      </TestRouterProvider>
    );
  }

  const partialLoading = mode === "vault-overview-v2-partial-loading";
  const cloudflareObservations =
    mode === "vault-overview-v2-provider-failed"
      ? FAILED_CLOUDFLARE_OBSERVATIONS
      : partialLoading
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
    mode === "vault-overview-v2-cloudflare-build-status-unavailable",
  );
  const pullRequests: VaultPullRequestsState =
    mode === "vault-overview-v2-auto-pagination"
      ? {
          ...currentPullRequests,
          openPullRequestCount: AUTO_PAGINATION_PULL_REQUESTS.length,
          loadMore: nextPullRequestPageLoaded
            ? { state: "exhausted" }
            : {
                state: "available",
                load: () => setNextPullRequestPageLoaded(true),
              },
        }
      : currentPullRequests;
  const { settingsState, workspace } = buildFixtureWorkspace({
    cloudflareAccountId: "fe57d01d7ab41f60d00ba1aade20eb33",
    cloudflareAccountName: "Samebase",
    cloudflareObservations,
    convexObservations,
    githubRepositoryUrl: "https://github.com/samebase/samebase",
    pullRequests,
    vault: LIST_SPACING_VAULT,
  });

  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId={mode}
      left={{
        header: <VaultOverviewVaultListHeader />,
        content: (
          <VaultOverviewOrganizationSidebar
            {...FIXTURE_VAULT_FOLDER_PROPS}
            organizations={VISUAL_ORGANIZATIONS}
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
            isRetryingVaultAction={false}
            page={page}
            settingsState={settingsState}
            workspace={workspace}
            onOpenDeleteDialog={() => {}}
            onRetryInfrastructureProvisioning={() => {}}
            onRetryVaultDeletion={() => {}}
          />
        ),
      }}
      shortcutPaneSide="left"
    />
  );
}
