import { describe, expect, it } from "vite-plus/test";

import {
  detectHostingCommentParseFailures,
  resolveCloudflareCommentWorkerBuild,
  resolveCloudflareHostingPreviews,
  resolveNetlifyHostingPreviews,
} from "./pullRequestHostingPreviews";

function cloudflareWorkerComment(args: {
  accountId: string;
  branchPreviewUrl: string | null;
  status?: string;
  workerName: string;
}) {
  const previewColumn = args.branchPreviewUrl === null ? "" : " | Preview URL";
  const previewSeparator = args.branchPreviewUrl === null ? "" : "|-";
  const previewCell =
    args.branchPreviewUrl === null
      ? ""
      : ` | <a href='https://d25210e5-${args.workerName}.pfp.workers.dev'>Commit Preview URL</a><br><br><a href='${args.branchPreviewUrl}'>Branch Preview URL</a>`;
  return `## Deploying with &nbsp;<a href="https://workers.dev"><img alt="Cloudflare Workers" src="https://workers.cloudflare.com/logo.svg" width="16"></a> &nbsp;Cloudflare Workers
The latest updates on your project. Learn more about [integrating Git with Workers](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

| Status | Name | Latest Commit${previewColumn} | Updated (UTC) |
| -|-|-${previewSeparator}|-|
| ${args.status ?? "✅ Deployment successful!"} <br>[View logs](https://dash.cloudflare.com/?to=/${args.accountId}/workers/services/view/${args.workerName}/production/builds/build-1) | ${args.workerName} | 9a0e51e5${previewCell} | Jul 31 2026, 09:18 AM |`;
}

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

describe("hosting comment parse diagnostics", () => {
  it("keeps known comments without ready links out of the failure metric", () => {
    const cloudflareComments = {
      state: "available" as const,
      bodies: [
        cloudflareWorkerComment({
          accountId: "account-1",
          branchPreviewUrl: null,
          workerName: "samebase-posthog-proxy",
        }),
        cloudflarePagesWithoutPreviewComment({
          accountId: "account-2",
          projectName: "logto-docs",
        }),
      ],
    };
    const netlifyComments = {
      state: "available" as const,
      bodies: [
        netlifyComment({
          deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
          previewUrl: null,
          siteName: "notermd",
        }),
      ],
    };
    expect(
      detectHostingCommentParseFailures({
        cloudflareComments,
        cloudflareRead: resolveCloudflareHostingPreviews(cloudflareComments),
        netlifyComments,
        netlifyRead: resolveNetlifyHostingPreviews({
          comments: netlifyComments,
          pullRequestNumber: 201,
        }),
      }),
    ).toEqual([]);
  });

  it("reports silent provider format drift", () => {
    const worker = cloudflareWorkerComment({
      accountId: "account-1",
      branchPreviewUrl: null,
      workerName: "samebase",
    });
    const readyWorker = cloudflareWorkerComment({
      accountId: "account-1",
      branchPreviewUrl: "https://feature-samebase.pfp.workers.dev",
      workerName: "samebase",
    });
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
      bodies: [
        worker.replace("| Status | Name |", "| Status | Name | Name |"),
        `${readyWorker}
| ✅ Deployment successful! <br>[View logs](https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase/production/builds/build-2) | samebase | 9a0e51e6 | <a href='https://other-samebase.pfp.workers.dev'>Branch URL</a> | Jul 31 2026, 09:19 AM |`,
        pages.replace("Branch Preview URL:", "Branch URL:"),
      ],
    };
    const netlifyComments = {
      state: "available" as const,
      bodies: [netlify.replace("|  Name | Link |", "| Name | URL |")],
    };
    expect(
      detectHostingCommentParseFailures({
        cloudflareComments,
        cloudflareRead: resolveCloudflareHostingPreviews(cloudflareComments),
        netlifyComments,
        netlifyRead: resolveNetlifyHostingPreviews({
          comments: netlifyComments,
          pullRequestNumber: 201,
        }),
      }),
    ).toEqual([
      { providerFormat: "cloudflare_workers", failureKind: "format_drift" },
      { providerFormat: "cloudflare_workers", failureKind: "format_drift" },
      { providerFormat: "cloudflare_pages", failureKind: "format_drift" },
      { providerFormat: "netlify", failureKind: "format_drift" },
    ]);
  });

  it("reports parser rejection and cross-comment conflicts", () => {
    const cloudflareComments = {
      state: "available" as const,
      bodies: [
        cloudflareWorkerComment({
          accountId: "account-1",
          branchPreviewUrl: "https://feature-samebase.pfp.workers.dev/path",
          workerName: "samebase",
        }),
      ],
    };
    const netlifyComments = {
      state: "available" as const,
      bodies: [
        netlifyComment({
          deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
          previewUrl: "http://deploy-preview-201--notermd.netlify.app",
          siteName: "notermd",
        }),
      ],
    };
    expect(
      detectHostingCommentParseFailures({
        cloudflareComments,
        cloudflareRead: resolveCloudflareHostingPreviews(cloudflareComments),
        netlifyComments,
        netlifyRead: resolveNetlifyHostingPreviews({
          comments: netlifyComments,
          pullRequestNumber: 201,
        }),
      }),
    ).toEqual([
      { providerFormat: "cloudflare_unknown", failureKind: "invalid_or_conflict" },
      { providerFormat: "netlify", failureKind: "invalid_or_conflict" },
    ]);
  });
});

