import { MemoryRouter } from "react-router-dom";
import { Button } from "@/components/button";
import { SidebarProvider } from "@/components/sidebar";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { VaultBranchLinkRow } from "@/components/VaultDashboard";
import { GitHubLogoIcon, PersonIcon } from "@radix-ui/react-icons";

export type VaultDashboardVisualMode =
  | "dashboard-shared-sidebar"
  | "vault-branch-pr-labels";

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
  if (mode === "dashboard-shared-sidebar") {
    const sidebarContent = (
      <>
        <SidebarAccountSection>
          <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
            <span className="block min-w-0 truncate">
              nicu.chiciuc@noter.md
            </span>
            <Button variant="secondary" size="icon" className="rounded-ui">
              <PersonIcon className="h-5 w-5" />
              <span className="sr-only">Open user menu</span>
            </Button>
          </div>
        </SidebarAccountSection>
        <div className="flex-1" />
      </>
    );

    return (
      <SidebarProvider
        defaultOpen={true}
        className="h-[720px] min-h-0 bg-background text-foreground"
      >
        <RepositoryWorkspaceFrame
          dataTestId="vault-dashboard-visual-fixture"
          sidebarContent={sidebarContent}
          contentClassName="flex-1 overflow-y-auto p-0"
        >
          <div className="container py-6">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-2">
                <GitHubLogoIcon className="h-5 w-5" />
                <h1 className="text-xl font-semibold">Your Vaults</h1>
              </div>
              <div className="w-full max-w-[480px] corner-notch-1 border border-border bg-background px-3 py-2 text-sm font-medium">
                Create control
              </div>
            </div>

            <div className="mb-6 corner-notch-1 border border-border bg-background p-4">
              <div className="text-sm font-medium">Providers</div>
              <div className="mt-3 text-xs text-muted-foreground">
                GitHub, Convex, and Cloudflare are connected.
              </div>
            </div>

            <div className="corner-notch-1 border border-border bg-background p-4">
              <div className="text-sm text-muted-foreground">noter-md/</div>
              <div className="text-lg font-semibold">noter</div>
              <div className="mt-2 text-xs text-muted-foreground">
                Updated 12s ago
              </div>
            </div>
          </div>
        </RepositoryWorkspaceFrame>
      </SidebarProvider>
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
