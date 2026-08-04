import { describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("app provisioning workflow actions", () => {
  it("allows free approved members to validate app creation when providers are connected", async () => {
    const t = makeConvexTest();
    const {
      cloudflareProviderConnectionId,
      convexProviderConnectionId,
      githubProviderConnectionId,
      organizationId,
      userId,
    } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", { name: "Test organization" });
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
        state: "connected",
        kind: "github",
        organizationId,
        connectedByUserId: userId,
        accountId: "github-account",
        auth: {
          method: "api_key",
          credential: "github-token",
        },
        username: "ada",
        createdAt: 1,
        updatedAt: 1,
      });
      const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
        state: "connected",
        kind: "convex",
        organizationId,
        connectedByUserId: userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: "convex-team",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
      const cloudflareProviderConnectionId = await ctx.db.insert("providerConnections", {
        state: "connected",
        kind: "cloudflare",
        organizationId,
        connectedByUserId: userId,
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
      await ctx.db.patch(organizationId, {
        selectedGithubProviderConnectionId: githubProviderConnectionId,
        selectedConvexProviderConnectionId: convexProviderConnectionId,
        selectedCloudflareProviderConnectionId: cloudflareProviderConnectionId,
      });
      return {
        cloudflareProviderConnectionId,
        convexProviderConnectionId,
        githubProviderConnectionId,
        organizationId,
        userId,
      };
    });
    const { vaultId, runId } = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId,
        organizationId,
        githubProviderConnectionId,
        convexProviderConnectionId,
        cloudflareProviderConnectionId,
        ghRepoOwner: "ada",
        ghRepoName: "demo",
        visibility: "private",
        description: null,
        convexProjectName: "ada-demo",
        convexTeamId: "convex-team",
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

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/user") {
          return Response.json({ login: "ada" });
        }
        if (request.method === "POST" && url.pathname === "/user/repos") {
          return Response.json({
            id: 123,
            owner: { login: "ada" },
            name: "demo",
            private: true,
            default_branch: "main",
          });
        }
        throw new Error(`Unexpected GitHub request: ${request.method} ${url.pathname}`);
      }),
    );

    try {
      await expect(
        t.action(internal.appProvisioningWorkflowActions.createGitHubRepository, {
          vaultId,
          runId,
          userId,
          repositoryName: "demo",
          repositoryOwner: "ada",
          description: null,
          private: true,
        }),
      ).resolves.toEqual({
        ghRepoId: "123",
        ownerName: "ada",
        repoName: "demo",
        defaultBranch: "main",
        visibility: "private",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
