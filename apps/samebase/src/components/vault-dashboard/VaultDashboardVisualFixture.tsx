import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useState, type ReactNode } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultLastUpdatedStatus } from "@/components/vault-dashboard/VaultLastUpdatedStatus";
import { VaultBranchFiltersControl } from "@/components/vault-dashboard/VaultBranchFilters";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardScrollTargetEndPadding,
  VaultDashboardSidebarContent,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { VaultProvisioningLogViewer } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import { buildVaultBranchSectionState } from "@/components/vault-dashboard/VaultDashboardBranchSectionState";
import {
  VaultBranchHeaderControls,
  VaultBranchLinkRow,
  VaultDashboardBody,
  VaultDashboardAppRootDialog,
  VaultDashboardCloudflareDialog,
  VaultDashboardConvexDialog,
  VaultDashboardDeleteControl,
  VaultDashboardDeleteDialog,
  VaultDashboardRepositoryExternalLinks,
  type VaultDeleteDialogTarget,
  type VaultDashboardVault,
  VaultSetupProgressSection,
} from "@/components/vault-dashboard/VaultDashboard";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import {
  getDefaultVaultBranchFilters,
  type VaultBranchFilters,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";
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
  | "vault-dashboard-provisioning-log"
  | "vault-dashboard-bottom-target-scroll"
  | "vault-dashboard-sticky-header"
  | "vault-dashboard-list-spacing"
  | "vault-last-updated-status"
  | "vault-branch-filters"
  | "vault-branch-pr-labels"
  | "vault-branch-mobile-alignment";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");
const FIXTURE_ROOT_ROUTE_SEARCH = validateRootRouteSearch({});

type FixtureRefreshCountState = {
  refreshCount: number;
};
type FixtureBranchExpansionState = {
  branchesExpanded: boolean;
};

const FIXTURE_REFRESH_COUNT_INITIAL_STATE: FixtureRefreshCountState = {
  refreshCount: 0,
};
const FIXTURE_BRANCH_EXPANSION_INITIAL_STATE: FixtureBranchExpansionState = {
  branchesExpanded: false,
};

function useFixtureRefreshCountStore() {
  return useCreateStore(FIXTURE_REFRESH_COUNT_INITIAL_STATE, ({ setState }) => ({
    incrementRefreshCount: () => {
      setState((state) => ({
        ...state,
        refreshCount: state.refreshCount + 1,
      }));
    },
  }));
}

function useFixtureBranchExpansionStore() {
  return useCreateStore(FIXTURE_BRANCH_EXPANSION_INITIAL_STATE, ({ setState }) => ({
    toggleBranchesExpanded: () => {
      setState((state) => ({
        ...state,
        branchesExpanded: !state.branchesExpanded,
      }));
    },
  }));
}

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

const FIXTURE_CLOUDFLARE_WORKERS = [
  {
    workerName: "app-start-workers",
    workerTag: "72dc5c8bc9104b20af13ac36dcdbe9d1",
  },
  {
    workerName: "app-workers",
    workerTag: "c2f8194c2c7047a6991a736d8f708aaf",
  },
  {
    workerName: "nicu-chiciuc-samebase-86xc0t",
    workerTag: "70d0ab9620b44d7b99a9964cde102887",
  },
  {
    workerName: "samebase-worker",
    workerTag: "f832053cb31b46f0bff56f70b8c9b57e",
  },
  {
    workerName: "tmp-flow-123",
    workerTag: "f19375e848d44311ae35716d8ab0c59f",
  },
  {
    workerName: "tmp-flow-1234",
    workerTag: "62b44171ee3f41de80bfaf42a90cf8d7",
  },
  {
    workerName: "tmp-my-asdf-app",
    workerTag: "476a67f8258f4fa3bdd3e73cf825c3a5",
  },
  {
    workerName: "tmp-my-first",
    workerTag: "2f44c6d9c45e451ea825f52774a7f583",
  },
  {
    workerName: "tmp-something",
    workerTag: "9c0c2d7cfdce4d4480f6e043b2e9f11d",
  },
  {
    workerName: "tsx-tsx-md",
    workerTag: "abcb6778514d4e58b6f9a747d92f9234",
  },
];

type FixtureVaultBranch = Parameters<typeof VaultBranchLinkRow>[0]["branch"];

interface FixtureVaultBranchRow {
  branch: FixtureVaultBranch;
}

function fixtureVaultBranch(
  branch: Omit<FixtureVaultBranch, "isProtected" | "lastSyncedAt" | "remoteState"> & {
    remoteState?: FixtureVaultBranch["remoteState"];
  },
): FixtureVaultBranch {
  return {
    isProtected: false,
    lastSyncedAt: FIXTURE_NOW,
    remoteState: "active",
    ...branch,
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
      repositoryHashId="samebase"
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

function FixtureVaultLastUpdatedStatusCard() {
  const refreshCountStore = useFixtureRefreshCountStore();
  const refreshCount = useSelector(refreshCountStore, (state) => state.refreshCount);
  const { incrementRefreshCount } = refreshCountStore.actions;

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode="vault-last-updated-status"
      data-refresh-count={refreshCount}
      className="mx-auto w-full max-w-[360px]"
    >
      <div className="relative corner-notch-1 border p-4">
        <div className="space-y-3">
          <div className="flex flex-col items-start pr-10">
            <h3 className="min-w-0 font-semibold">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate">
                  <span className="font-normal text-muted-foreground">samebase/</span>
                  <span>samebase</span>
                </span>
              </span>
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <VaultLastUpdatedStatus
                lastSyncedAt={FIXTURE_NOW - 12_000}
                now={FIXTURE_NOW}
                onRefresh={incrementRefreshCount}
                repositoryFullName="samebase/samebase"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LIST_SPACING_BRANCHES: FixtureVaultBranchRow[] = [
  {
    branch: fixtureVaultBranch({
      name: "main",
      headCommitSha: "1234567890abcdef1234567890abcdef12345678",
      isDefault: true,
      aheadBy: 0,
      behindBy: 0,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/dashboard-main-pane-spacing",
      headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
      isDefault: false,
      aheadBy: 1,
      behindBy: 0,
      pullRequestUrl: "https://github.com/samebase/samebase/pull/321",
      pullRequestNumber: 321,
      pullRequestTitle: "Use the full dashboard main pane",
      cloudflareBranchPreviewUrl: "https://codex-dashboard-main-pane-spacing.samebase.pages.dev",
      cloudflarePreviewPullRequestNumber: 321,
      convexPreviewDeploymentDashboardUrl:
        "https://dashboard.convex.dev/t/nicu/samebase/preview/codex/dashboard-main-pane-spacing",
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/branch-expansion-state",
      headCommitSha: "456789abcdef1234567890abcdef1234567890ab",
      isDefault: false,
      aheadBy: 2,
      behindBy: 0,
      pullRequestUrl: "https://github.com/samebase/samebase/pull/322",
      pullRequestNumber: 322,
      pullRequestTitle: "Persist branch list expansion",
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/quiet-mobile-frame",
      headCommitSha: "789abcdef1234567890abcdef1234567890abcd",
      isDefault: false,
      aheadBy: 1,
      behindBy: 1,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/research-branch-collapse",
      headCommitSha: "def1234567890abcdef1234567890abcdef12345",
      isDefault: false,
      aheadBy: 0,
      behindBy: 2,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/mobile-keyboard-lift",
      headCommitSha: "f1234567890abcdef1234567890abcdef1234567",
      isDefault: false,
      aheadBy: 1,
      behindBy: 0,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/preview-status-refresh",
      headCommitSha: "a234567890abcdef1234567890abcdef12345678",
      isDefault: false,
      aheadBy: 0,
      behindBy: 1,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/branch-cleanup-guard",
      headCommitSha: "b34567890abcdef1234567890abcdef123456789",
      isDefault: false,
      aheadBy: 2,
      behindBy: 0,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/archive-doc-taxonomy",
      headCommitSha: "c4567890abcdef1234567890abcdef1234567890",
      isDefault: false,
      aheadBy: 1,
      behindBy: 3,
    }),
  },
  {
    branch: fixtureVaultBranch({
      name: "codex/vault-filter-polish",
      headCommitSha: "d567890abcdef1234567890abcdef12345678901",
      isDefault: false,
      aheadBy: 0,
      behindBy: 2,
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
  appRoots: [{ appRoot: "apps/domain-router" }, { appRoot: "apps/samebase" }],
  cloudflareWorkers: [
    {
      appRoot: "apps/domain-router",
      workerName: "domain-router",
      workersDevUrl: "https://domain-router.nicu.workers.dev",
      projectDashboardUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/domain-router/production/deployments",
    },
    {
      appRoot: "apps/samebase",
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
      projectSettingsDashboardUrl: "https://dashboard.convex.dev/t/nicu/samebase/settings",
      deploymentDashboardUrl: "https://dashboard.convex.dev/t/nicu/samebase/calm-swan-123",
    },
  ],
  remoteBranches: LIST_SPACING_BRANCHES.map((branchRow) => branchRow.branch),
} satisfies VaultDashboardVault;

const STICKY_HEADER_BRANCHES: FixtureVaultBranchRow[] = Array.from({ length: 32 }, (_, index) => ({
  branch: fixtureVaultBranch({
    name: index === 0 ? "main" : `codex/sticky-dashboard-branch-${String(index).padStart(2, "0")}`,
    headCommitSha: "1234567890abcdef1234567890abcdef12345678",
    isDefault: index === 0,
    aheadBy: index === 0 ? 0 : index % 4,
    behindBy: index === 0 ? 0 : index % 3,
    pullRequestLabels:
      index > 0 && index % 7 === 0 ? [{ name: "hidden", color: "#6f42c1" }] : undefined,
  }),
}));

function VaultDashboardListSpacingFixture({ mode }: { mode: VaultDashboardVisualMode }) {
  const [vaultBranchFilters, setVaultBranchFilters] = useState(() =>
    getDefaultVaultBranchFilters(),
  );
  const [resourceLinksOpen, setResourceLinksOpen] = useState(false);
  const persistedVaultBranchFiltersByVaultId = new Map<string, VaultBranchFilters>([
    [LIST_SPACING_VAULT_ID, vaultBranchFilters],
  ]);
  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>([
    [LIST_SPACING_VAULT_ID, resourceLinksOpen],
  ]);

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardBody
          developerToolsVisible={false}
          isRemovingVault={false}
          retryingDeletionRunId={null}
          now={FIXTURE_NOW}
          logoRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultBranchFiltersByVaultId={persistedVaultBranchFiltersByVaultId}
          persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
          locationHash=""
          rootRouteSearch={FIXTURE_ROOT_ROUTE_SEARCH}
          vaults={[LIST_SPACING_VAULT]}
          onOpenDeveloperToolsChange={() => {}}
          onManualRepositoryRefresh={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultBranchFilters={(vaultId, nextVaultBranchFilters) => {
            if (vaultId === LIST_SPACING_VAULT_ID) {
              setVaultBranchFilters(nextVaultBranchFilters);
            }
          }}
          onResourceLinksOpenChange={(vaultId, nextOpen) => {
            if (vaultId === LIST_SPACING_VAULT_ID) {
              setResourceLinksOpen(nextOpen);
            }
          }}
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
              repositoryOwner="samebase"
              repositoryName="samebase"
              titleHref="https://github.com/samebase/samebase"
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
            repositoryOwner="samebase"
            repositoryName="samebase"
            titleHref="https://github.com/samebase/samebase"
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
            repositoryOwner="samebase"
            repositoryName="atelier"
            titleHref="https://github.com/samebase/atelier"
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
            repositoryOwner="samebase"
            repositoryName="samebase"
            titleHref="https://github.com/samebase/samebase"
            repositoryLinks={<FixtureRepositoryLinks />}
            repositoryLinksOpen={false}
            onRepositoryLinksOpenChange={() => {}}
            topRightAction={<FixtureDeleteControl />}
            repositoryStatus={<span>Updated 12s ago</span>}
          />
        </VaultDashboardRepositoryList>
        <VaultDashboardAppRootDialog
          appRoot=""
          error={null}
          isSubmitting={false}
          mode="monorepo"
          onAppRootChange={() => {}}
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
            repositoryOwner="samebase"
            repositoryName="atelier"
            titleHref="https://github.com/samebase/atelier"
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
              repositoryOwner="samebase"
              repositoryName="atelier"
              titleHref="https://github.com/samebase/atelier"
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
            repositoryOwner="samebase"
            repositoryName="samebase-app"
            titleHref="https://github.com/samebase/app"
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
            repositoryOwner="samebase"
            repositoryName="samebase-app"
            titleHref="https://github.com/samebase/app"
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
                        step: "ensure_convex",
                        message:
                          'API Convex POST /teams/{team_id}/create_project values={"body":{"deploymentType":"prod","projectName":"[redacted]"},"params":{"path":{"team_id":"[redacted]"}}}',
                      },
                      {
                        createdAt: Date.parse("2026-05-02T12:30:08Z"),
                        level: "info",
                        step: "ensure_cloudflare",
                        message:
                          'API Cloudflare POST /accounts/{account_id}/workers/workers values={"body":{"logpush":false,"name":"[redacted]","observability":{"enabled":true,"head_sampling_rate":1},"subdomain":{"enabled":true,"previews_enabled":true}},"params":{"path":{"account_id":"[redacted]"}}}',
                      },
                      {
                        createdAt: Date.parse("2026-05-02T12:30:10Z"),
                        level: "info",
                        step: "ensure_cloudflare",
                        message:
                          'API Cloudflare PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables values={"body":{"PROD_CONVEX_DEPLOY_KEY":"[secret]","VITE_CONVEX_URL":{"is_secret":"[secret]","value":"[redacted]"}},"params":{"path":{"account_id":"[redacted]","trigger_uuid":"[redacted]"}}}',
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
            repositoryOwner="samebase"
            repositoryName="samebase-app"
            titleHref="https://github.com/samebase/app"
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
                      step: "ensure_convex",
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

function VaultDashboardBottomTargetScrollFixture() {
  const repositoryNames = [
    "samebase-alpha",
    "samebase-beta",
    "samebase-gamma",
    "samebase-delta",
    "samebase-bottom-target",
  ];
  const bottomTargetBranches = [
    {
      branch: fixtureVaultBranch({
        name: "main",
        headCommitSha: "1234567890abcdef1234567890abcdef12345678",
        isDefault: true,
        aheadBy: 0,
        behindBy: 0,
      }),
    },
    {
      branch: fixtureVaultBranch({
        name: "codex/bottom-target-last-branch",
        headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
        isDefault: false,
        aheadBy: 2,
        behindBy: 0,
      }),
    },
  ] satisfies FixtureVaultBranchRow[];

  return (
    <FixtureDashboardShell
      mainContent={
        <div className="py-8">
          <VaultDashboardRepositoryList>
            {repositoryNames.map((repositoryName) => (
              <div
                key={repositoryName}
                data-testid={
                  repositoryName === "samebase-bottom-target"
                    ? "vault-dashboard-bottom-target-card"
                    : undefined
                }
              >
                <VaultDashboardRepositoryCard
                  isReady={true}
                  repositoryOwner="samebase"
                  repositoryName={repositoryName}
                  titleHref={`https://github.com/samebase/${repositoryName}`}
                  repositoryLinks={<FixtureRepositoryLinks />}
                  repositoryLinksOpen={false}
                  onRepositoryLinksOpenChange={() => {}}
                  repositoryStatus={<span>Updated 12s ago</span>}
                  topRightAction={<FixtureDeleteControl />}
                  branchSection={
                    repositoryName === "samebase-bottom-target" ? (
                      <div className="space-y-1.5">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                          Branches
                        </p>
                        <div className="-mx-4 overflow-hidden border bg-muted">
                          {bottomTargetBranches.map((branchRow) => (
                            <VaultBranchLinkRow
                              key={branchRow.branch.name}
                              vaultId={fakeVaultId()}
                              repositoryFullName="samebase/samebase-bottom-target"
                              branch={branchRow.branch}
                            />
                          ))}
                        </div>
                      </div>
                    ) : undefined
                  }
                />
              </div>
            ))}
            <VaultDashboardScrollTargetEndPadding />
          </VaultDashboardRepositoryList>
        </div>
      }
    />
  );
}

function VaultDashboardStickyHeaderFixture() {
  const branchExpansionStore = useFixtureBranchExpansionStore();
  const branchesExpanded = useSelector(branchExpansionStore, (state) => state.branchesExpanded);
  const { toggleBranchesExpanded } = branchExpansionStore.actions;
  const stickyHeaderBranches = STICKY_HEADER_BRANCHES.map((branchRow) => branchRow.branch);
  const stickyHeaderFilters = {
    hiddenLabels: ["hidden"],
    includeDrafts: false,
    includeNoLabel: true,
    branchesExpanded,
  } satisfies VaultBranchFilters;
  const branchSectionState = buildVaultBranchSectionState({
    filters: stickyHeaderFilters,
    remoteBranches: stickyHeaderBranches,
  });

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
              repositoryOwner="samebase"
              repositoryName="samebase"
              titleHref="https://github.com/samebase/samebase"
              repositoryLinks={<FixtureRepositoryLinks />}
              repositoryLinksOpen={false}
              onRepositoryLinksOpenChange={() => {}}
              topRightAction={<FixtureDeleteControl />}
              repositoryStatus={<span data-testid="sticky-header-status">Updated 12s ago</span>}
              headerControls={
                <VaultBranchHeaderControls
                  filteredBranchCount={branchSectionState.filteredRemoteBranches.length}
                  filterOptions={branchSectionState.filterOptions}
                  filters={stickyHeaderFilters}
                  hiddenBranchCount={branchSectionState.hiddenBranchCount}
                  onChangeFilters={() => {}}
                  remoteBranchCount={stickyHeaderBranches.length}
                  expansion={
                    branchSectionState.hasBranchListOverflow
                      ? {
                          hiddenBranchCount: branchSectionState.collapsedBranchCount,
                          isExpanded: branchesExpanded,
                          onToggle: toggleBranchesExpanded,
                          placement: "header",
                        }
                      : undefined
                  }
                />
              }
              branchSection={
                <div className="-mx-4 overflow-hidden border bg-muted">
                  {branchSectionState.visibleRemoteBranches.map((branch) => (
                    <VaultBranchLinkRow
                      key={branch.name}
                      vaultId={fakeVaultId()}
                      repositoryFullName="samebase/samebase"
                      branch={branch}
                    />
                  ))}
                </div>
              }
            />
          </VaultDashboardRepositoryList>
        </div>
      }
    />
  );
}

function FixtureDashboardShell({
  mainContent,
  rightContent,
}: {
  mainContent?: ReactNode;
  rightContent?: ReactNode;
}) {
  return (
    <TestRouterProvider>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId="vault-dashboard-visual-fixture"
        shortcutPaneSide="right"
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

  if (mode === "vault-dashboard-provisioning-log") {
    return <VaultDashboardProvisioningLogFixture />;
  }

  if (mode === "vault-dashboard-bottom-target-scroll") {
    return <VaultDashboardBottomTargetScrollFixture />;
  }

  if (mode === "vault-last-updated-status") {
    return (
      <div className="min-h-screen bg-stone-100 p-4 text-foreground">
        <FixtureVaultLastUpdatedStatusCard />
      </div>
    );
  }

  if (mode === "vault-dashboard-list-spacing") {
    return <VaultDashboardListSpacingFixture mode={mode} />;
  }

  if (mode === "vault-dashboard-sticky-header") {
    return <VaultDashboardStickyHeaderFixture />;
  }

  if (mode === "vault-branch-mobile-alignment") {
    return (
      <div
        data-testid="vault-dashboard-visual-fixture"
        data-mode={mode}
        className="flex w-full justify-center bg-stone-100 p-4 text-foreground"
      >
        <div className="mx-auto w-full max-w-[390px] corner-notch-1 border border-border bg-background">
          <TestRouterProvider>
            <VaultDashboardRepositoryCard
              isReady={true}
              repositoryOwner="samebase"
              repositoryName="samebase"
              titleHref="https://github.com/samebase/samebase"
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
                      branch={fixtureVaultBranch({
                        name: "main",
                        headCommitSha: "1234567890abcdef1234567890abcdef12345678",
                        isDefault: true,
                        aheadBy: 0,
                        behindBy: 0,
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
                      branch={fixtureVaultBranch({
                        name: "codex/mobile-branch-card-spacing",
                        headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
                        isDefault: false,
                        aheadBy: 2,
                        behindBy: 0,
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

  if (mode === "vault-branch-filters") {
    return (
      <div className="min-h-screen bg-stone-100 p-4 text-foreground">
        <div
          data-testid="vault-dashboard-visual-fixture"
          data-mode={mode}
          className="mx-auto w-full max-w-[720px]"
        >
          <div className="corner-notch-1 border border-border bg-background p-4">
            <div className="space-y-3">
              <div>
                <div className="text-lg font-semibold">
                  <span className="font-normal text-muted-foreground">samebase/</span>
                  <span>samebase</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Updated 12s ago</div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Branches
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground/80">1 of 4</span>
                    <VaultBranchFiltersControl
                      value={{
                        hiddenLabels: ["research"],
                        includeDrafts: false,
                        includeNoLabel: false,
                        branchesExpanded: false,
                      }}
                      options={[
                        {
                          key: "customer",
                          name: "customer",
                          color: "#1a7f37",
                          count: 1,
                          included: true,
                          isNoLabel: false,
                        },
                        {
                          key: "needs review",
                          name: "needs review",
                          color: "#bf8700",
                          count: 1,
                          included: true,
                          isNoLabel: false,
                        },
                        {
                          key: "research",
                          name: "research",
                          color: "#0969da",
                          count: 1,
                          included: false,
                          isNoLabel: false,
                        },
                        {
                          key: "\u0000no-label",
                          name: "No label",
                          count: 1,
                          included: false,
                          isNoLabel: true,
                        },
                      ]}
                      onChange={() => {}}
                    />
                  </div>
                </div>
                <div className="-mx-4 overflow-hidden border bg-muted">
                  <TestRouterProvider>
                    <VaultBranchLinkRow
                      vaultId={fakeVaultId()}
                      repositoryFullName="samebase/samebase"
                      branch={fixtureVaultBranch({
                        name: "codex/branch-filters",
                        headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
                        isDefault: false,
                        aheadBy: 1,
                        behindBy: 0,
                        pullRequestUrl: "https://github.com/samebase/samebase/pull/321",
                        pullRequestNumber: 321,
                        pullRequestTitle: "Ship saved branch filters per vault",
                        pullRequestLabels: [
                          { name: "needs review", color: "bf8700" },
                          { name: "customer", color: "1a7f37" },
                        ],
                      })}
                    />
                  </TestRouterProvider>
                </div>
              </div>
            </div>
          </div>
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
            branch={fixtureVaultBranch({
              name: "feature/pr-labels",
              headCommitSha: "1234567890abcdef1234567890abcdef12345678",
              isDefault: false,
              aheadBy: 3,
              behindBy: 1,
              pullRequestUrl: "https://github.com/octo/repo/pull/42",
              pullRequestNumber: 42,
              pullRequestLabels: [
                { name: "needs review", color: "fbca04" },
                { name: "bug", color: "d73a4a" },
              ],
            })}
          />
        </TestRouterProvider>
      </div>
    </div>
  );
}
