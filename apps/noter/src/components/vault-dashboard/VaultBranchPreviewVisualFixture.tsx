import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultBranchLinkRow } from "@/components/vault-dashboard/VaultDashboard";
import { parseCloudflarePreviewComment } from "../../../convex/cloudflarePreviewComment";

const CLOUDFLARE_COMMENT_BODY = `## Deploying noter with &nbsp;<a href="https://pages.dev"><img alt="Cloudflare Pages" src="https://user-images.githubusercontent.com/23264/106598434-9e719e00-654f-11eb-9e59-6167043cfa01.png" width="16"></a> &nbsp;Cloudflare Pages

<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>aa16371</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>&nbsp;✅&nbsp; Deploy successful!</td></tr>
<tr><td><strong>Preview URL:</strong></td><td>
<a href='https://a3070b07.noter-ax1.pages.dev'>https://a3070b07.noter-ax1.pages.dev</a>
</td></tr>
<tr><td><strong>Branch Preview URL:</strong></td><td>
<a href='https://codex-preserve-logo-transfor.noter-ax1.pages.dev'>https://codex-preserve-logo-transfor.noter-ax1.pages.dev</a>
</td></tr>
</table>

[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/a3070b07-c653-4083-8493-0b0a540f8b34)`;

const NON_CLOUDFLARE_COMMENT_BODY =
  "CI passed and the PR is ready for review, but there is no Cloudflare Pages comment yet.";

const FAILED_CLOUDFLARE_COMMENT_BODY = `## Deploying noter with &nbsp;<a href="https://pages.dev"><img alt="Cloudflare Pages" src="https://user-images.githubusercontent.com/23264/106598434-9e719e00-654f-11eb-9e59-6167043cfa01.png" width="16"></a> &nbsp;Cloudflare Pages

<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>aa16371</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>&nbsp;🚫&nbsp; Build failed.</td></tr>
</table>

[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/failed-build-id)`;

export type VaultBranchPreviewVisualMode =
  | "vault-branch-preview-link"
  | "vault-branch-preview-failed"
  | "vault-branch-preview-missing";

function resolveCommentBody(mode: VaultBranchPreviewVisualMode): string {
  if (mode === "vault-branch-preview-link") {
    return CLOUDFLARE_COMMENT_BODY;
  }

  if (mode === "vault-branch-preview-failed") {
    return FAILED_CLOUDFLARE_COMMENT_BODY;
  }

  return NON_CLOUDFLARE_COMMENT_BODY;
}

export function VaultBranchPreviewVisualFixture({
  mode,
}: {
  mode: VaultBranchPreviewVisualMode;
}) {
  const preview = parseCloudflarePreviewComment(resolveCommentBody(mode));

  return (
    <div
      data-testid="vault-branch-preview-visual-fixture"
      data-mode={mode}
      className="inline-flex bg-background p-3 text-foreground"
    >
      <TestRouterProvider>
        <div className="w-[560px] overflow-hidden corner-notch-1 border border-border bg-background">
          <VaultBranchLinkRow
            repositoryFullName="noter-md/noter"
            branchName="codex-preserve-logo-transfor"
            headCommitSha="aa16371b72fc1c2fd3c1f3af9c6f4d2d905ef10"
            isDefault={false}
            isDeletedUpstream={false}
            aheadBy={1}
            behindBy={0}
            pullRequestUrl="https://github.com/noter-md/noter/pull/290"
            pullRequestNumber={290}
            pullRequestTitle="Show PR names and labels above branch metadata"
            pullRequestLabels={[
              { name: "needs review", color: "fbca04" },
              { name: "dashboard", color: "0e8a16" },
            ]}
            cloudflareBranchPreviewUrl={preview?.branchPreviewUrl}
            cloudflarePreviewPullRequestNumber={290}
            cloudflarePreviewLogsUrl={preview?.previewLogsUrl}
            cloudflarePreviewStatus={preview?.previewStatus}
          />
        </div>
      </TestRouterProvider>
    </div>
  );
}
