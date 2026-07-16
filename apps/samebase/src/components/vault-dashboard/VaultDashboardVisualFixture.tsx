import { useCallback, useState, type ReactNode } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardSidebarContent,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  VaultConvexSchemaGraphContent,
  VaultConvexSchemaGraphRouteWorkspaceContent,
  type VaultConvexSchemaGraphRouteContext,
  type VaultConvexSchemaGraphState,
} from "@/components/vault-dashboard/VaultConvexSchemaGraph";
import { VaultProvisioningLogViewer } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import {
  VaultBranchSection,
  VaultBranchLinkRow,
  VaultPullRequestHeaderControls,
  VaultDashboardView,
  VaultDashboardAppRootDialog,
  VaultDashboardCloudflareDialog,
  VaultDashboardConvexDialog,
  VaultDashboardDeleteControl,
  VaultDashboardDeleteDialog,
  VaultDashboardRepositoryExternalLinks,
  type VaultDeleteDialogTarget,
  type VaultDashboardVault,
  VaultProviderSetupSection,
  VaultSetupProgressSection,
} from "@/components/vault-dashboard/VaultDashboard";
import {
  RepositorySummaryDirectoryList,
  RepositorySummaryDirectoryPane,
} from "@/components/vault-dashboard/RepositorySummaryDirectory";
import type { RepositorySummaryDirectoryEntry } from "@/hooks/useRepositorySummaryDirectory";
import {
  buildPullRequestFilterOptions,
  type RepositoryInventoryFilters,
} from "@/components/vault-dashboard/repositoryInventoryFilters";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { validateRootRouteSearch } from "@/routeSearch/root";
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
  | "vault-dashboard-large-branch-list"
  | "vault-dashboard-root-picker"
  | "vault-dashboard-sidebar-list"
  | "vault-dashboard-list-spacing"
  | "vault-convex-schema-graph"
  | "vault-convex-schema-route-mobile"
  | "vault-pull-request-filters"
  | "vault-branch-pr-labels"
  | "vault-branch-mobile-alignment";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");
const FIXTURE_ROOT_ROUTE_SEARCH = validateRootRouteSearch({});

function ignoreFixtureLoadMore(_numItems: number): void {}

