import { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vite-plus/test";

import {
  readGitHubCloudflareWorkerChecks,
  resolveCloudflareWorkerCheckRuns,
  type CloudflareWorkerCheckRunInput,
} from "./pullRequestCloudflareWorkerChecks";
import {
  CLOUDFLARE_WORKER_PROOF_SOURCE,
  resolveCloudflareWorkerBuild,
} from "./pullRequestCloudflareWorkerProof";

const checkHeadBase = {
  id: "PR_17",
  baseRefOid: "a".repeat(40),
  headRefOid: "b".repeat(40),
};

const samebaseAccountId = "fe57d01d7ab41f60d00ba1aade20eb33";

it("selects checks as the deployed Worker proof source", () => {
  expect(CLOUDFLARE_WORKER_PROOF_SOURCE).toBe("checks");
});

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
        proof: result,
        workerName: "samebase",
      }),
    ).toMatchObject({ state: "available", buildState: "failure" });
  });

  it("keeps a current in-progress build visible", () => {
    const result = resolveCloudflareWorkerCheckRuns([{ checkRuns: [samebaseRunningCheck] }]);

    expect(
      resolveCloudflareWorkerBuild({
        accountId: samebaseAccountId,
        proof: result,
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
        proof: result,
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

describe("Cloudflare Worker check transport", () => {
  const commits = [
    { id: "C_1", oid: "1".repeat(40) },
    { id: "C_2", oid: "2".repeat(40) },
  ];
  const seed = {
    ...checkHeadBase,
    hostingCommentScan: {
      state: "available" as const,
      allCommentIds: [],
      hostingComments: [],
      totalCount: 0,
      after: null,
    },
    commitScan: {
      state: "available" as const,
      commits,
      totalCount: commits.length,
      before: null,
    },
  };

  function response(headRefOid: string) {
    return {
      data: {
        commits: commits.map((commit) => ({
          __typename: "Commit",
          ...commit,
          checkSuites: { totalCount: 0, nodes: [] },
        })),
        pullRequests: [
          {
            __typename: "PullRequest",
            id: checkHeadBase.id,
            state: "OPEN",
            repository: { databaseId: 42 },
            baseRefOid: checkHeadBase.baseRefOid,
            headRefOid,
          },
        ],
      },
    };
  }

  const paginatedCommit = commits[0];
  const paginatedSeed = {
    ...seed,
    commitScan: {
      state: "available" as const,
      commits: [paginatedCommit],
      totalCount: 1,
      before: null,
    },
  };

  function pullRequest(id = checkHeadBase.id) {
    return {
      __typename: "PullRequest",
      id,
      state: "OPEN",
      repository: { databaseId: 42 },
      baseRefOid: checkHeadBase.baseRefOid,
      headRefOid: checkHeadBase.headRefOid,
    };
  }

  function checkRun(index: number) {
    return {
      __typename: "CheckRun",
      id: `CR_${index}`,
      name: `Pages: project-${index}`,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
      externalId: null,
      title: null,
      summary: null,
    };
  }

  function checkSuite(checkRuns: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ReturnType<typeof checkRun>[];
  }) {
    return {
      __typename: "CheckSuite",
      id: "CS_kwDOPOZOdc8AAAAUT6KHug",
      app: {
        databaseId: 85455,
        slug: "cloudflare-workers-and-pages",
      },
      checkRuns,
    };
  }

  const firstCheckRunPage = {
    totalCount: 101,
    pageInfo: { hasNextPage: true, endCursor: "check-cursor-100" },
    nodes: Array.from({ length: 100 }, (_value, index) => checkRun(index + 1)),
  };
  const lastCheckRunPage = {
    totalCount: 101,
    pageInfo: { hasNextPage: false, endCursor: "check-cursor-101" },
    nodes: [checkRun(101)],
  };

  async function readPaginatedChecks(
    args: {
      heads?: readonly (typeof paginatedSeed)[];
      continuationPullRequests?: ReturnType<typeof pullRequest>[];
      initialCheckSuiteTotalCount?: number;
      initialSuite?: ReturnType<typeof checkSuite>;
      continuationSuite?: ReturnType<typeof checkSuite>;
    } = {},
  ) {
    const heads = args.heads ?? [paginatedSeed];
    const requestBodies: string[] = [];
    const octokit = new Octokit({
      request: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const requestBody = typeof init?.body === "string" ? init.body : "";
          requestBodies.push(requestBody);
          const continuation = requestBody.includes("PullRequestCloudflareCheckRunPage");
          const suite = continuation
            ? (args.continuationSuite ?? checkSuite(lastCheckRunPage))
            : (args.initialSuite ?? checkSuite(firstCheckRunPage));
          const pullRequests = heads.map((head) => pullRequest(head.id));
          const body = continuation
            ? {
                data: {
                  pullRequests: args.continuationPullRequests ?? pullRequests,
                  suite,
                },
              }
            : {
                data: {
                  commits: [
                    {
                      __typename: "Commit",
                      ...paginatedCommit,
                      checkSuites: {
                        totalCount: args.initialCheckSuiteTotalCount ?? 1,
                        nodes: [suite],
                      },
                    },
                  ],
                  pullRequests,
                },
              };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    });
    const reads = await readGitHubCloudflareWorkerChecks({
      octokit,
      signal: new AbortController().signal,
      ghRepoId: "42",
      heads,
    });
    return { reads, requestBodies };
  }

  it("batches commits and asks GitHub for only the latest Cloudflare check attempt", async () => {
    const requestBodies: string[] = [];
    const octokit = new Octokit({
      request: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          requestBodies.push(typeof init?.body === "string" ? init.body : "");
          return new Response(JSON.stringify(response(checkHeadBase.headRefOid)), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    });

    const reads = await readGitHubCloudflareWorkerChecks({
      octokit,
      signal: new AbortController().signal,
      ghRepoId: "42",
      heads: [seed],
    });

    expect(reads.get(checkHeadBase.id)).toEqual({
      state: "available",
      previews: [],
      workerBuilds: [],
    });
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toContain("checkType: LATEST");
    expect(requestBodies[0]).toContain('"commitIds":["C_1","C_2"]');
  });

  it("rejects the check batch when the pull request head changes", async () => {
    const octokit = new Octokit({
      request: {
        fetch: async () =>
          new Response(JSON.stringify(response("c".repeat(40))), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      },
    });

    const reads = await readGitHubCloudflareWorkerChecks({
      octokit,
      signal: new AbortController().signal,
      ghRepoId: "42",
      heads: [seed],
    });

    expect(reads.get(checkHeadBase.id)).toEqual({ state: "unavailable" });
  });

  it("follows a stable check-run page beyond 100 latest runs", async () => {
    const { reads, requestBodies } = await readPaginatedChecks();

    expect(reads.get(checkHeadBase.id)).toEqual({
      state: "available",
      previews: [],
      workerBuilds: [],
    });
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]).toContain('"after":"check-cursor-100"');
    expect(requestBodies[1]).toContain('"pullRequestIds":["PR_17"]');
  });

  it("reads later check pages once for pull requests that share a commit", async () => {
    const secondSeed = { ...paginatedSeed, id: "PR_18", number: 18 };
    const { reads, requestBodies } = await readPaginatedChecks({
      heads: [paginatedSeed, secondSeed],
    });

    expect(reads.get(checkHeadBase.id)?.state).toBe("available");
    expect(reads.get(secondSeed.id)?.state).toBe("available");
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]).toContain('"pullRequestIds":["PR_17","PR_18"]');
  });

  it("keeps a shared-commit sibling when one pull request disappears during pagination", async () => {
    const secondSeed = { ...paginatedSeed, id: "PR_18", number: 18 };
    const octokit = new Octokit({
      request: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const requestBody = typeof init?.body === "string" ? init.body : "";
          const continuation = requestBody.includes("PullRequestCloudflareCheckRunPage");
          const suite = checkSuite(continuation ? lastCheckRunPage : firstCheckRunPage);
          const data = continuation
            ? { pullRequests: [null, pullRequest(secondSeed.id)], suite }
            : {
                commits: [
                  {
                    __typename: "Commit",
                    ...paginatedCommit,
                    checkSuites: { totalCount: 1, nodes: [suite] },
                  },
                ],
                pullRequests: [pullRequest(), pullRequest(secondSeed.id)],
              };
          return new Response(
            JSON.stringify({
              data,
              ...(continuation
                ? {
                    errors: [
                      {
                        type: "NOT_FOUND",
                        path: ["pullRequests", 0],
                        message: "Could not resolve the pull request.",
                      },
                    ],
                  }
                : {}),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      },
    });

    const reads = await readGitHubCloudflareWorkerChecks({
      octokit,
      signal: new AbortController().signal,
      ghRepoId: "42",
      heads: [paginatedSeed, secondSeed],
    });

    expect(reads.get(checkHeadBase.id)).toEqual({ state: "unavailable" });
    expect(reads.get(secondSeed.id)?.state).toBe("available");
  });

  it("rejects an incomplete Cloudflare suite connection", async () => {
    const { reads, requestBodies } = await readPaginatedChecks({
      initialCheckSuiteTotalCount: 2,
    });

    expect(reads.get(checkHeadBase.id)).toEqual({ state: "unavailable" });
    expect(requestBodies).toHaveLength(1);
  });

  it("rejects a base change and malformed later check pages", async () => {
    const invalidContinuations = [
      {
        continuationPullRequests: [{ ...pullRequest(), baseRefOid: "b".repeat(40) }],
      },
      {
        continuationSuite: {
          ...checkSuite(lastCheckRunPage),
          app: { databaseId: 85455, slug: "another-app" },
        },
      },
      {
        continuationSuite: {
          ...checkSuite(lastCheckRunPage),
          app: { databaseId: 1, slug: "cloudflare-workers-and-pages" },
        },
      },
      {
        continuationSuite: checkSuite({ ...lastCheckRunPage, totalCount: 102 }),
      },
      {
        continuationSuite: checkSuite({
          ...lastCheckRunPage,
          nodes: [checkRun(100)],
        }),
      },
      {
        continuationSuite: checkSuite({
          totalCount: 102,
          pageInfo: { hasNextPage: true, endCursor: "check-cursor-100" },
          nodes: [checkRun(101)],
        }),
      },
    ];

    for (const invalid of invalidContinuations) {
      const { reads } = await readPaginatedChecks(invalid);
      expect(reads.get(checkHeadBase.id)).toEqual({ state: "unavailable" });
    }
  });
});
