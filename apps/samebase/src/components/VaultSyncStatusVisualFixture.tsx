import { VaultSyncStatusContent } from "@/components/VaultSyncStatus";

export type VaultSyncStatusVisualMode = "vault-sync-status-states";

const FIXTURE_NOW = Date.parse("2026-03-26T18:00:00Z");
const FIXTURE_CHECKS = {
  state: "success",
  totalCount: 12,
  checkRunCount: 10,
  statusContextCount: 2,
  successCount: 12,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
  syncedAt: FIXTURE_NOW - 18_000,
} as const;

export function VaultSyncStatusVisualFixture({ mode }: { mode: VaultSyncStatusVisualMode }) {
  return (
    <div
      data-testid="vault-sync-status-visual-fixture"
      data-mode={mode}
      className="min-h-screen bg-stone-100 p-6 text-foreground"
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <div className="corner-notch-1 border border-border bg-background p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            Updated
          </div>
          <VaultSyncStatusContent
            repositoryFullName="samebase/samebase"
            branch="main"
            commitSha="1234567890abcdef1234567890abcdef12345678"
            checks={FIXTURE_CHECKS}
            lastTreeRefreshAt={FIXTURE_NOW - 18_000}
            stagedFiles={[]}
            now={FIXTURE_NOW}
          />
        </div>

        <div className="corner-notch-1 border border-border bg-background p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            Syncing
          </div>
          <VaultSyncStatusContent
            repositoryFullName="samebase/samebase"
            branch="main"
            commitSha="1234567890abcdef1234567890abcdef12345678"
            checks={FIXTURE_CHECKS}
            treeRefreshStartedAt={FIXTURE_NOW - 5_000}
            lastTreeRefreshAt={FIXTURE_NOW - 42_000}
            stagedFiles={[]}
            now={FIXTURE_NOW}
          />
        </div>

        <div className="corner-notch-1 border border-border bg-background p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            Rate Limited
          </div>
          <VaultSyncStatusContent
            repositoryFullName="samebase/samebase"
            branch="main"
            commitSha="1234567890abcdef1234567890abcdef12345678"
            checks={FIXTURE_CHECKS}
            lastTreeRefreshAt={FIXTURE_NOW - 51_000}
            lastTreeRefreshFailedAt={FIXTURE_NOW - 8_000}
            treeRefreshFailureKind="rate_limited"
            treeRefreshFailureMessage="GitHub API rate limited. Auto-refresh paused."
            treeRefreshCooldownUntil={FIXTURE_NOW + 4 * 60 * 1000}
            stagedFiles={[]}
            now={FIXTURE_NOW}
          />
        </div>

        <div className="corner-notch-1 border border-border bg-background p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            Failed
          </div>
          <VaultSyncStatusContent
            repositoryFullName="samebase/samebase"
            branch="main"
            commitSha="1234567890abcdef1234567890abcdef12345678"
            checks={FIXTURE_CHECKS}
            lastTreeRefreshAt={FIXTURE_NOW - 2 * 60 * 1000}
            lastTreeRefreshFailedAt={FIXTURE_NOW - 10_000}
            treeRefreshFailureKind="failed"
            treeRefreshFailureMessage="GitHub sync failed. Showing cached state."
            stagedFiles={[]}
            now={FIXTURE_NOW}
          />
        </div>
      </div>
    </div>
  );
}