function fakeVaultId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeRepositoryInventorySnapshotId(): Id<"vaultRepositoryInventorySnapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "rx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeRepositoryInventoryFilterViewId(): Id<"vaultRepositoryInventoryFilterViews"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "rv7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeProvisioningRunId(): Id<"appProvisioningRuns"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeConvexDeploymentId(): Id<"vaultConvexDeployments"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "nd7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeConvexSchemaSnapshotId(): Id<"vaultConvexSchemaSnapshots"> {
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

type FixtureVaultBranch = Parameters<typeof VaultBranchLinkRow>[0]["branch"];

interface FixtureVaultBranchRow {
  branch: FixtureVaultBranch;
}

type FixtureVaultBranchDefaults =
  | "canOpenInSamebase"
  | "comparison"
  | "githubRepositoryFullName"
  | "rowKey";

type FixtureVaultBranchInput =
  | (Omit<Extract<FixtureVaultBranch, { kind: "branch" }>, FixtureVaultBranchDefaults> & {
      canOpenInSamebase?: boolean;
      comparison?: Extract<FixtureVaultBranch, { kind: "branch" }>["comparison"];
      githubRepositoryFullName?: string;
      rowKey?: string;
    })
  | (Omit<
      Extract<FixtureVaultBranch, { kind: "pull_request" }>,
      | FixtureVaultBranchDefaults
      | "pullRequestAdditions"
      | "pullRequestBaseRefName"
      | "pullRequestChangedFiles"
      | "pullRequestDeletions"
      | "pullRequestIsCrossRepository"
      | "pullRequestIsDraft"
      | "pullRequestLabels"
    > & {
      canOpenInSamebase?: boolean;
      comparison?: Extract<FixtureVaultBranch, { kind: "pull_request" }>["comparison"];
      githubRepositoryFullName?: string;
      pullRequestAdditions?: number;
      pullRequestBaseRefName?: string;
      pullRequestChangedFiles?: number;
      pullRequestDeletions?: number;
      pullRequestIsCrossRepository?: boolean;
      pullRequestIsDraft?: boolean;
      pullRequestLabels?: Array<string | { name: string; color?: string }>;
      rowKey?: string;
    });

function fixtureVaultBranch(branch: FixtureVaultBranchInput): FixtureVaultBranch {
  const sharedFields = {
    rowKey:
      branch.rowKey ??
      (branch.kind === "branch"
        ? `branch:${branch.name}`
        : `pull-request:${branch.pullRequestNumber}`),
    githubRepositoryFullName: branch.githubRepositoryFullName ?? "samebase/samebase",
    canOpenInSamebase: branch.canOpenInSamebase ?? true,
  };
  return branch.kind === "branch"
    ? {
        ...branch,
        ...sharedFields,
        comparison: branch.comparison ?? {
          state: "ready",
          aheadBy: branch.isDefault ? 0 : 6,
          behindBy: branch.isDefault ? 0 : 2,
        },
      }
    : {
        ...branch,
        ...sharedFields,
        comparison: branch.comparison ?? { state: "ready", aheadBy: 6, behindBy: 2 },
        pullRequestAdditions: branch.pullRequestAdditions ?? 1_240,
        pullRequestBaseRefName: branch.pullRequestBaseRefName ?? "main",
        pullRequestDeletions: branch.pullRequestDeletions ?? 318,
        pullRequestChangedFiles: branch.pullRequestChangedFiles ?? 17,
        pullRequestIsCrossRepository: branch.pullRequestIsCrossRepository ?? false,
        pullRequestIsDraft: branch.pullRequestIsDraft ?? false,
        pullRequestLabels: branch.pullRequestLabels ?? [],
      };
}

function fixtureReadyRepositoryInventoryState() {
  return {
    state: "ready" as const,
    activeSnapshotId: fakeRepositoryInventorySnapshotId(),
    activeFilterViewId: fakeRepositoryInventoryFilterViewId(),
    activeFilterRevision: 0,
    repositoryFullName: "samebase/samebase",
    defaultBranch: "main",
    publishedAt: FIXTURE_NOW - 12_000,
    checkedAt: FIXTURE_NOW - 12_000,
  };
}

function FixtureRepositoryLinks() {
  return (
    <VaultDashboardRepositoryExternalLinks
      repositoryFullName="samebase/samebase"
      links={[
        {
          href: "https://github.com/samebase/samebase",
          key: "github",
          label: "GitHub",
          title: "Open GitHub repository",
        },
        {
          href: "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase/production/deployments",
          key: "cloudflare",
          label: "Cloudflare",
          title: "Open Cloudflare Worker",
        },
        {
          href: "https://dashboard.convex.dev/t/nicu/samebase/settings",
          key: "convexProjectSettings",
          label: "Project settings",
          title: "Open Convex project settings",
        },
      ]}
    />
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

const LIST_SPACING_BRANCHES: FixtureVaultBranchRow[] = [
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "main",
      isDefault: true,
      headCommit: {
        sha: "1234567890abcdef1234567890abcdef12345678",
        title: "Track branch checks in the dashboard model",
        checks: {
          state: "success",
          totalCount: 4,
          checkRunCount: 4,
          statusContextCount: 0,
          successCount: 4,
          failureCount: 0,
          runningCount: 0,
          neutralCount: 0,
          unknownCount: 0,
          primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/123",
        },
      },
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "pull_request",
      name: "codex/dashboard-main-pane-spacing",
      isDefault: false,
      pullRequestUrl: "https://github.com/samebase/samebase/pull/321",
      pullRequestNumber: 321,
      pullRequestTitle: "Use the full dashboard main pane",
      headCommit: {
        sha: "abcdef1234567890abcdef1234567890abcdef12",
        title: "Use the full dashboard main pane",
        checks: {
          state: "running",
          totalCount: 3,
          checkRunCount: 3,
          statusContextCount: 0,
          successCount: 1,
          failureCount: 0,
          runningCount: 2,
          neutralCount: 0,
          unknownCount: 0,
          primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/321",
        },
      },
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "pull_request",
      name: "codex/branch-expansion-state",
      isDefault: false,
      pullRequestUrl: "https://github.com/samebase/samebase/pull/322",
      pullRequestNumber: 322,
      pullRequestTitle: "Persist branch list expansion",
      headCommit: {
        sha: "456789abcdef1234567890abcdef1234567890ab",
        title: "Persist branch list expansion",
        checks: {
          state: "failure",
          totalCount: 5,
          checkRunCount: 5,
          statusContextCount: 0,
          successCount: 3,
          failureCount: 1,
          runningCount: 0,
          neutralCount: 1,
          unknownCount: 0,
          primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/322",
        },
      },
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "pull_request",
      name: "codex/checks-history-window",
      isDefault: false,
      pullRequestUrl: "https://github.com/samebase/samebase/pull/323",
      pullRequestNumber: 323,
      pullRequestTitle: "Show a bounded checks history",
      headCommit: {
        sha: "e1234567890abcdef1234567890abcdef12345678",
        title: "Show a bounded checks history",
        checks: {
          state: "running",
          totalCount: 4,
          checkRunCount: 4,
          statusContextCount: 0,
          successCount: 2,
          failureCount: 0,
          runningCount: 1,
          neutralCount: 1,
          unknownCount: 0,
          primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/323",
        },
      },
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/quiet-mobile-frame",
      headCommit: { sha: "789abcdef1234567890abcdef1234567890abcd" },
      isDefault: false,
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/research-branch-collapse",
      headCommit: { sha: "def1234567890abcdef1234567890abcdef12345" },
      isDefault: false,
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/mobile-keyboard-lift",
      headCommit: { sha: "f1234567890abcdef1234567890abcdef1234567" },
      isDefault: false,
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/preview-status-refresh",
      headCommit: { sha: "a234567890abcdef1234567890abcdef12345678" },
      isDefault: false,
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/branch-cleanup-guard",
      headCommit: { sha: "b34567890abcdef1234567890abcdef123456789" },
      isDefault: false,
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/archive-doc-taxonomy",
      headCommit: { sha: "c4567890abcdef1234567890abcdef1234567890" },
      isDefault: false,
    }),
  },
  {
    branch: fixtureVaultBranch({
      kind: "branch",
      name: "codex/vault-filter-polish",
      headCommit: { sha: "d567890abcdef1234567890abcdef12345678901" },
      isDefault: false,
    }),
  },
];

