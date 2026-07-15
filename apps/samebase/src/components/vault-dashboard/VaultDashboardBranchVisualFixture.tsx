import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultBranchLinkContent } from "@/components/vault-dashboard/VaultDashboard";

export function VaultDashboardBranchVisualFixture() {
  return (
    <div
      data-testid="vault-dashboard-branch-visual-fixture"
      className="min-h-screen bg-stone-100 p-10 text-stone-950"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Vault Dashboard Branch Row</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Visual fixture for the dashboard branch hierarchy when an open pull request exists.
          </p>
        </div>

        <div className="overflow-hidden border bg-muted">
          <div className="flex items-start gap-3 border-b border-border/40 px-3 py-3.5">
            <TestRouterProvider>
              <VaultBranchLinkContent
                repositoryFullName="samebase/samebase"
                defaultBranchName="main"
                branch={{
                  kind: "pull_request",
                  rowKey: "pr:999",
                  name: "codex/draft-pr-button",
                  githubRepositoryFullName: "samebase/samebase",
                  canOpenInSamebase: true,
                  headCommit: { sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" },
                  isDefault: false,
                  comparison: { state: "ready", aheadBy: 6, behindBy: 2 },
                  pullRequestUrl: "https://github.com/samebase/samebase/pull/999",
                  pullRequestNumber: 999,
                  pullRequestBaseRefName: "main",
                  pullRequestIsCrossRepository: false,
                  pullRequestTitle: "Show PR titles above lighter branch labels",
                  pullRequestAdditions: 1_240,
                  pullRequestDeletions: 318,
                  pullRequestChangedFiles: 17,
                  pullRequestIsDraft: true,
                  pullRequestLabels: [{ name: "dashboard", color: "1d76db" }],
                }}
              />
            </TestRouterProvider>
            <span className="w-4 pt-1 text-right font-mono text-xs tabular-nums text-muted-foreground/70">
              0
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
