import { MemoryRouter } from "react-router-dom";
import { VaultBranchLinkRow } from "@/components/VaultDashboard";

export type VaultDashboardVisualMode = "vault-branch-pr-labels";

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