const LIST_SPACING_VAULT_ID = fakeVaultId();
const LIST_SPACING_VAULT = {
  _id: LIST_SPACING_VAULT_ID,
  _creationTime: FIXTURE_NOW - 900_000,
  ghRepoOwner: "samebase",
  ghRepoName: "samebase",
  repositoryFullName: "samebase/samebase",
  commitSHA: "1234567890abcdef1234567890abcdef12345678",
  fileCount: 18,
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
  appRoots: [{ appRoot: "apps/domain-router" }, { appRoot: "apps/samebase" }],
  cloudflareWorkers: [
    {
      appRoot: "apps/domain-router",
      convexDeployKeys: { state: "not_applicable" },
      githubRepositoryConnection: { state: "connected" },
      upstream: { state: "present" },
      lastObservedAt: FIXTURE_NOW - 12_000,
      workerName: "domain-router",
      workersDevUrl: "https://domain-router.nicu.workers.dev",
      projectDashboardUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/domain-router/production/deployments",
    },
    {
      appRoot: "apps/samebase",
      convexDeployKeys: { state: "set" },
      githubRepositoryConnection: { state: "connected" },
      upstream: { state: "present" },
      lastObservedAt: FIXTURE_NOW - 12_000,
      workerName: "samebase-worker",
      workersDevUrl: "https://samebase-worker.nicu.workers.dev",
      projectDashboardUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase-worker/production/deployments",
    },
  ],
  convexDeployments: [
    {
      appRoot: "apps/samebase",
      projectId: "samebase",
      projectSlug: "samebase",
      teamSlug: "nicu",
      deploymentName: "calm-swan-123",
      cloudUrl: "https://calm-swan-123.convex.cloud",
      siteUrl: "https://calm-swan-123.convex.site",
      upstream: { state: "present" },
      projectSettingsDashboardUrl: "https://dashboard.convex.dev/t/nicu/samebase/settings",
      deploymentDashboardUrl: "https://dashboard.convex.dev/t/nicu/samebase/calm-swan-123",
    },
  ],
} satisfies VaultDashboardVault;

const CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID = fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8e");
const CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT = {
  ...LIST_SPACING_VAULT,
  _id: CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID,
  _creationTime: FIXTURE_NOW - 3_600_000,
  ghRepoOwner: "nicu-chiciuc",
  ghRepoName: "tmp-my-super-app-2",
  repositoryFullName: "nicu-chiciuc/tmp-my-super-app-2",
  commitSHA: "abcdef1234567890abcdef1234567890abcdef12",
  fileCount: 9,
  sourceSetup: { status: "ready" },
  providerSetup: {
    status: "failed",
    provider: "cloudflare",
    source: "manual",
    runId: fakeProvisioningRunId(),
    step: "wire_convex_build_access",
    message:
      "Cannot connect Cloudflare Worker 4d41accaab0042ef83bc3fc78e1ec644 to nicu-chiciuc/tmp-my-super-app-2: Cloudflare did not return the existing production Workers Builds trigger. Retry Workers Builds wiring or choose another Worker.",
    updatedAt: FIXTURE_NOW - 1_000,
    nextAction: "wire_convex_build_access",
  },
  appRoots: [{ appRoot: "." }],
  cloudflareWorkers: [
    {
      appRoot: ".",
      convexDeployKeys: { state: "not_applicable" },
      githubRepositoryConnection: { state: "not_connected", nextAction: "wire_builds" },
      upstream: { state: "present" },
      lastObservedAt: FIXTURE_NOW - 2_000,
      workerName: "tmp-my-super-app-234",
      workersDevUrl: "https://tmp-my-super-app-234.pfp.workers.dev",
      projectDashboardUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/tmp-my-super-app-234/production/deployments",
    },
  ],
  convexDeployments: [
    {
      appRoot: ".",
      projectId: "tmp-my-super-app-2",
      projectSlug: "tmp-my-super-app-2",
      teamSlug: "nicu",
      deploymentName: "valiant-panda-123",
      cloudUrl: "https://valiant-panda-123.convex.cloud",
      siteUrl: "https://valiant-panda-123.convex.site",
      upstream: { state: "present" },
      projectSettingsDashboardUrl:
        "https://dashboard.convex.dev/t/nicu/tmp-my-super-app-2/settings",
      deploymentDashboardUrl:
        "https://dashboard.convex.dev/t/nicu/tmp-my-super-app-2/valiant-panda-123",
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

const SIDEBAR_LIST_DIRECTORY_ENTRIES = [
  {
    vaultId: SIDEBAR_LIST_VAULTS[0]._id,
    repositoryFullName: "samebase/samebase",
    state: {
      state: "connected",
      summary: {
        lifecycle: { state: "idle" },
        publication: {
          state: "complete",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "1234567890abcdef1234567890abcdef12345678",
            checkState: "success",
          },
          openPullRequestCount: 98,
          publishedAt: FIXTURE_NOW - 120_000,
          checkedAt: FIXTURE_NOW - 120_000,
        },
      },
    },
  },
  {
    vaultId: SIDEBAR_LIST_SELECTED_VAULT_ID,
    repositoryFullName: "samebase/marketing-site",
    state: {
      state: "connected",
      summary: {
        lifecycle: { state: "updating" },
        publication: {
          state: "complete",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "2234567890abcdef1234567890abcdef12345678",
            checkState: "running",
          },
          openPullRequestCount: 4,
          publishedAt: FIXTURE_NOW - 60_000,
          checkedAt: FIXTURE_NOW - 60_000,
        },
      },
    },
  },
  {
    vaultId: SIDEBAR_LIST_VAULTS[2]._id,
    repositoryFullName: "noter/guestbook",
    state: {
      state: "connected",
      summary: {
        lifecycle: { state: "idle" },
        publication: {
          state: "complete",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "3234567890abcdef1234567890abcdef12345678",
            checkState: "none",
          },
          openPullRequestCount: 0,
          publishedAt: FIXTURE_NOW - 300_000,
          checkedAt: FIXTURE_NOW - 300_000,
        },
      },
    },
  },
  {
    vaultId: fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8f"),
    repositoryFullName: "nicu-chiciuc/notes",
    state: {
      state: "connected",
      summary: {
        lifecycle: { state: "updating" },
        publication: { state: "unobserved" },
      },
    },
  },
  {
    vaultId: fakeVaultId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8g"),
    repositoryFullName: "nicu-chiciuc/tmp-broken",
    state: { state: "setup_failed", failedAt: FIXTURE_NOW - 30_000 },
  },
] satisfies RepositorySummaryDirectoryEntry[];

