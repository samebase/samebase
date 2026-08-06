import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  fetchConvexTeamTokenDetails: vi.fn(),
  requestCloudflareApi: vi.fn(),
}));

vi.mock("./convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./convexManagementApi/client")>();
  return {
    ...actual,
    fetchConvexTeamTokenDetails: providerMocks.fetchConvexTeamTokenDetails,
  };
});

vi.mock("./cloudflareApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloudflareApi/client")>();
  return {
    ...actual,
    requestCloudflareApi: providerMocks.requestCloudflareApi,
  };
});

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

const callbackScenarios = [
  {
    provider: "convex",
    path: "/oauth/convex/callback",
    accessChange: "member",
  },
  {
    provider: "cloudflare",
    path: "/oauth/cloudflare/callback",
    accessChange: "removed",
  },
  {
    provider: "cloudflare_mcp",
    path: "/oauth/cloudflare-mcp/callback",
    accessChange: "member",
  },
] as const;

const storageBoundaryScenarios = [
  {
    completionEventType: "convex-oauth-complete",
    provider: "convex",
    path: "/oauth/convex/callback",
    tokenEndpoint: "https://api.convex.dev/oauth/token",
    tokenResponse: {
      access_token: "convex-access-token",
      token_type: "bearer",
    },
  },
  {
    completionEventType: "cloudflare-oauth-complete",
    provider: "cloudflare",
    path: "/oauth/cloudflare/callback",
    tokenEndpoint: "https://dash.cloudflare.com/oauth2/token",
    tokenResponse: {
      access_token: "cloudflare-access-token",
      refresh_token: "cloudflare-refresh-token",
      expires_in: 3_600,
    },
  },
  {
    completionEventType: "cloudflare-mcp-oauth-complete",
    provider: "cloudflare_mcp",
    path: "/oauth/cloudflare-mcp/callback",
    tokenEndpoint: "https://mcp.cloudflare.com/token",
    tokenResponse: {
      access_token: "cloudflare-mcp-access-token",
      refresh_token: "cloudflare-mcp-refresh-token",
      expires_in: 3_600,
    },
  },
] as const;
const storageBoundaryCases = storageBoundaryScenarios.flatMap((scenario) =>
  (["removed", "member"] as const).map((accessChange) => ({ ...scenario, accessChange })),
);

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.fetchConvexTeamTokenDetails.mockResolvedValue({ teamId: "convex-team" });
  providerMocks.requestCloudflareApi.mockResolvedValue([
    { id: "cloudflare-account", name: "Cloudflare Account" },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider OAuth callback organization returns", () => {
  it.each(callbackScenarios)(
    "returns $provider callbacks to the scoped route after owner access changes",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          email: `${scenario.provider}@example.com`,
          isApproved: true,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-installation`,
        },
      );
      const state = `${scenario.provider}-state`;
      const now = Date.now();
      const commonState = {
        userId,
        organizationId,
        state,
        createdAt: now,
        expiresAt: now + 60_000,
      };
      switch (scenario.provider) {
        case "convex":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "convex",
            codeVerifier: "convex-code-verifier",
          });
          break;
        case "cloudflare":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "cloudflare",
          });
          break;
        case "cloudflare_mcp":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "cloudflare_mcp",
            clientId: "cloudflare-client",
            codeVerifier: "cloudflare-code-verifier",
          });
          break;
        default:
          scenario satisfies never;
      }

      await t.run(async (ctx) => {
        const membership = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization_and_user", (query) =>
            query.eq("organizationId", organizationId).eq("userId", userId),
          )
          .unique();
        if (membership === null) {
          throw new Error("Organization membership is required for this test.");
        }
        if (scenario.accessChange === "member") {
          await ctx.db.patch(membership._id, { role: "member" });
        } else {
          await ctx.db.delete(membership._id);
        }
      });
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://samebase.com/org/oauth-owner/providers",
      );
      await expect(
        t.run(
          async (ctx) =>
            await ctx.db
              .query("providerOAuthCallbackStates")
              .withIndex("by_state", (query) => query.eq("state", state))
              .unique(),
        ),
      ).resolves.toBeNull();
    },
  );

  it.each(callbackScenarios)(
    "returns $provider provider-declined callbacks to the scoped route",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          email: `${scenario.provider}-declined@example.com`,
          isApproved: true,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-declined-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-declined-installation`,
        },
      );
      const state = `${scenario.provider}-declined-state`;
      const now = Date.now();
      await t.mutation(internal.oauthState.createOauthState, {
        provider: scenario.provider,
        userId,
        organizationId,
        state,
        createdAt: now,
        expiresAt: now + 60_000,
      });
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const response = await t.fetch(`${scenario.path}?error=access_denied&state=${state}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://samebase.com/org/oauth-owner/providers",
      );
    },
  );

  it.each(storageBoundaryScenarios)(
    "navigates the opener to the scoped return URL after successful $provider callbacks",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          email: `${scenario.provider}-success@example.com`,
          isApproved: true,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-success-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-success-installation`,
        },
      );
      const state = `${scenario.provider}-success-state`;
      const now = Date.now();
      const commonState = {
        userId,
        organizationId,
        state,
        createdAt: now,
        expiresAt: now + 60_000,
      };
      switch (scenario.provider) {
        case "convex":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "convex",
            codeVerifier: "convex-code-verifier",
          });
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID", "convex-client");
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_SECRET", "convex-secret");
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://api.samebase.com/oauth/convex");
          break;
        case "cloudflare":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "cloudflare",
          });
          vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
          vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
          vi.stubEnv(
            "PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL",
            "https://api.samebase.com/oauth/cloudflare",
          );
          break;
        case "cloudflare_mcp":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "cloudflare_mcp",
            clientId: "cloudflare-mcp-client",
            codeVerifier: "cloudflare-mcp-code-verifier",
          });
          vi.stubEnv(
            "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
            "https://api.samebase.com/oauth/cloudflare-mcp",
          );
          break;
        default:
          scenario satisfies never;
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const requestUrl =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        expect(requestUrl).toBe(scenario.tokenEndpoint);
        return new Response(JSON.stringify(scenario.tokenResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetch);

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`);
      const html = await response.text();
      const returnTo = "https://samebase.com/org/oauth-owner/providers";

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
      expect(html).toContain(`const returnTo = ${JSON.stringify(returnTo)};`);
      expect(html).toContain("window.opener.location.replace(returnTo);");
      expect(html).not.toContain("window.opener.location.reload()");
      expect(html).toContain(`{ type: "${scenario.completionEventType}", returnTo }`);
      expect(html).toContain("window.close();");
      expect(html).toContain("window.location.replace(returnTo);");
      await expect(
        t.run(
          async (ctx) =>
            await ctx.db
              .query("providerOAuthCallbackStates")
              .withIndex("by_state", (query) => query.eq("state", state))
              .unique(),
        ),
      ).resolves.toBeNull();
    },
  );

  it.each(storageBoundaryCases)(
    "returns $provider callbacks to the scoped route when owner access becomes $accessChange at storage",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          email: `${scenario.provider}-storage@example.com`,
          isApproved: true,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-storage-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-storage-installation`,
        },
      );
      const state = `${scenario.provider}-storage-state`;
      const now = Date.now();
      const commonState = {
        userId,
        organizationId,
        state,
        createdAt: now,
        expiresAt: now + 60_000,
      };
      switch (scenario.provider) {
        case "convex":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "convex",
            codeVerifier: "convex-code-verifier",
          });
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID", "convex-client");
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_SECRET", "convex-secret");
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://api.samebase.com/oauth/convex");
          break;
        case "cloudflare":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "cloudflare",
          });
          vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
          vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
          vi.stubEnv(
            "PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL",
            "https://api.samebase.com/oauth/cloudflare",
          );
          break;
        case "cloudflare_mcp":
          await t.mutation(internal.oauthState.createOauthState, {
            ...commonState,
            provider: "cloudflare_mcp",
            clientId: "cloudflare-mcp-client",
            codeVerifier: "cloudflare-mcp-code-verifier",
          });
          vi.stubEnv(
            "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
            "https://api.samebase.com/oauth/cloudflare-mcp",
          );
          break;
        default:
          scenario satisfies never;
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const requestUrl =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        expect(requestUrl).toBe(scenario.tokenEndpoint);
        await t.run(async (ctx) => {
          const membership = await ctx.db
            .query("organizationMemberships")
            .withIndex("by_organization_and_user", (query) =>
              query.eq("organizationId", organizationId).eq("userId", userId),
            )
            .unique();
          if (membership === null) {
            throw new Error("Organization membership is required for this test.");
          }
          if (scenario.accessChange === "member") {
            await ctx.db.patch(membership._id, { role: "member" });
          } else {
            await ctx.db.delete(membership._id);
          }
        });
        return new Response(JSON.stringify(scenario.tokenResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetch);

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`, {
        redirect: "manual",
      });

      expect(fetch).toHaveBeenCalledOnce();
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://samebase.com/org/oauth-owner/providers",
      );
      const snapshot = await t.run(async (ctx) => ({
        connection: await ctx.db
          .query("providerConnections")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .first(),
        oauthState: await ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_state", (query) => query.eq("state", state))
          .unique(),
      }));
      expect(snapshot.connection).toBeNull();
      expect(snapshot.oauthState).toBeNull();
    },
  );
});
