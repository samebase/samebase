import { describe, expect, it } from "vite-plus/test";

import {
  detectHostingCommentParseFailures,
  resolveCloudflarePagesPreviews,
  resolveNetlifyHostingPreviews,
} from "./pullRequestHostingPreviews";

const cloudflareWorkerComment = `## Deploying with &nbsp;<a href="https://workers.dev"><img alt="Cloudflare Workers" src="https://workers.cloudflare.com/logo.svg" width="16"></a> &nbsp;Cloudflare Workers

| Status | Name | Latest Commit |
| -|-|-|
| ✅ Deployment successful! | samebase | 0a7c7e5d |`;

function cloudflarePagesComment(args: {
  accountId: string;
  branchPreviewText: string;
  branchPreviewUrl: string;
  projectName: string;
}) {
  return `## Deploying ${args.projectName} with &nbsp;<a href="https://pages.dev"><img alt="Cloudflare Pages" src="https://user-images.githubusercontent.com/23264/106598434-9e719e00-654f-11eb-9e59-6167043cfa01.png" width="16"></a> &nbsp;Cloudflare Pages

<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>12ded09</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>&nbsp;✅&nbsp; Deploy successful!</td></tr>
<tr><td><strong>Preview URL:</strong></td><td>
<a href='https://09fe69ce.${args.projectName}.pages.dev'>https://09fe69ce.${args.projectName}.pages.dev</a>
</td></tr>
<tr><td><strong>Branch Preview URL:</strong></td><td>
<a href='${args.branchPreviewUrl}'>${args.branchPreviewText}</a>
</td></tr>
</table>

[View logs](https://dash.cloudflare.com/?to=/${args.accountId}/pages/view/${args.projectName}/deployment-1)
`;
}

function cloudflarePagesWithoutPreviewComment(args: { accountId: string; projectName: string }) {
  return `## Deploying ${args.projectName} with &nbsp;<a href="https://pages.dev"><img alt="Cloudflare Pages" src="https://example.com/pages.png" width="16"></a> &nbsp;Cloudflare Pages

<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>12ded09</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>🚫&nbsp; Build failed.</td></tr>
</table>

[View logs](https://dash.cloudflare.com/?to=/${args.accountId}/pages/view/${args.projectName}/deployment-1)
`;
}

function netlifyComment(args: {
  deployLogUrl: string;
  previewUrl: string | null;
  siteName: string;
}) {
  const previewRow =
    args.previewUrl === null
      ? ""
      : `\n|<span aria-hidden="true">😎</span> Deploy Preview | [${args.previewUrl}](${args.previewUrl}) |`;
  return `### <span aria-hidden="true">${args.previewUrl === null ? "👷" : "✅"}</span> Deploy Preview for *${args.siteName}* ${args.previewUrl === null ? "processing." : "ready!"}


|  Name | Link |
|:-:|------------------------|
|<span aria-hidden="true">🔨</span> Latest commit | 4037261ee52c2393e9c65b95bb4820074065d607 |
|<span aria-hidden="true">🔍</span> Latest deploy log | ${args.deployLogUrl} |${previewRow}`;
}

