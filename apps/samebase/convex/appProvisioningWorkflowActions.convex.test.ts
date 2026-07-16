import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function createGitHubProvisioningRun() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      githubAccountId: 101,
      auth: {
        method: "api_key",
        credential: "github-token",
      },
      username: "ada",
      createdAt: 1,
      updatedAt: 1,
    });
    return userId;
  });
  const ids = await t.mutation(
    internal.vault.records.createInitializingSamebaseManagedVaultForUser,
    {
      userId,
      ghRepoOwner: "old-owner",
      ghRepoName: "old-name",
      visibility: "private",
      convexProjectName: "old-name",
      cloudflareAccountId: "cloudflare-account",
      cloudflareWorkerName: "old-name",
    },
  );
  return { ...ids, t, userId };
}

function repositoryIdentityResponse(databaseId: number): Response {
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          __typename: "Repository",
          id: "R_stable",
          databaseId,
          name: "new-name",
          nameWithOwner: "new-owner/new-name",
          owner: { login: "new-owner", databaseId: 7 },
        },
        rateLimit: {
          cost: 1,
          limit: 5_000,
          remaining: 4_999,
          resetAt: "2026-07-16T12:00:00Z",
        },
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

describe("app provisioning workflow actions", () => {
  it("allows free approved members to validate app creation when providers are connected", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        githubAccountId: 101,
        auth: {
          method: "api_key",
          credential: "github-token",
        },
        username: "ada",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: "convex-team",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "api_key",
          credential: "cloudflare-token",
        },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare-account",
          accountName: "Ada Cloudflare",
        },
        createdAt: 1,
        updatedAt: 1,
      });
      return userId;
    });
    const { vaultId, runId } = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "demo",
        visibility: "private",
        convexProjectName: "ada-demo",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "ada-demo",
      },
    );

    await expect(
      t.action(internal.appProvisioningWorkflowActions.validateCreateAppConnections, {
        vaultId,
        runId,
        userId,
        repositoryName: "demo",
        repositoryOwner: "ada",
      }),
    ).resolves.toBeNull();
  });

  it("resolves stable GitHub identity immediately before starter seeding", async () => {
    const { runId, t, userId, vaultId } = await createGitHubProvisioningRun();
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url === "https://api.github.com/graphql") {
          return repositoryIdentityResponse(42);
        }
        if (request.url.includes("/git/blobs")) {
          return new Response(JSON.stringify({ sha: "blob-sha" }));
        }
        if (request.url.includes("/git/trees")) {
          return new Response(JSON.stringify({ sha: "tree-sha" }));
        }
        if (request.url.includes("/git/commits")) {
          return new Response(JSON.stringify({ sha: "commit-sha" }));
        }
        if (request.url.includes("/git/refs")) {
          return new Response(JSON.stringify({ ref: "refs/heads/main" }));
        }
        return new Response("Unexpected request", { status: 500 });
      }),
    );

    await expect(
      t.action(internal.appProvisioningWorkflowActions.seedStarterRepository, {
        vaultId,
        runId,
        userId,
        ghRepoId: "42",
        ghRepoNodeId: "R_stable",
        defaultBranch: "main",
      }),
    ).resolves.toBeNull();

    const restUrls = requests
      .map((request) => request.url)
      .filter((url) => url !== "https://api.github.com/graphql");
    expect(restUrls.length).toBeGreaterThan(0);
    expect(restUrls.every((url) => url.includes("/repos/new-owner/new-name/"))).toBe(true);
    expect(restUrls.some((url) => url.includes("/repos/old-owner/old-name/"))).toBe(false);
  });

  it("does not seed when stable GitHub identity resolves to another repository", async () => {
    const { runId, t, userId, vaultId } = await createGitHubProvisioningRun();
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        return repositoryIdentityResponse(99);
      }),
    );

    await expect(
      t.action(internal.appProvisioningWorkflowActions.seedStarterRepository, {
        vaultId,
        runId,
        userId,
        ghRepoId: "42",
        ghRepoNodeId: "R_stable",
        defaultBranch: "main",
      }),
    ).rejects.toThrow("GitHub returned another repository.");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/graphql");
  });
});
