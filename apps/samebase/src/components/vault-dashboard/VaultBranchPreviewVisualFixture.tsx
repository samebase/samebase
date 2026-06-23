import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultBranchLinkRow } from "@/components/vault-dashboard/VaultDashboard";

export type VaultBranchPreviewVisualMode =
  | "vault-branch-preview-link"
  | "vault-branch-preview-failed"
  | "vault-branch-preview-missing";

function resolvePreviewMetadata(mode: VaultBranchPreviewVisualMode): {
  branchPreviewUrl?: string;
  previewLogsUrl?: string;
  previewStatus?: string;
} {
  if (mode === "vault-branch-preview-link") {
    return {
      branchPreviewUrl: "https://codex-preserve-logo-transfor.samebase-ax1.pages.dev/",
      previewLogsUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/builds/success",
      previewStatus: "Build successful",
    };
  }

  if (mode === "vault-branch-preview-failed") {
    return {
      previewLogsUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/builds/failed-build-id",
      previewStatus: "Build failed",
    };
  }

  return {};
}

export function VaultBranchPreviewVisualFixture({ mode }: { mode: VaultBranchPreviewVisualMode }) {
  const preview = resolvePreviewMetadata(mode);

  return (
    <div
      data-testid="vault-branch-preview-visual-fixture"
      data-mode={mode}
      className="inline-flex bg-background p-3 text-foreground"
    >
      <TestRouterProvider>
        <div className="w-[560px] overflow-hidden corner-notch-1 border border-border bg-background">
          <VaultBranchLinkRow
            repositoryFullName="samebase/samebase"
            branch={{
              name: "codex-preserve-logo-transfor",
              headCommitSha: "aa16371b72fc1c2fd3c1f3af9c6f4d2d905ef10",
              isDefault: false,
              isProtected: false,
              remoteState: "active",
              lastSyncedAt: 0,
              aheadBy: 1,
              behindBy: 0,
              pullRequestUrl: "https://github.com/samebase/samebase/pull/290",
              pullRequestNumber: 290,
              pullRequestTitle: "Show PR names and labels above branch metadata",
              pullRequestLabels: [
                { name: "needs review", color: "fbca04" },
                { name: "dashboard", color: "0e8a16" },
              ],
              cloudflareBranchPreviewUrl: preview.branchPreviewUrl,
              cloudflarePreviewPullRequestNumber: 290,
              cloudflarePreviewLogsUrl: preview.previewLogsUrl,
              cloudflarePreviewStatus: preview.previewStatus,
            }}
          />
        </div>
      </TestRouterProvider>
    </div>
  );
}
