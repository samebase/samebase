import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

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
});