const STICKY_HEADER_BRANCHES: FixtureVaultBranchRow[] = Array.from({ length: 32 }, (_, index) => ({
  branch: fixtureVaultBranch({
    kind: "branch",
    name: index === 0 ? "main" : `codex/sticky-dashboard-branch-${String(index).padStart(2, "0")}`,
    headCommit: { sha: "1234567890abcdef1234567890abcdef12345678" },
    isDefault: index === 0,
  }),
}));

const LARGE_BRANCH_COUNT = 1000;
const LARGE_BRANCH_INITIAL_PAGE_SIZE = 25;
const LARGE_BRANCHES: FixtureVaultBranch[] = Array.from(
  { length: LARGE_BRANCH_COUNT },
  (_, index) =>
    fixtureVaultBranch({
      kind: "branch",
      name: index === 0 ? "main" : `codex/large-branch-${String(index).padStart(4, "0")}`,
      headCommit: { sha: index.toString(16).padStart(40, "0") },
      isDefault: index === 0,
    }),
);

const PULL_REQUEST_FILTER_ROWS: FixtureVaultBranch[] = [
  fixtureVaultBranch({
    kind: "branch",
    name: "main",
    headCommit: { sha: "1234567890abcdef1234567890abcdef12345678" },
    isDefault: true,
  }),
  fixtureVaultBranch({
    kind: "pull_request",
    name: "codex/visible-pull-request",
    headCommit: { sha: "34567890abcdef1234567890abcdef1234567890" },
    isDefault: false,
    pullRequestUrl: "https://github.com/samebase/samebase/pull/401",
    pullRequestNumber: 401,
    pullRequestTitle: "Keep visible pull requests first",
    pullRequestLabels: [
      { name: "needs review", color: "bf8700" },
      { name: "customer", color: "1a7f37" },
    ],
  }),
  fixtureVaultBranch({
    kind: "pull_request",
    name: "codex/repository-inventory-research",
    headCommit: { sha: "4567890abcdef1234567890abcdef12345678901" },
    isDefault: false,
    pullRequestUrl: "https://github.com/samebase/samebase/pull/402",
    pullRequestNumber: 402,
    pullRequestTitle: "Document repository inventory research",
    pullRequestLabels: [{ name: "research", color: "0969da" }],
  }),
  fixtureVaultBranch({
    kind: "pull_request",
    name: "codex/unlabeled-pull-request",
    headCommit: { sha: "567890abcdef1234567890abcdef123456789012" },
    isDefault: false,
    pullRequestUrl: "https://github.com/samebase/samebase/pull/403",
    pullRequestNumber: 403,
    pullRequestTitle: "Handle unlabeled pull requests",
  }),
  fixtureVaultBranch({
    kind: "pull_request",
    name: "codex/draft-inventory-pass",
    headCommit: { sha: "67890abcdef1234567890abcdef1234567890123" },
    isDefault: false,
    pullRequestUrl: "https://github.com/samebase/samebase/pull/404",
    pullRequestNumber: 404,
    pullRequestTitle: "Draft the follow-up inventory pass",
    pullRequestIsDraft: true,
    pullRequestLabels: [{ name: "customer", color: "1a7f37" }],
  }),
  fixtureVaultBranch({
    kind: "branch",
    name: "codex/independent-branch-row",
    headCommit: { sha: "234567890abcdef1234567890abcdef123456789" },
    isDefault: false,
  }),
];

