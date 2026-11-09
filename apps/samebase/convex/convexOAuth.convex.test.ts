import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { testCredential, makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("organization resource OAuth", () => {
  it.each(["convex", "cloudflare"] as const)(
    "binds $provider callback state and requests the provider resource with PKCE",
    async (provider) => {
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
            auth: { method: "api_key", credential: testCredential("convex-credential") },
            connectedByUserId: userId,
            updatedAt: 1,
          },
        });
        await ctx.db.patch(organizationId, {
          convexTeam: { teamId: "team-1" },
        });
      });
      vi.stubEnv("IDENTITY_HUB_ISSUER", "https://hub.example.test");
      vi.stubEnv("IDENTITY_HUB_CLIENT_ID", "convex-client");
      vi.stubEnv("CONVEX_SITE_URL", "https://samebase.test");
      const owner = t.withIdentity({
        subject: userId,
        tokenIdentifier: `test:${userId}`,
      });
      const authorizeUrl =
        provider === "convex"
          ? await owner.mutation(api.convexOAuth.getConvexOAuthUrl, { organizationId })
          : await owner.action(api.cloudflareOAuth.getCloudflareOAuthUrl, { organizationId });

      expect(authorizeUrl).toContain("https://hub.example.test/authorize?");
      expect(authorizeUrl).toContain("client_id=convex-client");
      expect(new URL(authorizeUrl).searchParams.get("resource")).toBe(
        provider === "convex" ? "https://api.convex.dev" : "https://api.cloudflare.com/client/v4/",
      );
      expect(new URL(authorizeUrl).searchParams.get("redirect_uri")).toBe(
        "https://samebase.test/oauth/hub/callback",
      );
      expect(new URL(authorizeUrl).searchParams.get("code_challenge_method")).toBe("S256");
      const oauthState = await t.run(async (ctx) => {
        return await ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .unique();
      });
      expect(oauthState).toMatchObject({
        organizationId,
        provider,
        userId,
        codeVerifier: expect.any(String),
        expectedProviderSnapshotHash: expect.any(String),
      });
    },
  );
});
