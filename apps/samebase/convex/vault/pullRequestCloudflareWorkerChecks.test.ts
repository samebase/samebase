import { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vite-plus/test";

import {
  readGitHubCloudflareWorkerChecks,
  resolveCloudflareWorkerCheckRuns,
  type CloudflareWorkerCheckRunInput,
} from "./pullRequestCloudflareWorkerChecks";
import { CLOUDFLARE_WORKER_PROOF_SOURCE } from "./pullRequestCloudflareWorkerProof";

const accountId = "fe57d01d7ab41f60d00ba1aade20eb33";
const successfulCheck: CloudflareWorkerCheckRunInput = {
  id: "CR_kwDOPOZOdc8AAAAWUQUNGg",
  name: "Workers Builds: samebase",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  detailsUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/samebase/production/builds/8f72f2d5-3da6-4047-8101-17131571dc29`,
  externalId: "8f72f2d5-3da6-4047-8101-17131571dc29",
  title: "Workers Builds: samebase",
  summary: `
Build ID: [8f72f2d5-3da6-4047-8101-17131571dc29](https://dash.cloudflare.com/${accountId}/workers/services/view/samebase/production/builds/8f72f2d5-3da6-4047-8101-17131571dc29)
Script: [samebase](https://dash.cloudflare.com/${accountId}/workers/services/view/samebase/production)
Version ID: bfd78c45-2f56-462b-a2be-44cd88b2c155
Preview URL: https://bfd78c45-samebase.pfp.workers.dev
Preview Alias URL: https://codex-connect-repo-without-providers-samebase.pfp.workers.dev
`,
};
const failedCheck: CloudflareWorkerCheckRunInput = {
  ...successfulCheck,
  id: "CR_kwDOPOZOdc8AAAAWVLWXIA",
  conclusion: "FAILURE",
  detailsUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/samebase/production/builds/332ebfc3-db8b-4584-9f73-863c5e6da3ab`,
  externalId: "332ebfc3-db8b-4584-9f73-863c5e6da3ab",
  summary: `
Build ID: [332ebfc3-db8b-4584-9f73-863c5e6da3ab](https://dash.cloudflare.com/${accountId}/workers/services/view/samebase/production/builds/332ebfc3-db8b-4584-9f73-863c5e6da3ab)
Script: [samebase](https://dash.cloudflare.com/${accountId}/workers/services/view/samebase/production)
`,
};
const proxyCheck: CloudflareWorkerCheckRunInput = {
  ...successfulCheck,
  id: "CR_kwDOPOZOdc8AAAAWUPY5ag",
  name: "Workers Builds: samebase-posthog-proxy",
  detailsUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/samebase-posthog-proxy/production/builds/ae87609d-7cf6-4c0b-8c1f-0c6069397047`,
  externalId: "ae87609d-7cf6-4c0b-8c1f-0c6069397047",
  title: "Workers Builds: samebase-posthog-proxy",
  summary: `
Build ID: [ae87609d-7cf6-4c0b-8c1f-0c6069397047](https://dash.cloudflare.com/${accountId}/workers/services/view/samebase-posthog-proxy/production/builds/ae87609d-7cf6-4c0b-8c1f-0c6069397047)
Script: [samebase-posthog-proxy](https://dash.cloudflare.com/${accountId}/workers/services/view/samebase-posthog-proxy/production)
`,
};

it("selects checks as the Worker proof source", () => {
  expect(CLOUDFLARE_WORKER_PROOF_SOURCE).toBe("checks");
});

describe("resolveCloudflareWorkerCheckRuns", () => {
  it("keeps the newest check for each Worker across current commits", () => {
    expect(
      resolveCloudflareWorkerCheckRuns([
        { checkRuns: [successfulCheck, proxyCheck] },
        { checkRuns: [] },
        { checkRuns: [failedCheck] },
      ]),
    ).toEqual({
      state: "available",
      workers: [
        {
          accountId,
          buildState: "failure",
          buildUuid: "332ebfc3-db8b-4584-9f73-863c5e6da3ab",
          logsUrl: failedCheck.detailsUrl,
          name: "samebase",
          previewUrl: null,
        },
        {
          accountId,
          buildState: "success",
          buildUuid: "ae87609d-7cf6-4c0b-8c1f-0c6069397047",
          logsUrl: proxyCheck.detailsUrl,
          name: "samebase-posthog-proxy",
          previewUrl: null,
        },
      ],
    });
  });

  it("keeps an earlier Worker check when a later commit has no check", () => {
    expect(
      resolveCloudflareWorkerCheckRuns([{ checkRuns: [successfulCheck] }, { checkRuns: [] }]),
    ).toMatchObject({
      state: "available",
      workers: [
        {
          buildState: "success",
          name: "samebase",
          previewUrl: "https://codex-connect-repo-without-providers-samebase.pfp.workers.dev",
        },
      ],
    });
  });

  it("accepts a stable preview alias without commit-preview fields", () => {
    const aliasOnlyCheck = {
      ...successfulCheck,
      summary: (successfulCheck.summary ?? "")
        .replace(/^Version ID:.*\n/m, "")
        .replace(/^Preview URL:.*\n/m, ""),
    };
    expect(resolveCloudflareWorkerCheckRuns([{ checkRuns: [aliasOnlyCheck] }])).toMatchObject({
      state: "available",
      workers: [
        {
          name: "samebase",
          previewUrl: "https://codex-connect-repo-without-providers-samebase.pfp.workers.dev",
        },
      ],
    });
  });

  it("fails closed for conflicting trusted identity", () => {
    expect(
      resolveCloudflareWorkerCheckRuns([
        { checkRuns: [{ ...successfulCheck, externalId: "different-build" }] },
      ]),
    ).toEqual({ state: "unavailable" });
    expect(
      resolveCloudflareWorkerCheckRuns([
        { checkRuns: [successfulCheck, { ...successfulCheck, id: "CR_duplicate" }] },
      ]),
    ).toEqual({ state: "unavailable" });
  });
});

const commits = [
  { id: "C_1", oid: "1".repeat(40) },
  { id: "C_2", oid: "2".repeat(40) },
];
const head = {
  id: "PR_17",
  baseRefOid: "a".repeat(40),
  headRefOid: "b".repeat(40),
  commits,
};

function generation(headRefOid = head.headRefOid) {
  return {
    __typename: "PullRequest",
    id: head.id,
    state: "OPEN",
    repository: { databaseId: 42 },
    baseRefOid: head.baseRefOid,
    headRefOid,
  };
}

function run(index: number) {
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

function suite(checkRuns: {
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: ReturnType<typeof run>[];
}) {
  return {
    __typename: "CheckSuite",
    id: "CS_1",
    app: { databaseId: 85455, slug: "cloudflare-workers-and-pages" },
    checkRuns,
  };
}

function commitNodes(checkSuite?: ReturnType<typeof suite>) {
  return commits.map((commit, index) => ({
    __typename: "Commit",
    ...commit,
    checkSuites:
      index === 0 && checkSuite
        ? { totalCount: 1, nodes: [checkSuite] }
        : { totalCount: 0, nodes: [] },
  }));
}

function jsonResponse(data: unknown, errors?: unknown) {
  return new Response(JSON.stringify({ data, ...(errors ? { errors } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function readChecks(fetch: (requestBody: string) => Promise<Response>, inputHead = head) {
  const requestBodies: string[] = [];
  const octokit = new Octokit({
    request: {
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? init.body : "";
        requestBodies.push(body);
        return await fetch(body);
      },
    },
  });
  const reads = await readGitHubCloudflareWorkerChecks({
    octokit,
    signal: new AbortController().signal,
    ghRepoId: "42",
    heads: [inputHead],
  });
  return { reads, requestBodies };
}

describe("Cloudflare Worker check transport", () => {
  it("batches commit checks and validates the final pull request generation", async () => {
    const { reads, requestBodies } = await readChecks(async (body) =>
      body.includes("PullRequestCloudflareCheckGenerations")
        ? jsonResponse({ pullRequests: [generation()] })
        : jsonResponse({ commits: commitNodes() }),
    );

    expect(reads.get(head.id)).toEqual({ state: "available", workers: [] });
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toContain("checkType: LATEST");
    expect(requestBodies[0]).toContain('"commitIds":["C_1","C_2"]');
    expect(requestBodies[1]).toContain('"pullRequestIds":["PR_17"]');
  });

  it("rejects proof when the pull request generation changes", async () => {
    const { reads } = await readChecks(async (body) =>
      body.includes("PullRequestCloudflareCheckGenerations")
        ? jsonResponse({ pullRequests: [generation("c".repeat(40))] })
        : jsonResponse({ commits: commitNodes() }),
    );

    expect(reads.get(head.id)).toEqual({ state: "unavailable" });
  });

  it("follows more than 100 latest check runs without repeating pull request data", async () => {
    const firstPage = {
      totalCount: 101,
      pageInfo: { hasNextPage: true, endCursor: "cursor-100" },
      nodes: Array.from({ length: 100 }, (_value, index) => run(index + 1)),
    };
    const finalPage = {
      totalCount: 101,
      pageInfo: { hasNextPage: false, endCursor: "cursor-101" },
      nodes: [run(101)],
    };
    const { reads, requestBodies } = await readChecks(async (body) => {
      if (body.includes("PullRequestCloudflareCheckRunPage")) {
        return jsonResponse({ suite: suite(finalPage) });
      }
      if (body.includes("PullRequestCloudflareCheckGenerations")) {
        return jsonResponse({ pullRequests: [generation()] });
      }
      return jsonResponse({ commits: commitNodes(suite(firstPage)) });
    });

    expect(reads.get(head.id)).toEqual({ state: "available", workers: [] });
    expect(requestBodies).toHaveLength(3);
    expect(requestBodies[1]).toContain('"after":"cursor-100"');
    expect(requestBodies[1]).not.toContain("pullRequestIds");
  });

  it("fails closed when GitHub returns an error with partial check data", async () => {
    const { reads } = await readChecks(async (body) =>
      body.includes("PullRequestCloudflareCheckGenerations")
        ? jsonResponse({ pullRequests: [generation()] })
        : jsonResponse({ commits: commitNodes() }, [
            { type: "NOT_FOUND", path: ["commits", 0], message: "missing" },
          ]),
    );

    expect(reads.get(head.id)).toEqual({ state: "unavailable" });
  });
});
