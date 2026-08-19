import { describe, expect, it } from "vite-plus/test";

import {
  detectHostingCommentParseFailures,
  resolveCloudflarePagesPreviews,
  resolveCloudflareWorkerBuild,
  resolveCloudflareWorkerCheckRuns,
  resolveNetlifyHostingPreviews,
  type CloudflareWorkerCheckRunInput,
} from "./pullRequestHostingPreviews";

const samebaseAccountId = "fe57d01d7ab41f60d00ba1aade20eb33";

// Captured from https://github.com/samebase/samebase/pull/1478 on 2026-08-19.
const samebaseSuccessfulCheck: CloudflareWorkerCheckRunInput = {
  id: "CR_kwDOPOZOdc8AAAAWUQUNGg",
  name: "Workers Builds: samebase",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  detailsUrl: `https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production/builds/8f72f2d5-3da6-4047-8101-17131571dc29`,
  externalId: "8f72f2d5-3da6-4047-8101-17131571dc29",
  title: "Workers Builds: samebase",
  summary: `
Build ID: [8f72f2d5-3da6-4047-8101-17131571dc29](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production/builds/8f72f2d5-3da6-4047-8101-17131571dc29)
Script: [samebase](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production)
Version ID: bfd78c45-2f56-462b-a2be-44cd88b2c155
Preview URL: https://bfd78c45-samebase.pfp.workers.dev
Preview Alias URL: https://codex-connect-repo-without-providers-samebase.pfp.workers.dev
`,
};

// Captured from https://github.com/samebase/samebase/pull/1478 on 2026-08-19.
const samebaseRunningCheck: CloudflareWorkerCheckRunInput = {
  id: "CR_kwDOPOZOdc8AAAAWUPClsA",
  name: "Workers Builds: samebase",
  status: "IN_PROGRESS",
  conclusion: null,
  detailsUrl: `https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production/builds/8f72f2d5-3da6-4047-8101-17131571dc29`,
  externalId: "8f72f2d5-3da6-4047-8101-17131571dc29",
  title: "Workers Builds: samebase",
  summary: `
Build ID: [8f72f2d5-3da6-4047-8101-17131571dc29](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production/builds/8f72f2d5-3da6-4047-8101-17131571dc29)
Script: [samebase](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production)
`,
};

// Captured from https://github.com/samebase/samebase/pull/1478 on 2026-08-19.
const proxySuccessfulCheck: CloudflareWorkerCheckRunInput = {
  id: "CR_kwDOPOZOdc8AAAAWUPY5ag",
  name: "Workers Builds: samebase-posthog-proxy",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  detailsUrl: `https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase-posthog-proxy/production/builds/ae87609d-7cf6-4c0b-8c1f-0c6069397047`,
  externalId: "ae87609d-7cf6-4c0b-8c1f-0c6069397047",
  title: "Workers Builds: samebase-posthog-proxy",
  summary: `
Build ID: [ae87609d-7cf6-4c0b-8c1f-0c6069397047](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase-posthog-proxy/production/builds/ae87609d-7cf6-4c0b-8c1f-0c6069397047)
Script: [samebase-posthog-proxy](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase-posthog-proxy/production)
Version ID: 53f7d838-7f77-4b7e-9b4c-9549ea70c0ba
`,
};

// Captured from https://github.com/samebase/samebase/pull/883 on 2026-08-19.
const samebaseFailedCheck: CloudflareWorkerCheckRunInput = {
  id: "CR_kwDOPOZOdc8AAAAWVLWXIA",
  name: "Workers Builds: samebase",
  status: "COMPLETED",
  conclusion: "FAILURE",
  detailsUrl: `https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production/builds/332ebfc3-db8b-4584-9f73-863c5e6da3ab`,
  externalId: "332ebfc3-db8b-4584-9f73-863c5e6da3ab",
  title: "Workers Builds: samebase",
  summary: `
Build ID: [332ebfc3-db8b-4584-9f73-863c5e6da3ab](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production/builds/332ebfc3-db8b-4584-9f73-863c5e6da3ab)
Script: [samebase](https://dash.cloudflare.com/${samebaseAccountId}/workers/services/view/samebase/production)
`,
};

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

