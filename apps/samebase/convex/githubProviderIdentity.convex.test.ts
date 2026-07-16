import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function makeConnectedVaultTest(args: { githubOwner: string; githubName: string }) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      auth: {
        method: "api_key",
        credential: "github-token",
      },
      githubAccountId: 7,
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "old-owner/old-name",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      ghRepoNodeId: "R_123",
      githubOwner: args.githubOwner,
      githubName: args.githubName,
      routeRepositoryKey: "old-owner/old-name",
      routeOwner: "old-owner",
      routeName: "old-name",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 1,
    });
    await ctx.db.insert("vaultRepositorySummaries", {
      userId,
      vaultId,
      refreshEligibleAt: 0,
      lifecycle: { state: "idle" },
      publication: { state: "unobserved" },
    });

    return { userId, vaultId };
  });
  const asUser = t.withIdentity({
    subject: `${ids.userId}|test-session`,
    tokenIdentifier: `test:${ids.userId}`,
  });

  return { asUser, ids, t };
}

describe("GitHub provider identity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses canonical GitHub coordinates after looking up a vault by its stable route", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ method: request.method, url: request.url });
        if (
          request.method === "GET" &&
          request.url ===
            "https://api.github.com/repos/canonical-owner/canonical-name/contents/README.md?ref=main"
        ) {
          return Response.json({
            type: "file",
            content: "aGVsbG8=",
            encoding: "base64",
          });
        }

        throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`);
      }),
    );
    const { asUser } = await makeConnectedVaultTest({
      githubOwner: "canonical-owner",
      githubName: "canonical-name",
    });

    await expect(
      asUser.action(api.github.getRepositoryFileContent, {
        repositoryFullName: "old-owner/old-name",
        filePath: "README.md",
        branch: "main",
      }),
    ).resolves.toEqual({ exists: true, content: "hello" });

    expect(requests).toEqual([
      {
        method: "GET",
        url: "https://api.github.com/repos/canonical-owner/canonical-name/contents/README.md?ref=main",
      },
    ]);
  });

  it("resolves the stable repository id before creating a pull request", async () => {
    const requests: Array<{ method: string; pathname: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        requests.push({ method: request.method, pathname: url.pathname });

        if (request.method === "POST" && url.pathname === "/graphql") {
          return Response.json({
            data: {
              repository: {
                __typename: "Repository",
                id: "R_123",
                databaseId: 123,
                name: "canonical-name",
                nameWithOwner: "canonical-owner/canonical-name",
                owner: { login: "canonical-owner", databaseId: 456 },
              },
              rateLimit: {
                cost: 1,
                limit: 5_000,
                remaining: 4_000,
                resetAt: "2026-07-16T12:00:00.000Z",
              },
            },
          });
        }
        if (request.method === "GET" && url.pathname === "/repos/canonical-owner/canonical-name") {
          return Response.json({ default_branch: "main" });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/pulls"
        ) {
          return Response.json([]);
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/compare/main...feature"
        ) {
          return Response.json({ ahead_by: 1 });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/git/ref/heads%2Ffeature"
        ) {
          return Response.json({ object: { sha: "head-sha" } });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/git/commits/head-sha"
        ) {
          return Response.json({ message: "Ship the change" });
        }
        if (
          request.method === "POST" &&
          url.pathname === "/repos/canonical-owner/canonical-name/pulls"
        ) {
          return Response.json(
            {
              html_url: "https://github.com/canonical-owner/canonical-name/pull/7",
              number: 7,
            },
            { status: 201 },
          );
        }

        throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`);
      }),
    );
    const { asUser } = await makeConnectedVaultTest({
      githubOwner: "previous-owner",
      githubName: "previous-name",
    });

    await expect(
      asUser.action(api.fileStagingActions.createDraftPullRequest, {
        repositoryFullName: "old-owner/old-name",
        branch: "feature",
      }),
    ).resolves.toEqual({
      existing: false,
      number: 7,
      url: "https://github.com/canonical-owner/canonical-name/pull/7",
    });

    expect(requests.at(0)).toEqual({ method: "POST", pathname: "/graphql" });
    expect(requests).not.toContainEqual({
      method: "GET",
      pathname: "/repos/previous-owner/previous-name",
    });
    expect(requests.at(-1)).toEqual({
      method: "POST",
      pathname: "/repos/canonical-owner/canonical-name/pulls",
    });
  });

  it("reports partial success when a confirmed GitHub write cannot schedule observation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { asUser, ids, t } = await makeConnectedVaultTest({
      githubOwner: "canonical-owner",
      githubName: "canonical-name",
    });
    let pullListCount = 0;
    let githubAcceptedWrite = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname === "/graphql") {
          return Response.json({
            data: {
              repository: {
                __typename: "Repository",
                id: "R_123",
                databaseId: 123,
                name: "canonical-name",
                nameWithOwner: "canonical-owner/canonical-name",
                owner: { login: "canonical-owner", databaseId: 456 },
              },
              rateLimit: {
                cost: 1,
                limit: 5_000,
                remaining: 4_000,
                resetAt: "2026-07-16T12:00:00.000Z",
              },
            },
          });
        }
        if (request.method === "GET" && url.pathname === "/repos/canonical-owner/canonical-name") {
          return Response.json({ default_branch: "main" });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/pulls"
        ) {
          pullListCount += 1;
          return Response.json(
            pullListCount === 1
              ? []
              : [
                  {
                    number: 7,
                    html_url: "https://github.com/canonical-owner/canonical-name/pull/7",
                    updated_at: "2026-07-16T12:00:00.000Z",
                    base: { ref: "main" },
                    head: {
                      ref: "feature",
                      repo: { full_name: "canonical-owner/canonical-name" },
                    },
                  },
                ],
          );
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/compare/main...feature"
        ) {
          return Response.json({ ahead_by: 1 });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/git/ref/heads%2Ffeature"
        ) {
          return Response.json({ object: { sha: "head-sha" } });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/canonical-owner/canonical-name/git/commits/head-sha"
        ) {
          return Response.json({ message: "Ship the change" });
        }
        if (
          request.method === "POST" &&
          url.pathname === "/repos/canonical-owner/canonical-name/pulls"
        ) {
          githubAcceptedWrite = true;
          await t.run(async (ctx) => await ctx.db.delete(ids.vaultId));
          return Response.json(
            {
              html_url: "https://github.com/canonical-owner/canonical-name/pull/7",
              number: 7,
            },
            { status: 201 },
          );
        }

        throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`);
      }),
    );

    await expect(
      asUser.action(api.fileStagingActions.createDraftPullRequest, {
        repositoryFullName: "old-owner/old-name",
        branch: "feature",
      }),
    ).rejects.toThrow(
      "GitHub accepted the change, but Samebase could not schedule its repository update.",
    );
    expect(githubAcceptedWrite).toBe(true);
  });
});
