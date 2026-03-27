import { MemoryRouter } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME } from "@/components/editorChatLayout";
import { SidebarProvider, SidebarTrigger } from "@/components/sidebar";
import { DashboardWorkspaceLayout } from "@/components/DashboardWorkspaceLayout";
import { ResizeGripLines } from "@/components/ResizeGripLines";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { VaultBranchFiltersControl } from "@/components/VaultBranchFilters";
import { VaultBranchLinkRow } from "@/components/VaultDashboard";
import { cn } from "@/lib/utils";
import { GitHubLogoIcon, PersonIcon } from "@radix-ui/react-icons";
import { Plus, X } from "lucide-react";

export type VaultDashboardVisualMode =
  | "dashboard-layout-minimal"
  | "dashboard-shared-sidebar"
  | "dashboard-shared-sidebar-mobile-chat"
  | "vault-branch-filters"
  | "vault-branch-pr-labels"
  | "vault-branch-mobile-alignment";

const MOBILE_CHAT_FIXTURE_HEIGHT_PX = 280;
const MOBILE_CHAT_FIXTURE_DOCK_INSET = `calc(${MOBILE_CHAT_FIXTURE_HEIGHT_PX}px + 0.5rem)`;

function FixtureResizeGrip() {
  return (
    <div className="flex h-4 w-full items-center justify-center corner-notch-1 text-foreground/80">
      <ResizeGripLines />
    </div>
  );
}

function FixtureProvidersSidebarContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/50 p-3">
        <div className="text-sm font-medium">Providers</div>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 basis-[11rem] items-start gap-3">
              <div className="flex h-5 w-11 shrink-0 items-center justify-center">
                <GitHubLogoIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-sm font-medium">GitHub</div>
                <div className="break-words text-xs leading-5 text-muted-foreground">
                  Connected as GitHub user (API key)
                </div>
              </div>
            </div>
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
              <Button
                variant="outline"
                size="sm"
                className="h-auto max-w-full whitespace-normal py-2 text-left"
              >
                Disconnect
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 basis-[11rem] items-start gap-3">
              <div className="flex h-5 w-11 shrink-0 items-center justify-center">
                <span className="h-3.5 w-3.5 rounded-full bg-orange-500" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-sm font-medium">Cloudflare</div>
                <div className="break-words text-xs leading-5 text-muted-foreground">
                  Not connected
                </div>
              </div>
            </div>
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
              <Button
                variant="outline"
                size="sm"
                className="h-auto max-w-full whitespace-normal py-2 text-left"
              >
                Cloudflare MCP OAuth
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fakeVaultId(): Parameters<typeof VaultBranchLinkRow>[0]["vaultId"] {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

export function VaultDashboardVisualFixture({
  mode,
}: {
  mode: VaultDashboardVisualMode;
}) {
  if (mode === "dashboard-layout-minimal") {
    const sidebarHeader = (
      <SidebarAccountSection dataTestId="dashboard-layout-account-section">
        <div className="text-sm font-medium">nicu@noter.md</div>
      </SidebarAccountSection>
    );

    return (
      <SidebarProvider
        defaultOpen={true}
        className="h-[240px] min-h-0 bg-background text-foreground"
      >
        <DashboardWorkspaceLayout
          dataTestId="vault-dashboard-visual-fixture"
          sidebarHeader={sidebarHeader}
          sidebarContent={
            <div
              data-testid="dashboard-layout-sidebar-body"
              className="h-full min-h-0 bg-muted/10"
            />
          }
          headerContent={<div className="p-3 text-sm font-medium">Header</div>}
          bodyClassName="min-h-0 bg-muted/10"
        >
          <div data-testid="dashboard-layout-minimal-body" className="h-full" />
        </DashboardWorkspaceLayout>
      </SidebarProvider>
    );
  }

  if (mode === "dashboard-shared-sidebar") {
    const sidebarHeader = (
      <SidebarAccountSection dataTestId="dashboard-layout-account-section">
        <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
          <span className="block min-w-0 truncate">nicu.chiciuc@noter.md</span>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-ui md:h-6 md:w-6"
          >
            <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="sr-only">Open user menu</span>
          </Button>
        </div>
      </SidebarAccountSection>
    );
    const sidebarContent = <FixtureProvidersSidebarContent />;
    const headerContent = (
      <div className="flex items-center gap-3 p-3">
        <SidebarTrigger className="h-8 w-8 md:h-6 md:w-6" />
        <div className="flex min-w-0 items-center gap-2">
          <GitHubLogoIcon className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">Your Vaults</span>
        </div>
      </div>
    );

    return (
      <SidebarProvider
        defaultOpen={true}
        className="h-[720px] min-h-0 bg-background text-foreground"
      >
        <DashboardWorkspaceLayout
          dataTestId="vault-dashboard-visual-fixture"
          sidebarHeader={sidebarHeader}
          sidebarContent={sidebarContent}
          headerContent={headerContent}
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <div className="container py-6">
            <div className="mb-6 flex justify-start lg:justify-end">
              <div className="w-full max-w-[480px] corner-notch-1 border border-border bg-background px-3 py-2 text-sm font-medium lg:w-auto">
                Create control
              </div>
            </div>

            <div className="corner-notch-1 border border-border bg-background p-4">
              <div className="text-lg font-semibold">
                <span className="font-normal text-muted-foreground">
                  noter-md/
                </span>
                <span>noter</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Updated 12s ago
              </div>
            </div>
          </div>
        </DashboardWorkspaceLayout>
      </SidebarProvider>
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
                  <MemoryRouter>
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
                  </MemoryRouter>
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
                  <MemoryRouter>
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
                  </MemoryRouter>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "dashboard-shared-sidebar-mobile-chat") {
    const sidebarHeader = (
      <SidebarAccountSection dataTestId="dashboard-layout-account-section">
        <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
          <span className="block min-w-0 truncate">nicu.chiciuc@noter.md</span>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-ui md:h-6 md:w-6"
          >
            <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="sr-only">Open user menu</span>
          </Button>
        </div>
      </SidebarAccountSection>
    );
    const sidebarContent = <FixtureProvidersSidebarContent />;
    const headerContent = (
      <div className="px-4 py-4">
        <div className="mb-4">
          <SidebarTrigger className="h-8 w-8 md:h-6 md:w-6" />
        </div>
        <div className="mb-4 corner-notch-1 border border-border bg-background p-4">
          <div className="text-sm text-muted-foreground">Vaults</div>
          <div className="mt-1 text-xl font-semibold">Your Vaults</div>
        </div>
      </div>
    );

    return (
      <div className="min-h-screen bg-stone-100 p-0 text-stone-950">
        <SidebarProvider
          defaultOpen={false}
          className="mx-auto h-[932px] min-h-0 w-full max-w-[430px] bg-background text-foreground"
        >
          <DashboardWorkspaceLayout
            dataTestId="vault-dashboard-visual-fixture"
            sidebarHeader={sidebarHeader}
            sidebarContent={sidebarContent}
            headerContent={headerContent}
            bodyClassName="flex min-h-0 flex-col p-0"
          >
            <div className="relative flex h-full min-h-0 flex-col">
              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
                style={{
                  paddingBottom: MOBILE_CHAT_FIXTURE_DOCK_INSET,
                  scrollPaddingBottom: MOBILE_CHAT_FIXTURE_DOCK_INSET,
                }}
              >
                <div className="space-y-3">
                  <div className="corner-notch-1 border border-border bg-background p-4">
                    <div className="text-sm text-muted-foreground">
                      noter-md/
                    </div>
                    <div className="mt-1 text-lg font-semibold">noter</div>
                    <div className="mt-3 h-8 w-full border border-border bg-muted/20" />
                  </div>
                  <div className="corner-notch-1 border border-border bg-background p-4">
                    <div className="text-sm text-muted-foreground">
                      personal/
                    </div>
                    <div className="mt-1 text-lg font-semibold">notes</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Updated 12s ago
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 px-2 pb-2">
                <div
                  className="flex min-h-0 flex-col"
                  style={{ height: `${MOBILE_CHAT_FIXTURE_HEIGHT_PX}px` }}
                >
                  <div className="min-h-0 flex-1">
                    <div className="flex h-full min-h-0 flex-col corner-notch-1 border border-border bg-background">
                      <div className="border-b border-border">
                        <div
                          className={cn(
                            "flex items-center gap-1 py-0",
                            EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME,
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <FixtureResizeGrip />
                          </div>
                          <div className="flex items-center gap-0">
                            <button
                              type="button"
                              aria-label="New conversation"
                              className="corner-notch-1 p-0 text-muted-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Close chat"
                              className="corner-notch-1 p-0 text-muted-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto py-2">
                        <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
                          <div className="mb-2 corner-notch-1 border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                            Chat tools enabled
                          </div>
                          <div className="mb-2 ml-auto h-10 w-44 corner-notch-1 bg-primary/90" />
                          <div className="h-10 w-52 corner-notch-1 bg-muted" />
                        </div>
                      </div>

                      <div className="border-t border-border">
                        <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
                          <div className="flex items-end gap-2 pr-2 pt-2">
                            <div className="min-h-[5.75rem] flex-1 border border-border bg-background" />
                            <div className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
                              <div className="h-2.5 w-2.5 bg-primary-foreground" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DashboardWorkspaceLayout>
        </SidebarProvider>
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
        <MemoryRouter>
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
        </MemoryRouter>
      </div>
    </div>
  );
}