describe("resolveCloudflareWorkerCheckRuns", () => {
  it("uses the newest matching check across the current pull request commits", () => {
    expect(
      resolveCloudflareWorkerCheckRuns([
        { checkRuns: [samebaseSuccessfulCheck] },
        { checkRuns: [] },
      ]),
    ).toEqual({
      state: "available",
      previews: [
        {
          kind: "worker",
          accountId: samebaseAccountId,
          name: "samebase",
          url: "https://codex-connect-repo-without-providers-samebase.pfp.workers.dev",
        },
      ],
      workerBuilds: [
        {
          accountId: samebaseAccountId,
          buildUuid: "8f72f2d5-3da6-4047-8101-17131571dc29",
          buildState: "success",
          logsUrl: samebaseSuccessfulCheck.detailsUrl,
          name: "samebase",
        },
      ],
    });
  });

  it("lets a newer failure replace an older success", () => {
    const result = resolveCloudflareWorkerCheckRuns([
      { checkRuns: [samebaseSuccessfulCheck] },
      { checkRuns: [samebaseFailedCheck] },
    ]);

    expect(
      resolveCloudflareWorkerBuild({
        accountId: samebaseAccountId,
        resources: result,
        workerName: "samebase",
      }),
    ).toMatchObject({ state: "available", buildState: "failure" });
  });

  it("keeps a current in-progress build visible", () => {
    const result = resolveCloudflareWorkerCheckRuns([{ checkRuns: [samebaseRunningCheck] }]);

    expect(
      resolveCloudflareWorkerBuild({
        accountId: samebaseAccountId,
        resources: result,
        workerName: "samebase",
      }),
    ).toMatchObject({ state: "available", buildState: "running" });
  });

  it("lets a newer success replace an older failure", () => {
    const result = resolveCloudflareWorkerCheckRuns([
      { checkRuns: [samebaseFailedCheck] },
      { checkRuns: [samebaseSuccessfulCheck] },
    ]);

    expect(
      resolveCloudflareWorkerBuild({
        accountId: samebaseAccountId,
        resources: result,
        workerName: "samebase",
      }),
    ).toMatchObject({ state: "available", buildState: "success" });
  });

  it("does not use a check from a commit that is absent from the current commit scan", () => {
    expect(resolveCloudflareWorkerCheckRuns([{ checkRuns: [] }])).toEqual({
      state: "available",
      previews: [],
      workerBuilds: [],
    });
  });

  it("resolves Workers with different watch paths independently", () => {
    const result = resolveCloudflareWorkerCheckRuns([
      { checkRuns: [proxySuccessfulCheck] },
      { checkRuns: [samebaseSuccessfulCheck] },
    ]);

    expect(result).toMatchObject({
      state: "available",
      workerBuilds: [
        { name: "samebase", buildState: "success" },
        { name: "samebase-posthog-proxy", buildState: "success" },
      ],
    });
  });

  it("accepts a successful Worker check without a preview URL", () => {
    expect(resolveCloudflareWorkerCheckRuns([{ checkRuns: [proxySuccessfulCheck] }])).toMatchObject(
      {
        state: "available",
        previews: [],
        workerBuilds: [{ name: "samebase-posthog-proxy", buildState: "success" }],
      },
    );
  });

  it("ignores non-Worker Cloudflare checks", () => {
    expect(
      resolveCloudflareWorkerCheckRuns([
        {
          checkRuns: [{ ...samebaseSuccessfulCheck, name: "Pages: samebase" }],
        },
      ]),
    ).toEqual({ state: "available", previews: [], workerBuilds: [] });
  });

  it("fails closed when a trusted Worker check has conflicting identity data", () => {
    for (const checkRun of [
      { ...samebaseSuccessfulCheck, externalId: "other-build" },
      { ...samebaseSuccessfulCheck, title: "Workers Builds: other-worker" },
      {
        ...samebaseSuccessfulCheck,
        detailsUrl: (samebaseSuccessfulCheck.detailsUrl ?? "").replace(
          "/view/samebase/",
          "/view/other/",
        ),
      },
      {
        ...samebaseSuccessfulCheck,
        summary: (samebaseSuccessfulCheck.summary ?? "").replace(
          "Script: [samebase]",
          "Script: [other-worker]",
        ),
      },
      {
        ...samebaseSuccessfulCheck,
        detailsUrl: (samebaseSuccessfulCheck.detailsUrl ?? "").replace(
          new RegExp(samebaseAccountId, "g"),
          "account-1",
        ),
        summary: (samebaseSuccessfulCheck.summary ?? "").replace(
          new RegExp(samebaseAccountId, "g"),
          "account-1",
        ),
      },
    ]) {
      expect(resolveCloudflareWorkerCheckRuns([{ checkRuns: [checkRun] }])).toEqual({
        state: "unavailable",
      });
    }
  });

  it("rejects unsafe or conflicting preview origins", () => {
    for (const previewUrl of [
      "http://codex-connect-repo-without-providers-samebase.pfp.workers.dev",
      "https://user@codex-connect-repo-without-providers-samebase.pfp.workers.dev",
      "https://codex-connect-repo-without-providers-samebase.pfp.workers.dev/path",
      "https://codex-connect-repo-without-providers-samebase.other.workers.dev",
      "https://codex-connect-repo-without-providers-samebase.example.com",
    ]) {
      expect(
        resolveCloudflareWorkerCheckRuns([
          {
            checkRuns: [
              {
                ...samebaseSuccessfulCheck,
                summary: (samebaseSuccessfulCheck.summary ?? "").replace(
                  "https://codex-connect-repo-without-providers-samebase.pfp.workers.dev",
                  previewUrl,
                ),
              },
            ],
          },
        ]),
      ).toEqual({ state: "unavailable" });
    }
  });

  it("rejects two latest checks for the same Worker on one commit", () => {
    expect(
      resolveCloudflareWorkerCheckRuns([
        {
          checkRuns: [samebaseSuccessfulCheck, samebaseFailedCheck],
        },
      ]),
    ).toEqual({ state: "unavailable" });
  });
});

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
