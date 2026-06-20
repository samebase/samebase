import { describe, expect, it } from "vite-plus/test";

import { parseCloudflarePreviewComment } from "./cloudflarePreviewComment";

const VALID_COMMENT = `## Deploying noter with &nbsp;<a href="https://pages.dev"><img alt="Cloudflare Pages" src="https://user-images.githubusercontent.com/23264/106598434-9e719e00-654f-11eb-9e59-6167043cfa01.png" width="16"></a> &nbsp;Cloudflare Pages

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

describe("parseCloudflarePreviewComment", () => {
  it("extracts Cloudflare preview metadata from the PR comment body", () => {
    expect(parseCloudflarePreviewComment(VALID_COMMENT)).toEqual({
      branchPreviewUrl: "https://codex-preserve-logo-transfor.noter-ax1.pages.dev/",
      previewUrl: "https://a3070b07.noter-ax1.pages.dev/",
      previewCommitSha: "aa16371",
      previewStatus: "✅ Deploy successful!",
      previewLogsUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/a3070b07-c653-4083-8493-0b0a540f8b34",
    });
  });

  it("rejects malformed or non-https URLs while keeping other parsed fields", () => {
    const parsed = parseCloudflarePreviewComment(
      VALID_COMMENT.replace("https://a3070b07.noter-ax1.pages.dev", "javascript:alert('preview')")
        .replace(
          "https://codex-preserve-logo-transfor.noter-ax1.pages.dev",
          "/relative-branch-preview",
        )
        .replace(
          "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/a3070b07-c653-4083-8493-0b0a540f8b34",
          "http://dash.cloudflare.com/insecure",
        ),
    );

    expect(parsed).toEqual({
      branchPreviewUrl: undefined,
      previewUrl: undefined,
      previewCommitSha: "aa16371",
      previewStatus: "✅ Deploy successful!",
      previewLogsUrl: undefined,
    });
  });

  it("tolerates missing status and logs rows when the Pages deploy table is present", () => {
    const parsed = parseCloudflarePreviewComment(
      VALID_COMMENT.replace(
        "<tr><td><strong>Status:</strong></td><td>&nbsp;✅&nbsp; Deploy successful!</td></tr>\n",
        "",
      ).replace(
        "\n\n[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/a3070b07-c653-4083-8493-0b0a540f8b34)",
        "",
      ),
    );

    expect(parsed).toEqual({
      branchPreviewUrl: "https://codex-preserve-logo-transfor.noter-ax1.pages.dev/",
      previewUrl: "https://a3070b07.noter-ax1.pages.dev/",
      previewCommitSha: "aa16371",
      previewStatus: undefined,
      previewLogsUrl: undefined,
    });
  });

  it("extracts failed build status and logs without preview URLs", () => {
    const parsed = parseCloudflarePreviewComment(
      `## Deploying noter with Cloudflare Pages

<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>aa16371</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>&nbsp;🚫&nbsp; Build failed.</td></tr>
</table>

[View logs](https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/failed-build-id)`,
    );

    expect(parsed).toEqual({
      branchPreviewUrl: undefined,
      previewUrl: undefined,
      previewCommitSha: "aa16371",
      previewStatus: "🚫 Build failed.",
      previewLogsUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/failed-build-id",
    });
  });

  it("ignores extra text around the Cloudflare Pages deploy table", () => {
    const parsed = parseCloudflarePreviewComment(
      `Preflight note before the bot payload.\n\n${VALID_COMMENT}\n\nFooter text after the deploy table.`,
    );

    expect(parsed).toEqual({
      branchPreviewUrl: "https://codex-preserve-logo-transfor.noter-ax1.pages.dev/",
      previewUrl: "https://a3070b07.noter-ax1.pages.dev/",
      previewCommitSha: "aa16371",
      previewStatus: "✅ Deploy successful!",
      previewLogsUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/a3070b07-c653-4083-8493-0b0a540f8b34",
    });
  });

  it("returns null when no meaningful Cloudflare preview fields can be extracted", () => {
    expect(
      parseCloudflarePreviewComment(
        "Cloudflare Pages deployment completed, but no preview metadata was included.",
      ),
    ).toBeNull();
  });

  it("rejects generic Cloudflare text that does not include the Pages deploy table", () => {
    expect(
      parseCloudflarePreviewComment(
        "## Deploying noter with Cloudflare Pages\n\nPreview URL: https://example.com",
      ),
    ).toBeNull();
  });
});
