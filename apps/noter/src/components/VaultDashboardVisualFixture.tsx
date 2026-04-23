import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultLastUpdatedStatus } from "@/components/VaultLastUpdatedStatus";
import { VaultBranchFiltersControl } from "@/components/VaultBranchFilters";
import { VaultDashboardEmptyState } from "@/components/VaultDashboardChrome";
import { VaultBranchLinkRow } from "@/components/VaultDashboard";
import { ChevronDownIcon } from "@/lib/radixIcons";

export type VaultDashboardVisualMode =
  | "vault-create-control"
  | "vault-last-updated-status"
  | "vault-branch-filters"
  | "vault-branch-pr-labels"
  | "vault-branch-mobile-alignment";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");

function fakeVaultId(): Parameters<typeof VaultBranchLinkRow>[0]["vaultId"] {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
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

export function VaultDashboardVisualFixture({
  mode,
}: {
  mode: VaultDashboardVisualMode;
}) {
  if (mode === "vault-create-control") {
    return (
      <div className="min-h-screen bg-stone-100 p-4 text-foreground">
        <div
          data-testid="vault-dashboard-visual-fixture"
          data-mode={mode}
          className="mx-auto w-full max-w-[960px]"
        >
          <TestRouterProvider>
            <VaultDashboardEmptyState
              createControl={
                <div className="flex w-full max-w-[480px] flex-col items-start gap-2">
                  <ButtonGroup className="w-full">
                    <Input
                      className="flex-1"
                      placeholder="New App name"
                      value=""
                      onChange={() => {}}
                    />
                    <Button>New App</Button>
                    <ButtonGroupSeparator className="bg-primary-foreground/30" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="px-2" aria-label="More actions">
                          <ChevronDownIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/add">Connect existing repo</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ButtonGroup>
                </div>
              }
            />
          </TestRouterProvider>
        </div>
      </div>
    );
  }

  if (mode === "vault-last-updated-status") {
    return (
      <div className="min-h-screen bg-stone-100 p-4 text-foreground">
        <FixtureVaultLastUpdatedStatusCard />
      </div>
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
