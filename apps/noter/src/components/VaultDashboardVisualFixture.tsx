import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultLastUpdatedStatus } from "@/components/VaultLastUpdatedStatus";
import { VaultBranchFiltersControl } from "@/components/VaultBranchFilters";
import { ChevronDownIcon, GitHubLogoIcon } from "@/lib/radixIcons";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { type MobileSidebarPane } from "@/hooks/use-sidebar";
import {
  VaultDashboardAccountSection,
  VaultDashboardEmptyState,
  VaultDashboardProvidersSection,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardSidebarContent,
} from "@/components/VaultDashboardChrome";
import {
  VaultBranchLinkRow,
  VaultDashboardRepositoryExternalLinks,
} from "@/components/VaultDashboard";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";

export type VaultDashboardVisualMode =
  | "vault-create-control"
  | "vault-dashboard-list-spacing"
  | "vault-last-updated-status"
  | "vault-branch-filters"
  | "vault-branch-pr-labels"
  | "vault-branch-mobile-alignment"
  | "vault-sidebar-account-clamp"
  | "vault-sidebar-account-mobile-min"
  | "vault-sidebar-machine-links";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");

function fakeVaultId(): Parameters<typeof VaultBranchLinkRow>[0]["vaultId"] {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function FixtureRepositoryLinks() {
  return (
    <VaultDashboardRepositoryExternalLinks
      repositoryFullName="noter-md/noter"
      links={[
        {
          href: "https://github.com/noter-md/noter",
          key: "github",
          label: "GitHub",
          title: "Open GitHub repository",
        },
        {
          href: "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter",
          key: "cloudflare",
          label: "Cloudflare",
          title: "Open Cloudflare Pages project",
        },
        {
          href: "https://dashboard.convex.dev/d/calm-swan-123/deployment",
          key: "convex",
          label: "Convex deploy",
          title: "Open specific Convex deployment dashboard",
        },
      ]}
    />
  );
}

function FixtureVaultLastUpdatedStatusCard() {
  const [refreshCount, setRefreshCount] = useState(0);

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
                  <span className="font-normal text-muted-foreground">
                    noter-md/
                  </span>
                  <span>noter</span>
                </span>
              </span>
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <VaultLastUpdatedStatus
                lastSyncedAt={FIXTURE_NOW - 12_000}
                now={FIXTURE_NOW}
                onRefresh={() => {
                  setRefreshCount((count) => count + 1);
                }}
                repositoryFullName="noter-md/noter"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LIST_SPACING_BRANCHES: Array<
  Omit<
    Parameters<typeof VaultBranchLinkRow>[0],
    "vaultId" | "repositoryFullName" | "isDeletingBranch" | "onDeleteBranch"
  >
> = [
  {
    branchName: "main",
    headCommitSha: "1234567890abcdef1234567890abcdef12345678",
    isDefault: true,
    isDeletedUpstream: false,
    aheadBy: 0,
    behindBy: 0,
    canDeleteBranch: false,
  },
  {
    branchName: "codex/dashboard-main-pane-spacing",
    headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
    isDefault: false,
    isDeletedUpstream: false,
    aheadBy: 1,
    behindBy: 0,
    pullRequestUrl: "https://github.com/noter-md/noter/pull/321",
    pullRequestNumber: 321,
    pullRequestTitle: "Use the full dashboard main pane",
    canDeleteBranch: true,
  },
  {
    branchName: "codex/branch-expansion-state",
    headCommitSha: "456789abcdef1234567890abcdef1234567890ab",
    isDefault: false,
    isDeletedUpstream: false,
    aheadBy: 2,
    behindBy: 0,
    pullRequestUrl: "https://github.com/noter-md/noter/pull/322",
    pullRequestNumber: 322,
    pullRequestTitle: "Persist branch list expansion",
    canDeleteBranch: true,
  },
  {
    branchName: "codex/quiet-mobile-frame",
    headCommitSha: "789abcdef1234567890abcdef1234567890abcd",
    isDefault: false,
    isDeletedUpstream: false,
    aheadBy: 1,
    behindBy: 1,
    canDeleteBranch: true,
  },
  {
    branchName: "codex/research-branch-collapse",
    headCommitSha: "def1234567890abcdef1234567890abcdef12345",
    isDefault: false,
    isDeletedUpstream: false,
    aheadBy: 0,
    behindBy: 2,
    canDeleteBranch: true,
  },
];

function VaultDashboardListSpacingFixture({
  mode,
}: {
  mode: VaultDashboardVisualMode;
}) {
  const [branchesExpanded, setBranchesExpanded] = useState(false);
  const visibleBranches = branchesExpanded
    ? LIST_SPACING_BRANCHES
    : LIST_SPACING_BRANCHES.slice(0, 3);
  const hiddenBranchCount =
    LIST_SPACING_BRANCHES.length - visibleBranches.length;

  return (
    <div
      data-testid="vault-dashboard-visual-fixture"
      data-mode={mode}
      className="w-full bg-background text-foreground"
    >
      <TestRouterProvider>
        <VaultDashboardRepositoryList>
          <VaultDashboardRepositoryCard
            isReady={true}
            repositoryOwner="noter-md"
            repositoryName="noter"
            titleHref="https://github.com/noter-md/noter"
            repositoryLinks={<FixtureRepositoryLinks />}
            branchSection={
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                  Branches
                </p>
                <div className="-mx-4 overflow-hidden border-y border-border/60 bg-muted/20 sm:mx-0 sm:corner-notch-1 sm:border">
                  {visibleBranches.map((branch) => (
                    <VaultBranchLinkRow
                      key={branch.branchName}
                      {...branch}
                      vaultId={fakeVaultId()}
                      repositoryFullName="noter-md/noter"
                      isDeletingBranch={false}
                      onDeleteBranch={() => {}}
                    />
                  ))}
                  <div className="px-3 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-expanded={branchesExpanded}
                      onClick={() =>
                        setBranchesExpanded((expanded) => !expanded)
                      }
                    >
                      <span>
                        {branchesExpanded
                          ? "Show less"
                          : `Show ${hiddenBranchCount} more`}
                      </span>
                      <ChevronDownIcon
                        className={
                          branchesExpanded
                            ? "h-3.5 w-3.5 rotate-180 transition-transform"
                            : "h-3.5 w-3.5 transition-transform"
                        }
                      />
                    </Button>
                  </div>
                </div>
              </div>
            }
          />
        </VaultDashboardRepositoryList>
      </TestRouterProvider>
    </div>
  );
}

function FixtureDashboardShell({
  desktopSidebarWidthPx,
  mainContent,
  mobilePane,
  rightContent,
  rightMobileWidthPx,
}: {
  desktopSidebarWidthPx?: number;
  mainContent?: ReactNode;
  mobilePane?: MobileSidebarPane;
  rightContent?: ReactNode;
  rightMobileWidthPx?: number;
}) {
  return (
    <TestRouterProvider>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId="vault-dashboard-visual-fixture"
        defaultOpen={false}
        defaultRightOpen={true}
        desktopSidebarWidthPx={desktopSidebarWidthPx}
        mobilePane={mobilePane}
        rightMobileWidthPx={rightMobileWidthPx}
        shortcutSidebarSide="right"
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

function FixtureDashboardSidebarAccountClamp({
  mobilePane,
  rightMobileWidthPx,
}: {
  mobilePane?: MobileSidebarPane;
  rightMobileWidthPx?: number;
} = {}) {
  return (
    <FixtureDashboardShell
      desktopSidebarWidthPx={160}
      mobilePane={mobilePane}
      rightMobileWidthPx={rightMobileWidthPx}
      rightContent={
        <VaultDashboardSidebarContent>
          <VaultDashboardAccountSection
            open={true}
            onOpenChange={() => {}}
            displayName="Alexandria Example"
            email="alexandria.very.long.operator.email-address@noter-example-workspace.dev"
            providerLabel="Google Workspace Enterprise"
            isSignOutPending={false}
            onSignOut={() => {}}
          />
          <VaultDashboardProvidersSection
            open={true}
            onOpenChange={() => {}}
            providerRows={[
              {
                key: "github",
                icon: <GitHubLogoIcon className="h-4 w-4" />,
                label: "GitHub",
                status:
                  "Connected as alexandria-super-long-github-operator (OAuth)",
                actions: [],
              },
            ]}
          />
          <div className="mt-auto">
            <AppSidebarMetaSection
              showLandingPreviewLink
              showMachineLinks
              side="right"
            />
          </div>
        </VaultDashboardSidebarContent>
      }
      mainContent={<VaultDashboardEmptyState />}
    />
  );
}

function FixtureDashboardCreateControl() {
  return (
    <FixtureDashboardShell
      rightContent={
        <VaultDashboardSidebarContent>
          <VaultDashboardAccountSection
            open={true}
            onOpenChange={() => {}}
            displayName="Nicu"
            email="nicu@noter.md"
            providerLabel="Google"
            isSignOutPending={false}
            onSignOut={() => {}}
          />
          <VaultDashboardProvidersSection
            open={true}
            onOpenChange={() => {}}
            providerRows={[]}
          />
          <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
            <Input
              className="w-full"
              placeholder="New App name"
              value=""
              onChange={() => {}}
            />
            <Button className="w-full">New App</Button>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/add">Connect existing repo</Link>
            </Button>
          </div>
          <div className="mt-auto">
            <AppSidebarMetaSection
              showLandingPreviewLink
              showMachineLinks
              side="right"
            />
          </div>
        </VaultDashboardSidebarContent>
      }
      mainContent={<VaultDashboardEmptyState />}
    />
  );
}

export function VaultDashboardVisualFixture({
  mode,
}: {
  mode: VaultDashboardVisualMode;
}) {
  if (mode === "vault-create-control") {
    return <FixtureDashboardCreateControl />;
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

  if (mode === "vault-sidebar-account-clamp") {
    return <FixtureDashboardSidebarAccountClamp />;
  }

  if (mode === "vault-sidebar-account-mobile-min") {
    return (
      <FixtureDashboardSidebarAccountClamp
        mobilePane="right"
        rightMobileWidthPx={1}
      />
    );
  }

  if (mode === "vault-sidebar-machine-links") {
    return (
      <FixtureDashboardShell
        rightContent={
          <VaultDashboardSidebarContent>
            <div className="mt-auto">
              <AppSidebarMetaSection
                showLandingPreviewLink
                showMachineLinks
                side="right"
              />
            </div>
          </VaultDashboardSidebarContent>
        }
      />
    );
  }

  if (mode === "vault-branch-mobile-alignment") {
    return (
      <div
        data-testid="vault-dashboard-visual-fixture"
        data-mode={mode}
        className="flex w-full justify-center bg-stone-100 p-4 text-foreground"
      >
        <div className="mx-auto max-w-[390px]">
          <div className="corner-notch-1 border border-border bg-background p-4">
            <div className="space-y-3">
              <div>
                <div className="text-lg font-semibold">
                  <span className="font-normal text-muted-foreground">
                    noter-md/
                  </span>
                  <span>noter</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Updated 12s ago
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                  Branches
                </p>
                <div className="-mx-4 overflow-hidden border-y border-border/60 bg-muted/20 sm:mx-0 sm:corner-notch-1 sm:border">
                  <TestRouterProvider>
                    <VaultBranchLinkRow
                      vaultId={fakeVaultId()}
                      repositoryFullName="noter-md/noter"
                      branchName="main"
                      headCommitSha="1234567890abcdef1234567890abcdef12345678"
                      isDefault={true}
                      isDeletedUpstream={false}
                      aheadBy={0}
                      behindBy={0}
                      canDeleteBranch={false}
                      isDeletingBranch={false}
                      onDeleteBranch={() => {}}
                    />
                    <VaultBranchLinkRow
                      vaultId={fakeVaultId()}
                      repositoryFullName="noter-md/noter"
                      branchName="codex/mobile-branch-card-spacing"
                      headCommitSha="abcdef1234567890abcdef1234567890abcdef12"
                      isDefault={false}
                      isDeletedUpstream={false}
                      aheadBy={2}
                      behindBy={0}
                      pullRequestUrl="https://github.com/noter-md/noter/pull/321"
                      pullRequestNumber={321}
                      pullRequestTitle="Align mobile branch rows with vault cards"
                      canDeleteBranch={true}
                      isDeletingBranch={false}
                      onDeleteBranch={() => {}}
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
                  <span className="font-normal text-muted-foreground">
                    noter-md/
                  </span>
                  <span>noter</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Updated 12s ago
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    Branches
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/80">
                      1 of 4
                    </span>
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
                <div className="-mx-4 overflow-hidden border-y border-border/60 bg-muted/20 sm:mx-0 sm:corner-notch-1 sm:border">
                  <TestRouterProvider>
                    <VaultBranchLinkRow
                      vaultId={fakeVaultId()}
                      repositoryFullName="noter-md/noter"
                      branchName="codex/branch-filters"
                      headCommitSha="abcdef1234567890abcdef1234567890abcdef12"
                      isDefault={false}
                      isDeletedUpstream={false}
                      aheadBy={1}
                      behindBy={0}
                      pullRequestUrl="https://github.com/noter-md/noter/pull/321"
                      pullRequestNumber={321}
                      pullRequestTitle="Ship saved branch filters per vault"
                      pullRequestLabels={[
                        { name: "needs review", color: "bf8700" },
                        { name: "customer", color: "1a7f37" },
                      ]}
                      canDeleteBranch={true}
                      isDeletingBranch={false}
                      onDeleteBranch={() => {}}
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
            branchName="feature/pr-labels"
            headCommitSha="1234567890abcdef1234567890abcdef12345678"
            isDefault={false}
            isDeletedUpstream={false}
            aheadBy={3}
            behindBy={1}
            pullRequestUrl="https://github.com/octo/repo/pull/42"
            pullRequestNumber={42}
            pullRequestLabels={[
              { name: "needs review", color: "fbca04" },
              { name: "bug", color: "d73a4a" },
            ]}
            canDeleteBranch={false}
            isDeletingBranch={false}
            onDeleteBranch={() => {}}
          />
        </TestRouterProvider>
      </div>
    </div>
  );
}