describe("resolveCloudflareHostingPreviews", () => {
  it("parses live Cloudflare Workers and Pages comment formats", () => {
    expect(
      resolveCloudflareHostingPreviews({
        state: "available",
        bodies: [
          cloudflareWorkerComment({
            accountId: "account-1",
            branchPreviewUrl: "https://feature-samebase.pfp.workers.dev",
            workerName: "samebase",
          }),
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
          kind: "worker",
          accountId: "account-1",
          name: "samebase",
          url: "https://feature-samebase.pfp.workers.dev",
        },
        {
          kind: "pages",
          accountId: "account-2",
          name: "logto-docs",
          url: "https://feature.logto-docs.pages.dev",
        },
      ],
      workerBuilds: [
        {
          accountId: "account-1",
          buildState: "success",
          buildUuid: "build-1",
          logsUrl:
            "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase/production/builds/build-1",
          name: "samebase",
        },
      ],
    });
  });

  it("retains the build link while a comment is in progress without a preview", () => {
    expect(
      resolveCloudflareHostingPreviews({
        state: "available",
        bodies: [
          cloudflareWorkerComment({
            accountId: "account-1",
            branchPreviewUrl: null,
            status: "🔵 In progress",
            workerName: "samebase-posthog-proxy",
          }),
        ],
      }),
    ).toEqual({
      state: "available",
      previews: [],
      workerBuilds: [
        {
          accountId: "account-1",
          buildState: "running",
          buildUuid: "build-1",
          logsUrl:
            "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase-posthog-proxy/production/builds/build-1",
          name: "samebase-posthog-proxy",
        },
      ],
    });
  });

  it("fails closed when the resource identity or preview URL disagrees", () => {
    const validWorker = cloudflareWorkerComment({
      accountId: "account-1",
      branchPreviewUrl: "https://feature-samebase.pfp.workers.dev",
      workerName: "samebase",
    });
    expect(
      resolveCloudflareHostingPreviews({
        state: "available",
        bodies: [validWorker.replace("/view/samebase/", "/view/other-worker/")],
      }),
    ).toEqual({ state: "unavailable" });
    expect(
      resolveCloudflareHostingPreviews({
        state: "available",
        bodies: [
          validWorker.replace(
            "https://feature-samebase.pfp.workers.dev",
            "https://feature-samebase.pfp.workers.dev/path",
          ),
        ],
      }),
    ).toEqual({ state: "unavailable" });

    expect(
      resolveCloudflareHostingPreviews({
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

  it("rejects unsafe Cloudflare Worker preview origins", () => {
    const validWorker = cloudflareWorkerComment({
      accountId: "account-1",
      branchPreviewUrl: "https://feature-samebase.pfp.workers.dev",
      workerName: "samebase",
    });
    for (const previewUrl of [
      "http://feature-samebase.pfp.workers.dev",
      "https://user@feature-samebase.pfp.workers.dev",
      "https://feature-samebase.pfp.workers.dev:8443",
      "https://feature-samebase.pfp.workers.dev?source=comment",
      "https://feature-samebase.pfp.workers.dev#preview",
      "https://feature-samebase.example.com",
    ]) {
      expect(
        resolveCloudflareHostingPreviews({
          state: "available",
          bodies: [validWorker.replace("https://feature-samebase.pfp.workers.dev", previewUrl)],
        }),
      ).toEqual({ state: "unavailable" });
    }
  });

  it("fails closed when a Pages comment has an extra invalid logs link", () => {
    const validPages = cloudflarePagesComment({
      accountId: "account-2",
      branchPreviewText: "https://feature.logto-docs.pages.dev",
      branchPreviewUrl: "https://feature.logto-docs.pages.dev",
      projectName: "logto-docs",
    });

    expect(
      resolveCloudflareHostingPreviews({
        state: "available",
        bodies: [`${validPages}\n[View logs](https://example.com/not-cloudflare)`],
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("deduplicates equal previews and rejects conflicting previews", () => {
    const first = cloudflareWorkerComment({
      accountId: "account-1",
      branchPreviewUrl: "https://feature-samebase.pfp.workers.dev",
      workerName: "samebase",
    });
    expect(
      resolveCloudflareHostingPreviews({ state: "available", bodies: [first, first] }),
    ).toEqual({
      state: "available",
      previews: [
        {
          kind: "worker",
          accountId: "account-1",
          name: "samebase",
          url: "https://feature-samebase.pfp.workers.dev",
        },
      ],
      workerBuilds: [
        {
          accountId: "account-1",
          buildState: "success",
          buildUuid: "build-1",
          logsUrl:
            "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase/production/builds/build-1",
          name: "samebase",
        },
      ],
    });
    expect(
      resolveCloudflareHostingPreviews({
        state: "available",
        bodies: [
          first,
          cloudflareWorkerComment({
            accountId: "account-1",
            branchPreviewUrl: "https://other-samebase.pfp.workers.dev",
            workerName: "samebase",
          }),
        ],
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("sorts Workers before Pages, then sorts each provider identity", () => {
    const result = resolveCloudflareHostingPreviews({
      state: "available",
      bodies: [
        cloudflarePagesComment({
          accountId: "account-2",
          branchPreviewText: "https://feature.beta.pages.dev",
          branchPreviewUrl: "https://feature.beta.pages.dev",
          projectName: "beta",
        }),
        cloudflareWorkerComment({
          accountId: "account-1",
          branchPreviewUrl: "https://feature-zeta.pfp.workers.dev",
          workerName: "zeta",
        }),
        cloudflareWorkerComment({
          accountId: "account-2",
          branchPreviewUrl: "https://feature-alpha.pfp.workers.dev",
          workerName: "alpha",
        }),
      ],
    });
    expect(result.state).toBe("available");
    if (result.state === "available") {
      expect(result.previews.map((preview) => `${preview.kind}:${preview.name}`)).toEqual([
        "worker:alpha",
        "worker:zeta",
        "pages:beta",
      ]);
    }
  });

  it("preserves an unavailable comment read", () => {
    expect(resolveCloudflareHostingPreviews({ state: "unavailable" })).toEqual({
      state: "unavailable",
    });
  });
});

describe("resolveCloudflareCommentWorkerBuild", () => {
  const resources = resolveCloudflareHostingPreviews({
    state: "available",
    bodies: [
      cloudflareWorkerComment({
        accountId: "account-1",
        branchPreviewUrl: null,
        status: "🔵 In progress",
        workerName: "samebase",
      }),
    ],
  });

  it("matches the exact account and Worker row", () => {
    expect(
      resolveCloudflareCommentWorkerBuild({
        accountId: "account-1",
        resources,
        workerName: "samebase",
      }),
    ).toEqual({
      state: "available",
      buildUuid: "build-1",
      buildState: "running",
      logsUrl:
        "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase/production/builds/build-1",
    });
  });

  it("does not return a build for another account or Worker", () => {
    expect(
      resolveCloudflareCommentWorkerBuild({
        accountId: "account-1",
        resources,
        workerName: "other-worker",
      }),
    ).toEqual({ state: "absent" });
    expect(
      resolveCloudflareCommentWorkerBuild({
        accountId: "account-2",
        resources,
        workerName: "samebase",
      }),
    ).toEqual({ state: "absent" });
  });

  it("keeps a failed status from the comment", () => {
    const failed = resolveCloudflareHostingPreviews({
      state: "available",
      bodies: [
        cloudflareWorkerComment({
          accountId: "account-1",
          branchPreviewUrl: null,
          status: "❌ Deployment failed",
          workerName: "samebase",
        }),
      ],
    });

    expect(
      resolveCloudflareCommentWorkerBuild({
        accountId: "account-1",
        resources: failed,
        workerName: "samebase",
      }),
    ).toMatchObject({ state: "available", buildState: "failure" });
  });

  it("maps an unrecognized status to unknown", () => {
    const unknown = resolveCloudflareHostingPreviews({
      state: "available",
      bodies: [
        cloudflareWorkerComment({
          accountId: "account-1",
          branchPreviewUrl: null,
          status: "⏭️ Build skipped.",
          workerName: "samebase",
        }),
      ],
    });

    expect(
      resolveCloudflareCommentWorkerBuild({
        accountId: "account-1",
        resources: unknown,
        workerName: "samebase",
      }),
    ).toMatchObject({ state: "available", buildState: "unknown" });
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

  it("rejects another pull request number and another site identity", () => {
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

  it("rejects malformed deploy and preview links", () => {
    for (const body of [
      netlifyComment({
        deployLogUrl: "https://example.com/projects/notermd/deploys/deploy-1",
        previewUrl: "https://deploy-preview-201--notermd.netlify.app",
        siteName: "notermd",
      }),
      netlifyComment({
        deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
        previewUrl: "http://deploy-preview-201--notermd.netlify.app",
        siteName: "notermd",
      }),
      netlifyComment({
        deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
        previewUrl: "https://user@deploy-preview-201--notermd.netlify.app",
        siteName: "notermd",
      }),
    ]) {
      expect(
        resolveNetlifyHostingPreviews({
          comments: { state: "available", bodies: [body] },
          pullRequestNumber: 201,
        }),
      ).toEqual({ state: "unavailable" });
    }
  });

  it("deduplicates equal site previews and rejects conflicts", () => {
    const first = netlifyComment({
      deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-1",
      previewUrl: "https://deploy-preview-201--notermd.netlify.app",
      siteName: "notermd",
    });
    expect(
      resolveNetlifyHostingPreviews({
        comments: { state: "available", bodies: [first, first] },
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
    expect(
      resolveNetlifyHostingPreviews({
        comments: {
          state: "available",
          bodies: [
            first,
            netlifyComment({
              deployLogUrl: "https://app.netlify.com/projects/notermd/deploys/deploy-2",
              previewUrl: "https://deploy-preview-201.preview.example.com",
              siteName: "notermd",
            }),
          ],
        },
        pullRequestNumber: 201,
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("sorts previews by site identity", () => {
    const result = resolveNetlifyHostingPreviews({
      comments: {
        state: "available",
        bodies: [
          netlifyComment({
            deployLogUrl: "https://app.netlify.com/projects/zeta/deploys/deploy-1",
            previewUrl: "https://deploy-preview-201--zeta.netlify.app",
            siteName: "zeta",
          }),
          netlifyComment({
            deployLogUrl: "https://app.netlify.com/projects/alpha/deploys/deploy-1",
            previewUrl: "https://deploy-preview-201--alpha.netlify.app",
            siteName: "alpha",
          }),
        ],
      },
      pullRequestNumber: 201,
    });
    expect(result.state).toBe("available");
    if (result.state === "available") {
      expect(result.previews.map((preview) => preview.name)).toEqual(["alpha", "zeta"]);
    }
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
