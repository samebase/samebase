import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("verified GitHub App installation completion", () => {
  it("atomically creates a personal organization, saves its user authorization, and consumes state", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "owner@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "setup-state",
        returnToPath: "/",
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });

    const result = await t.mutation(internal.githubAppInstallation.completeVerifiedSetup, {
      setupStateId,
      state: "setup-state",
      installationId: "1001",
      githubOwnerId: "101",
      githubOwnerType: "user",
      githubOwnerLogin: "owner",
      githubUserId: "101",
      githubUserLogin: "owner",
      accessToken: "access-token",
      accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        organization: await ctx.db.get(result.organizationId),
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      };
    });

    expect(result.created).toBe(true);
    expect(snapshot.organization).toMatchObject({
      githubOwnerId: "101",
      githubInstallationId: "1001",
    });
    expect(snapshot.authorization).toMatchObject({
      userId,
      githubUserId: "101",
      githubUserLogin: "owner",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(snapshot.setupState).toBeNull();
    await expect(
      t
        .withIdentity({
          subject: `${userId}|test-session`,
          tokenIdentifier: `test:${userId}`,
        })
        .query(api.organizations.listForViewer, {}),
    ).resolves.toMatchObject([{ canCreateRepository: true }]);
  });
});