describe("resolveCloudflarePagesPreviews", () => {
  it("parses a live Pages comment and ignores Worker comments", () => {
    expect(
      resolveCloudflarePagesPreviews({
        state: "available",
        bodies: [
          cloudflareWorkerComment,
          cloudflarePagesComment({
            accountId: "account-2",
            branchPreviewText: "https://feature.logto-docs.pages.dev",
            branchPreviewUrl: "https://feature.logto-docs.pages.dev",
            projectName: "logto-docs",
          }),
        ],
      }),
    ).toEqual({
      state: "available",
      previews: [
        {
          kind: "pages",
          accountId: "account-2",
          name: "logto-docs",
          url: "https://feature.logto-docs.pages.dev",
        },
      ],
    });
  });

  it("accepts a known Pages comment without a ready preview", () => {
    expect(
      resolveCloudflarePagesPreviews({
        state: "available",
        bodies: [
          cloudflarePagesWithoutPreviewComment({
            accountId: "account-2",
            projectName: "logto-docs",
          }),
        ],
      }),
    ).toEqual({ state: "available", previews: [] });
  });

  it("rejects conflicting Pages identity and preview data", () => {
    expect(
      resolveCloudflarePagesPreviews({
        state: "available",
        bodies: [
          cloudflarePagesComment({
            accountId: "account-2",
            branchPreviewText: "https://other.logto-docs.pages.dev",
            branchPreviewUrl: "https://feature.logto-docs.pages.dev",
            projectName: "logto-docs",
          }),
        ],
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("preserves an unavailable comment read", () => {
    expect(resolveCloudflarePagesPreviews({ state: "unavailable" })).toEqual({
      state: "unavailable",
    });
  });
});

describe("hosting comment parse diagnostics", () => {
  it("does not report delayed or changed Worker comments", () => {
    const cloudflareComments = {
      state: "available" as const,
      bodies: [cloudflareWorkerComment.replace("Latest Commit", "Commit")],
    };
    expect(
      detectHostingCommentParseFailures({
        cloudflareComments,
        cloudflareRead: resolveCloudflarePagesPreviews(cloudflareComments),
        netlifyComments: { state: "available", bodies: [] },
        netlifyRead: { state: "available", previews: [] },
      }),
    ).toEqual([]);
  });

  it("reports Pages and Netlify format drift", () => {
    const pages = cloudflarePagesComment({
      accountId: "account-2",
      branchPreviewText: "https://feature.logto-docs.pages.dev",
      branchPreviewUrl: "https://feature.logto-docs.pages.dev",
      projectName: "logto-docs",
    });
    const netlify = netlifyComment({
      deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
      previewUrl: "https://deploy-preview-201--notermd.netlify.app",
      siteName: "notermd",
    });
    const cloudflareComments = {
      state: "available" as const,
      bodies: [pages.replace("Branch Preview URL:", "Branch URL:")],
    };
    const netlifyComments = {
      state: "available" as const,
      bodies: [netlify.replace("|  Name | Link |", "| Name | URL |")],
    };

    expect(
      detectHostingCommentParseFailures({
        cloudflareComments,
        cloudflareRead: resolveCloudflarePagesPreviews(cloudflareComments),
        netlifyComments,
        netlifyRead: resolveNetlifyHostingPreviews({
          comments: netlifyComments,
          pullRequestNumber: 201,
        }),
      }),
    ).toEqual([
      { providerFormat: "cloudflare_pages", failureKind: "format_drift" },
      { providerFormat: "netlify", failureKind: "format_drift" },
    ]);
  });
});

describe("resolveNetlifyHostingPreviews", () => {
  it("parses the live Netlify comment format", () => {
    expect(
      resolveNetlifyHostingPreviews({
        comments: {
          state: "available",
          bodies: [
            netlifyComment({
              deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
              previewUrl: "https://deploy-preview-201--notermd.netlify.app",
              siteName: "notermd",
            }),
          ],
        },
        pullRequestNumber: 201,
      }),
    ).toEqual({
      state: "available",
      previews: [
        {
          name: "notermd",
          url: "https://deploy-preview-201--notermd.netlify.app",
        },
      ],
    });
  });

  it("ignores a processing comment without a preview row", () => {
    expect(
      resolveNetlifyHostingPreviews({
        comments: {
          state: "available",
          bodies: [
            netlifyComment({
              deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
              previewUrl: null,
              siteName: "notermd",
            }),
          ],
        },
        pullRequestNumber: 201,
      }),
    ).toEqual({ state: "available", previews: [] });
  });

  it("accepts a custom deploy domain only with the exact pull request prefix", () => {
    const customPreview = netlifyComment({
      deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
      previewUrl: "https://deploy-preview-201.preview.example.com/docs?view=full",
      siteName: "notermd",
    });
    expect(
      resolveNetlifyHostingPreviews({
        comments: { state: "available", bodies: [customPreview] },
        pullRequestNumber: 201,
      }),
    ).toEqual({
      state: "available",
      previews: [
        {
          name: "notermd",
          url: "https://deploy-preview-201.preview.example.com/docs?view=full",
        },
      ],
    });

    for (const previewUrl of [
      "https://deploy-preview-20.preview.example.com",
      "https://deploy-preview-201-extra.preview.example.com",
    ]) {
      expect(
        resolveNetlifyHostingPreviews({
          comments: {
            state: "available",
            bodies: [
              netlifyComment({
                deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
                previewUrl,
                siteName: "notermd",
              }),
            ],
          },
          pullRequestNumber: 201,
        }),
      ).toEqual({ state: "unavailable" });
    }
  });

  it("rejects another pull request number or site identity", () => {
    expect(
      resolveNetlifyHostingPreviews({
        comments: {
          state: "available",
          bodies: [
            netlifyComment({
              deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
              previewUrl: "https://deploy-preview-201--notermd.netlify.app",
              siteName: "notermd",
            }),
          ],
        },
        pullRequestNumber: 202,
      }),
    ).toEqual({ state: "unavailable" });
    expect(
      resolveNetlifyHostingPreviews({
        comments: {
          state: "available",
          bodies: [
            netlifyComment({
              deployLogUrl: "https://app.netlify.com/projects/other-site/deploys/deploy-1",
              previewUrl: "https://deploy-preview-201--notermd.netlify.app",
              siteName: "notermd",
            }),
          ],
        },
        pullRequestNumber: 201,
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("preserves an unavailable comment read", () => {
    expect(
      resolveNetlifyHostingPreviews({
        comments: { state: "unavailable" },
        pullRequestNumber: 201,
      }),
    ).toEqual({ state: "unavailable" });
  });
});
