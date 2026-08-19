import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Convex organization OAuth", () => {
  it("binds callback state to the organization's current provider snapshot", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "member@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    });
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "owner-1",
        githubOwnerType: "organization",
        githubOwnerLogin: "Primary",
        githubInstallationId: "installation-1",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          auth: { method: "api_key", credential: "convex-credential" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
      await ctx.db.patch(organizationId, {
        convexTeam: { teamId: "team-1" },
      });
    });
    vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID", "convex-client");
    vi.stubEnv(
      "PROVIDER_CONVEX_OAUTH_REDIRECT_URL",
      "https://samebase.test/api/auth/convex/callback",
    );

    const authorizeUrl = await t
      .withIdentity({
        subject: `${userId}|session`,
        tokenIdentifier: `test:${userId}`,
      })
      .mutation(api.convexOAuth.getConvexOAuthUrl, { organizationId });

    expect(authorizeUrl).toContain("client_id=convex-client");
    const oauthState = await t.run(async (ctx) => {
      return await ctx.db
        .query("providerOAuthCallbackStates")
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
        .unique();
    });
    expect(oauthState).toMatchObject({
      organizationId,
      provider: "convex",
      userId,
      codeVerifier: expect.any(String),
      expectedProviderSnapshotHash: expect.any(String),
    });
  });
});
