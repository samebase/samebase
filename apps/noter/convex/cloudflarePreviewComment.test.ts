import { describe, expect, it } from "vitest";

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
      branchPreviewUrl:
        "https://codex-preserve-logo-transfor.noter-ax1.pages.dev/",
      previewUrl: "https://a3070b07.noter-ax1.pages.dev/",
      previewCommitSha: "aa16371",
      previewStatus: "✅ Deploy successful!",
      previewLogsUrl:
        "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/pages/view/noter/a3070b07-c653-4083-8493-0b0a540f8b34",
    });
  });

  it("rejects malformed or non-https URLs while keeping other parsed fields", () => {
    const parsed = parseCloudflarePreviewComment(
      VALID_COMMENT.replace(
        "https://a3070b07.noter-ax1.pages.dev",
        "javascript:alert('preview')",
      )
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

  it("returns null when no meaningful Cloudflare preview fields can be extracted", () => {
    expect(
      parseCloudflarePreviewComment(
        "Cloudflare Pages deployment completed, but no preview metadata was included.",
      ),
    ).toBeNull();
  });
});