const PULL_REQUEST_FILTER_INITIAL_VALUE = {
  hiddenLabels: ["research"],
  includeDrafts: false,
  includeNoLabel: false,
} satisfies RepositoryInventoryFilters;

const PULL_REQUEST_FILTER_LABEL_FACETS = [
  { name: "customer", color: "1a7f37", pullRequestCount: 2 },
  { name: "needs review", color: "bf8700", pullRequestCount: 1 },
  { name: "research", color: "0969da", pullRequestCount: 1 },
];

const PULL_REQUEST_FILTER_TOTAL_COUNT = PULL_REQUEST_FILTER_ROWS.filter(
  (row) => row.kind === "pull_request",
).length;

function VaultDashboardListSpacingFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  const [resourceLinksOpen, setResourceLinksOpen] = useState(false);
  const branches = LIST_SPACING_BRANCHES.map((branchRow) => branchRow.branch);
  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>([
    [LIST_SPACING_VAULT_ID, resourceLinksOpen],
  ]);

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
        <VaultDashboardView
          deleteModeActive={false}
          developerToolsVisible={false}
          cloudflareWorkerRepairActionInFlight={null}
          isRemovingVault={false}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={FIXTURE_NOW}
          viewModel={{
            vaults: [LIST_SPACING_VAULT],
            repositoryInventoryStatesByVaultId: new Map([
              [LIST_SPACING_VAULT_ID, fixtureReadyRepositoryInventoryState()],
            ]),
            remoteBranchPagesByVaultId: new Map([
              [
                LIST_SPACING_VAULT_ID,
                {
                  remoteBranches: branches,
                  status: "Exhausted",
                  loadMore: ignoreFixtureLoadMore,
                  pullRequestFilter: null,
                },
              ],
            ]),
            stagedBranchSummariesByVaultId: new Map(),
          }}
          logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
          schemaGraphAccessEnabled
          rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          onConnectCloudflareGithubRepository={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onRepositoryInventoryFilterChange={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onResourceLinksOpenChange={(vaultId, nextOpen) => {
            if (vaultId === LIST_SPACING_VAULT_ID) {
              setResourceLinksOpen(nextOpen);
            }
          }}
          onSetCloudflareConvexDeployKeys={() => {}}
          onVerifyCloudflareInfrastructure={() => {}}
        />
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
          cloudflareWorkerRepairActionInFlight={null}
          isRemovingVault={false}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={FIXTURE_NOW}
          viewModel={{
            vaults: [CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT],
            repositoryInventoryStatesByVaultId: new Map([
              [CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID, { state: "empty" as const }],
            ]),
            remoteBranchPagesByVaultId: new Map(),
            stagedBranchSummariesByVaultId: new Map(),
          }}
          logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultResourceLinksOpenByVaultId={
            new Map([[CLOUDFLARE_BUILD_TRIGGER_MISSING_VAULT_ID, true]])
          }
          schemaGraphAccessEnabled={false}
          rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          onConnectCloudflareGithubRepository={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onRepositoryInventoryFilterChange={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onResourceLinksOpenChange={() => {}}
          onSetCloudflareConvexDeployKeys={() => {}}
          onVerifyCloudflareInfrastructure={() => {}}
        />
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardSidebarListFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  const selectedVaults = SIDEBAR_LIST_VAULTS.filter(
    (vault) => vault._id === SIDEBAR_LIST_SELECTED_VAULT_ID,
  );
  const branches = LIST_SPACING_BRANCHES.map((branchRow) => branchRow.branch);

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="h-dvh w-full bg-background text-foreground"
    >
      <FixtureDashboardShell
        leftContent={
          <RepositorySummaryDirectoryList
            entries={SIDEBAR_LIST_DIRECTORY_ENTRIES}
            error={null}
            loadMore={() => {}}
            now={FIXTURE_NOW}
            selectedVaultId={SIDEBAR_LIST_SELECTED_VAULT_ID}
            status="Exhausted"
          />
        }
        mainContent={
          <VaultDashboardView
            deleteModeActive={false}
            developerToolsVisible={false}
            cloudflareWorkerRepairActionInFlight={null}
            isRemovingVault={false}
            retryingDeletionRunId={null}
            retryingInfrastructureVaultId={null}
            now={FIXTURE_NOW}
            viewModel={{
              vaults: selectedVaults,
              repositoryInventoryStatesByVaultId: new Map([
                [SIDEBAR_LIST_SELECTED_VAULT_ID, fixtureReadyRepositoryInventoryState()],
              ]),
              remoteBranchPagesByVaultId: new Map([
                [
                  SIDEBAR_LIST_SELECTED_VAULT_ID,
                  {
                    remoteBranches: branches,
                    status: "Exhausted",
                    loadMore: ignoreFixtureLoadMore,
                    pullRequestFilter: null,
                  },
                ],
              ]),
              stagedBranchSummariesByVaultId: new Map(),
            }}
            logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
            replaceLogoRouteSearch={() => {}}
            openDeveloperToolsByVaultId={{}}
            persistedVaultResourceLinksOpenByVaultId={new Map()}
            schemaGraphAccessEnabled
            rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
            onConnectCloudflareGithubRepository={() => {}}
            onOpenDeveloperToolsChange={() => {}}
            onRepositoryInventoryFilterChange={() => {}}
            onRetryInfrastructureProvisioning={() => {}}
            onRetryVaultDeletion={() => {}}
            onResourceLinksOpenChange={() => {}}
            onSetCloudflareConvexDeployKeys={() => {}}
            onVerifyCloudflareInfrastructure={() => {}}
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
        <RepositorySummaryDirectoryPane
          entries={SIDEBAR_LIST_DIRECTORY_ENTRIES}
          error={null}
          loadMore={() => {}}
          now={FIXTURE_NOW}
          selectedVaultId={null}
          status="Exhausted"
        />
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
              branchSection={
                <div className="space-y-1.5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Branches
                  </p>
                  <div className="-mx-4 border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    main
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
  const deploymentId = fakeConvexDeploymentId();
  return {
    deployments: [
      {
        _id: deploymentId,
        appRoot: ".",
        deploymentName: "samebase-prod",
        projectSlug: "samebase",
        teamSlug: "samebase",
      },
    ],
    selectedDeploymentId: deploymentId,
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
            name: "vaultRepositoryInventories",
            source: "declared",
            documentCount: 18,
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
                path: "publication.snapshotId",
                kind: "Id<vaultRepositoryInventorySnapshots>",
                optional: true,
                source: "declared",
              },
              {
                path: "publication.defaultBranch",
                kind: "union",
                optional: true,
                source: "declared",
              },
              {
                path: "publication.checkedAt",
                kind: "number",
                optional: true,
                source: "declared",
              },
            ],
          },
          {
            name: "vaultInfrastructureOwnership",
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
            name: "appProvisioningRuns",
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
            name: "fileStaging",
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
            name: "agentThreadContext",
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
            id: "declared:vaultRepositoryInventories:vaultId:vaults",
            fromTable: "vaultRepositoryInventories",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:vaultInfrastructureOwnership:userId:users",
            fromTable: "vaultInfrastructureOwnership",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:appProvisioningRuns:vaultId:vaults",
            fromTable: "appProvisioningRuns",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:fileStaging:vaultId:vaults",
            fromTable: "fileStaging",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:fileStaging:lastEditUserId:users",
            fromTable: "fileStaging",
            fromField: "lastEditUserId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:agentThreadContext:userId:users",
            fromTable: "agentThreadContext",
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
      onDeploymentChange={() => {}}
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
        fixedAppRoot: "apps/atelier",
        id: fakeVaultId(),
        repositoryFullName: "samebase/atelier",
        repositoryName: "atelier",
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
          appRoot="."
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
          appRoot="."
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
            fixedAppRoot: ".",
            id: fakeVaultId(),
            repositoryFullName: "samebase/app",
            repositoryName: "samebase-app",
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
                repositoryFullName="noter-guest/tmp-manual-test"
                providerSetup={{
                  status: "failed",
                  provider: "cloudflare",
                  source: "managed",
                  runId: fakeProvisioningRunId(),
                  step: "attach_worker",
                  message:
                    "Cloudflare Workers and Pages GitHub App is not authorized for noter-guest/tmp-manual-test. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include noter-guest/tmp-manual-test, then retry.",
                  updatedAt: Date.parse("2026-06-24T12:00:00Z"),
                  nextAction: "retry_infrastructure_provisioning",
                }}
              />
            }
          />
        </VaultDashboardRepositoryList>
      </TestRouterProvider>
    </div>
  );
}

function VaultDashboardStickyHeaderFixture() {
  const [resourceLinksOpen, setResourceLinksOpen] = useState(false);
  const stickyHeaderBranches = STICKY_HEADER_BRANCHES.map((branchRow) => branchRow.branch);

  return (
    <FixtureDashboardShell
      rightContent={
        <VaultDashboardSidebarContent>
          <div className="mt-auto">
            <AppSidebarMetaSection linkAlignment="left" />
          </div>
        </VaultDashboardSidebarContent>
      }
      mainContent={
        <div className="py-8">
          <VaultDashboardRepositoryList>
            <VaultDashboardRepositoryCard
              isReady={true}
              repositoryName="samebase"
              repositoryLinks={<FixtureRepositoryLinks />}
              repositoryLinksOpen={resourceLinksOpen}
              onRepositoryLinksOpenChange={setResourceLinksOpen}
              topRightAction={<FixtureDeleteControl />}
              repositoryStatus={<span data-testid="sticky-header-status">Updated 12s ago</span>}
              branchSection={
                <VaultBranchSection
                  defaultBranchName="main"
                  loadMore={ignoreFixtureLoadMore}
                  paginationStatus="Exhausted"
                  repositoryFullName="samebase/samebase"
                  remoteBranches={stickyHeaderBranches}
                  schemaGraphAccessEnabled={false}
                  stagedSummaries={[]}
                  vaultId={fakeVaultId()}
                />
              }
            />
          </VaultDashboardRepositoryList>
        </div>
      }
    />
  );
}

function VaultDashboardLargeBranchListFixture() {
  const [loadedBranchCount, setLoadedBranchCount] = useState(LARGE_BRANCH_INITIAL_PAGE_SIZE);
  const [loadMoreCallCount, setLoadMoreCallCount] = useState(0);
  const loadMoreLargeBranches = useCallback((numItems: number) => {
    setLoadMoreCallCount((currentCount) => currentCount + 1);
    setLoadedBranchCount((currentCount) => Math.min(currentCount + numItems, LARGE_BRANCH_COUNT));
  }, []);
  const loadedLargeBranches = LARGE_BRANCHES.slice(0, loadedBranchCount);
  const paginationStatus = loadedBranchCount < LARGE_BRANCH_COUNT ? "CanLoadMore" : "Exhausted";

  return (
    <FixtureDashboardShell
      rightContent={
        <VaultDashboardSidebarContent>
          <div className="mt-auto">
            <AppSidebarMetaSection linkAlignment="left" />
          </div>
        </VaultDashboardSidebarContent>
      }
      mainContent={
        <div className="py-8">
          <div
            data-testid="large-branch-pagination-fixture"
            data-loaded-branch-count={loadedBranchCount}
            data-load-more-call-count={loadMoreCallCount}
            data-total-branch-count={LARGE_BRANCH_COUNT}
          >
            <VaultDashboardRepositoryList>
              <VaultDashboardRepositoryCard
                isReady={true}
                repositoryName="samebase"
                repositoryLinks={<FixtureRepositoryLinks />}
                repositoryLinksOpen={false}
                onRepositoryLinksOpenChange={() => {}}
                topRightAction={<FixtureDeleteControl />}
                branchSection={
                  <VaultBranchSection
                    defaultBranchName="main"
                    loadMore={loadMoreLargeBranches}
                    paginationStatus={paginationStatus}
                    repositoryFullName="samebase/samebase"
                    remoteBranches={loadedLargeBranches}
                    schemaGraphAccessEnabled={false}
                    stagedSummaries={[]}
                    vaultId={fakeVaultId()}
                  />
                }
              />
            </VaultDashboardRepositoryList>
          </div>
        </div>
      }
    />
  );
}

function VaultPullRequestFiltersFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  const [filters, setFilters] = useState<RepositoryInventoryFilters>(() => ({
    ...PULL_REQUEST_FILTER_INITIAL_VALUE,
    hiddenLabels: [...PULL_REQUEST_FILTER_INITIAL_VALUE.hiddenLabels],
  }));
  const hiddenLabelKeys = new Set(filters.hiddenLabels.map((name) => name.trim().toLowerCase()));
  const visibleRows = PULL_REQUEST_FILTER_ROWS.filter((row) => {
    if (row.kind === "branch") {
      return true;
    }
    if (!filters.includeDrafts && row.pullRequestIsDraft) {
      return false;
    }
    const labelKeys = row.pullRequestLabels.map((label) =>
      (typeof label === "string" ? label : label.name).trim().toLowerCase(),
    );
    if (labelKeys.length === 0) {
      return filters.includeNoLabel;
    }
    return !labelKeys.some((labelKey) => hiddenLabelKeys.has(labelKey));
  });
  const visiblePullRequestCount = visibleRows.filter((row) => row.kind === "pull_request").length;
  const options = buildPullRequestFilterOptions({
    labelFacets: PULL_REQUEST_FILTER_LABEL_FACETS,
    hiddenLabels: filters.hiddenLabels,
    includeNoLabel: filters.includeNoLabel,
    noLabelPullRequestCount: 1,
  });

  return (
    <div className="min-h-screen bg-stone-100 p-4 text-foreground">
      <div
        data-testid="vault-dashboard-visual-fixture"
        data-mode={mode}
        data-visible-pull-request-count={visiblePullRequestCount}
        className="mx-auto w-full max-w-[720px]"
      >
        <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryName="samebase"
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
            headerControls={
              <VaultPullRequestHeaderControls
                filters={filters}
                onChangeFilters={setFilters}
                options={options}
                totalPullRequestCount={PULL_REQUEST_FILTER_TOTAL_COUNT}
                visiblePullRequestCount={visiblePullRequestCount}
                isApplying={false}
              />
            }
            branchSection={
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                  Branches and pull requests
                </p>
                <div className="-mx-4 overflow-hidden border bg-muted">
                  {visibleRows.map((row) => (
                    <VaultBranchLinkRow
                      key={row.rowKey}
                      vaultId={fakeVaultId()}
                      repositoryFullName="samebase/samebase"
                      defaultBranchName="main"
                      branch={row}
                    />
                  ))}
                </div>
              </div>
            }
          />
        </TestRouterProvider>
      </div>
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

  if (mode === "vault-dashboard-sticky-header") {
    return <VaultDashboardStickyHeaderFixture />;
  }

  if (mode === "vault-dashboard-large-branch-list") {
    return <VaultDashboardLargeBranchListFixture />;
  }

  if (mode === "vault-pull-request-filters") {
    return <VaultPullRequestFiltersFixture mode={mode} />;
  }

  if (mode === "vault-branch-mobile-alignment") {
    return (
      <div
        data-testid="vault-dashboard-visual-fixture"
        data-mode={mode}
        className="flex w-full justify-center bg-stone-100 p-4 text-foreground"
      >
        <div className="mx-auto w-full max-w-[390px] corner-notch-1 border border-border bg-background">
          <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
            <VaultDashboardRepositoryCard
              isReady={true}
              repositoryName="samebase"
              repositoryLinksOpen={false}
              onRepositoryLinksOpenChange={() => {}}
              topRightAction={<FixtureDeleteControl />}
              repositoryStatus={<span>Updated 12s ago</span>}
              branchSection={
                <div className="space-y-1.5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Branches
                  </p>
                  <div className="-mx-4 overflow-hidden border bg-muted">
                    <VaultBranchLinkRow
                      vaultId={fakeVaultId()}
                      repositoryFullName="samebase/samebase"
                      defaultBranchName="main"
                      branch={fixtureVaultBranch({
                        kind: "branch",
                        name: "main",
                        headCommit: { sha: "1234567890abcdef1234567890abcdef12345678" },
                        isDefault: true,
                      })}
                      productionApps={[
                        {
                          appRoot: ".",
                          links: [
                            {
                              href: "https://dashboard.convex.dev/t/nicu/samebase/calm-swan-123",
                              label: "Production: calm-swan-123",
                              provider: "convex",
                              title: "Open production Convex deployment calm-swan-123",
                            },
                          ],
                        },
                      ]}
                    />
                    <VaultBranchLinkRow
                      vaultId={fakeVaultId()}
                      repositoryFullName="samebase/samebase"
                      defaultBranchName="main"
                      branch={fixtureVaultBranch({
                        kind: "pull_request",
                        name: "codex/mobile-branch-card-spacing",
                        headCommit: { sha: "abcdef1234567890abcdef1234567890abcdef12" },
                        isDefault: false,
                        pullRequestUrl: "https://github.com/samebase/samebase/pull/321",
                        pullRequestNumber: 321,
                        pullRequestTitle: "Align mobile branch rows with vault cards",
                      })}
                    />
                  </div>
                </div>
              }
            />
          </TestRouterProvider>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="inline-flex bg-background p-3 text-foreground"
    >
      <div className="w-[560px] corner-notch-1 border border-border bg-background">
        <TestRouterProvider>
          <VaultBranchLinkRow
            vaultId={fakeVaultId()}
            repositoryFullName="octo/repo"
            defaultBranchName="main"
            branch={fixtureVaultBranch({
              kind: "pull_request",
              name: "feature/pr-labels",
              headCommit: { sha: "1234567890abcdef1234567890abcdef12345678" },
              isDefault: false,
              githubRepositoryFullName: "octo/repo",
              pullRequestUrl: "https://github.com/octo/repo/pull/42",
              pullRequestNumber: 42,
              pullRequestTitle: "Keep every pull request field visible",
              pullRequestLabels: [
                { name: "needs review", color: "fbca04" },
                { name: "bug", color: "d73a4a" },
              ],
            })}
          />
          <VaultBranchLinkRow
            vaultId={fakeVaultId()}
            repositoryFullName="octo/repo"
            defaultBranchName="main"
            branch={fixtureVaultBranch({
              kind: "pull_request",
              name: "contributor/fork-fix",
              headCommit: { sha: "234567890abcdef1234567890abcdef123456789" },
              isDefault: false,
              githubRepositoryFullName: "contributor/octo-fork",
              canOpenInSamebase: false,
              pullRequestUrl: "https://github.com/octo/repo/pull/43",
              pullRequestNumber: 43,
              pullRequestTitle: "Ship the release fix from a fork",
              pullRequestBaseRefName: "release",
              pullRequestIsCrossRepository: true,
              pullRequestAdditions: 48,
              pullRequestDeletions: 9,
              pullRequestChangedFiles: 5,
            })}
          />
          <VaultBranchLinkRow
            vaultId={fakeVaultId()}
            repositoryFullName="octo/repo"
            defaultBranchName="main"
            branch={fixtureVaultBranch({
              kind: "pull_request",
              name: "feature/unavailable-comparison",
              headCommit: { sha: "34567890abcdef1234567890abcdef1234567890" },
              isDefault: false,
              githubRepositoryFullName: "octo/repo",
              comparison: { state: "unavailable", reason: "not_comparable" },
              pullRequestUrl: "https://github.com/octo/repo/pull/44",
              pullRequestNumber: 44,
              pullRequestTitle: "Keep missing comparisons explicit",
              pullRequestAdditions: 3,
              pullRequestDeletions: 1,
              pullRequestChangedFiles: 1,
            })}
          />
        </TestRouterProvider>
      </div>
    </div>
  );
}
