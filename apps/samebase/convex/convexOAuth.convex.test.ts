import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Convex organization OAuth", () => {
  it("targets the organization and its exact selected connection", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "member@example.com",
        isApproved: true,
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
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: userId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "convex-credential" },
        teamId: "team-1",
      },
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
      providerConnectionId,
      userId,
    });
  });
});
