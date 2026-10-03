import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  fetchConvexTeamTokenDetails: vi.fn(),
  createCloudflareClient: vi.fn(),
  getCloudflareAccounts: vi.fn(),
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
    createCloudflareClient: providerMocks.createCloudflareClient.mockImplementation(
      actual.createCloudflareClient,
    ),
  };
});

vi.mock("./cloudflareApi/generated/sdk.gen", () => ({
  Cloudflare: {
    GET: { "/accounts": providerMocks.getCloudflareAccounts },
  },
}));

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import type { OAuthProvider } from "./oauthState";

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
type CallbackScenario = (typeof callbackScenarios)[number];
type TestBackend = ReturnType<typeof makeConvexTest>;

async function createCloudflareMcpCallbackState(
  t: TestBackend,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    state: string;
    clientId: string;
    codeVerifier: string;
    returnToPath?: string;
    createdAt: number;
    expiresAt: number;
  },
): Promise<void> {
  await t.mutation(internal.oauthState.createOauthState, {
    provider: "cloudflare_mcp",
    userId: args.userId,
    organizationId: args.organizationId,
    returnToPath: args.returnToPath,
    state: args.state,
    clientId: args.clientId,
    codeVerifier: args.codeVerifier,
    createdAt: args.createdAt,
    expiresAt: args.expiresAt,
  });
}
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
const reusedCloudflareGrantScenarios = [
  {
    provider: "cloudflare",
    path: "/oauth/cloudflare/callback",
    tokenEndpoint: "https://dash.cloudflare.com/oauth2/token",
    clientId: undefined,
    codeVerifier: undefined,
    auth: {
      method: "oauth" as const,
      credential: "stored-access-token",
      refreshCredential: "shared-refresh-token",
      credentialExpiresAt: Date.now() + 60_000,
    },
    tokenResponse: {
      access_token: "exchanged-access-token",
      refresh_token: "shared-refresh-token",
      expires_in: 3_600,
    },
  },
  {
    provider: "cloudflare_mcp",
    path: "/oauth/cloudflare-mcp/callback",
    tokenEndpoint: "https://mcp.cloudflare.com/token",
    clientId: "shared-client-id",
    codeVerifier: "cloudflare-mcp-code-verifier",
    auth: {
      method: "mcp_oauth" as const,
      credential: "stored-access-token",
      refreshCredential: "shared-refresh-token",
      credentialExpiresAt: Date.now() + 60_000,
      clientId: "shared-client-id",
    },
    tokenResponse: {
      access_token: "exchanged-access-token",
      refresh_token: "shared-refresh-token",
      expires_in: 3_600,
    },
  },
] as const;
const safeCloudflareCleanupCases = reusedCloudflareGrantScenarios.flatMap((scenario) =>
  (["access_lost", "snapshot_changed"] as const).map((failure) => ({ ...scenario, failure })),
);
const invalidInitialCloudflareGrantCases = reusedCloudflareGrantScenarios.flatMap((scenario) => [
  {
    ...scenario,
    accountCase: "no_accounts",
    accounts: [],
  },
  {
    ...scenario,
    accountCase: "several_accounts",
    accounts: [
      { id: "first-account", name: "First Account" },
      { id: "second-account", name: "Second Account" },
    ],
  },
]);

function readCompletionEventType(provider: OAuthProvider) {
  switch (provider) {
    case "convex":
      return "convex-oauth-complete";
    case "cloudflare":
      return "cloudflare-oauth-complete";
    case "cloudflare_mcp":
      return "cloudflare-mcp-oauth-complete";
    default:
      provider satisfies never;
      return "convex-oauth-complete";
  }
}

async function createCallbackState(
  t: TestBackend,
  args: {
    organizationId: Id<"organizations">;
    scenario: CallbackScenario;
    state: string;
    userId: Id<"users">;
  },
) {
  const now = Date.now();
  const commonState = {
    userId: args.userId,
    organizationId: args.organizationId,
    state: args.state,
    createdAt: now,
    expiresAt: now + 60_000,
  };
  switch (args.scenario.provider) {
    case "convex":
      await t.mutation(internal.oauthState.createOauthState, {
        ...commonState,
        provider: "convex",
        codeVerifier: "convex-code-verifier",
      });
      return;
    case "cloudflare":
      await t.mutation(internal.oauthState.createOauthState, {
        ...commonState,
        provider: "cloudflare",
      });
      return;
    case "cloudflare_mcp":
      await createCloudflareMcpCallbackState(t, {
        ...commonState,
        clientId: "cloudflare-client",
        codeVerifier: "cloudflare-code-verifier",
      });
      return;
    default:
      args.scenario satisfies never;
  }
}

async function expectCompletionResponse(
  response: Response,
  args: { eventType: string; returnUrl: string },
) {
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(html).toContain(`const returnTo = ${JSON.stringify(args.returnUrl)};`);
  expect(html).toContain(`{ type: "${args.eventType}", returnTo }`);
  expect(html).toContain("window.opener.location.replace(returnTo);");
  expect(html).toContain("window.close();");
  expect(html).toContain("window.location.replace(returnTo);");
  return html;
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.fetchConvexTeamTokenDetails.mockResolvedValue({ teamId: "convex-team" });
  providerMocks.getCloudflareAccounts.mockResolvedValue({
    result: [{ id: "cloudflare-account", name: "Cloudflare Account" }],
  });
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
          state: "active",
          email: `${scenario.provider}@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
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
      await createCallbackState(t, {
        userId,
        organizationId,
        scenario,
        state,
      });

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

      await expectCompletionResponse(response, {
        eventType: readCompletionEventType(scenario.provider),
        returnUrl: buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: scenario.provider === "convex" ? "convex" : "cloudflare",
          code: "access-changed",
        }),
      });
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
    "rejects a stale $provider callback before provider exchange for a deleted user",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-deleted@example.test`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-deleted-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: `${scenario.provider}-deleted-owner`,
          githubInstallationId: `${scenario.provider}-deleted-installation`,
        },
      );
      const state = `${scenario.provider}-deleted-state`;
      await createCallbackState(t, { organizationId, scenario, state, userId });
      await t.run(async (ctx) => {
        await ctx.db.replace(userId, { state: "deleted", deletedAt: Date.now() });
      });
      const providerFetch = vi.fn();
      vi.stubGlobal("fetch", providerFetch);

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`);

      expect(response.status).toBe(400);
      await expect(response.text()).resolves.toBe("Invalid OAuth state");
      expect(providerFetch).not.toHaveBeenCalled();
      expect(providerMocks.fetchConvexTeamTokenDetails).not.toHaveBeenCalled();
      expect(providerMocks.getCloudflareAccounts).not.toHaveBeenCalled();
    },
  );

  it.each(callbackScenarios)(
    "returns $provider provider-declined callbacks to the scoped route",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-declined@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
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
          await createCloudflareMcpCallbackState(t, {
            ...commonState,
            clientId: "cloudflare-client",
            codeVerifier: "cloudflare-code-verifier",
          });
          break;
        default:
          scenario satisfies never;
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const response = await t.fetch(`${scenario.path}?error=access_denied&state=${state}`, {
        redirect: "manual",
      });

      await expectCompletionResponse(response, {
        eventType: readCompletionEventType(scenario.provider),
        returnUrl: buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: scenario.provider === "convex" ? "convex" : "cloudflare",
          code: "canceled",
        }),
      });
    },
  );

  it("returns a safe failure code without exposing a Cloudflare response", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "cloudflare-exchange-failure@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    });
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "cloudflare-failure-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "OAuth-Owner",
        githubInstallationId: "cloudflare-failure-installation",
      },
    );
    const state = "cloudflare-exchange-failure-state";
    await t.mutation(internal.oauthState.createOauthState, {
      provider: "cloudflare",
      userId,
      organizationId,
      state,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
    vi.stubEnv(
      "PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL",
      "https://api.samebase.com/oauth/cloudflare",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error_description: "provider-secret-detail" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const response = await t.fetch(`/oauth/cloudflare/callback?code=provider-code&state=${state}`);
    const html = await expectCompletionResponse(response, {
      eventType: "cloudflare-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
        provider: "cloudflare",
        code: "failed",
      }),
    });
    expect(html).not.toContain("provider-code");
    expect(html).not.toContain("provider-secret-detail");
  });

  it.each(storageBoundaryScenarios)(
    "navigates the opener to the scoped return URL after successful $provider callbacks",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-success@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
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
          await createCloudflareMcpCallbackState(t, {
            ...commonState,
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
      const oauthState = await t.run(async (ctx) =>
        ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_state", (query) => query.eq("state", state))
          .unique(),
      );
      expect(oauthState).toBeNull();
    },
  );

  it.each(storageBoundaryCases)(
    "returns $provider callbacks to the scoped route when owner access becomes $accessChange at storage",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-storage@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
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
          await createCloudflareMcpCallbackState(t, {
            ...commonState,
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
      await expectCompletionResponse(response, {
        eventType: scenario.completionEventType,
        returnUrl: buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: scenario.provider === "convex" ? "convex" : "cloudflare",
          code: "access-changed",
        }),
      });
      const snapshot = await t.run(async (ctx) => ({
        credentials: await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .unique(),
        oauthState: await ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_state", (query) => query.eq("state", state))
          .unique(),
      }));
      expect(snapshot.credentials).toBeNull();
      expect(snapshot.oauthState).toBeNull();
    },
  );

  it.each(invalidInitialCloudflareGrantCases)(
    "rejects a first $provider connection with $accountCase and consumes OAuth state",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-${scenario.accountCase}@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-${scenario.accountCase}-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-${scenario.accountCase}-installation`,
        },
      );
      const state = `${scenario.provider}-${scenario.accountCase}-state`;
      const commonState = {
        userId,
        organizationId,
        state,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      };
      if (scenario.provider === "cloudflare") {
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
      } else {
        await createCloudflareMcpCallbackState(t, {
          ...commonState,
          clientId: scenario.clientId,
          codeVerifier: scenario.codeVerifier,
        });
        vi.stubEnv(
          "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
          "https://api.samebase.com/oauth/cloudflare-mcp",
        );
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");
      providerMocks.getCloudflareAccounts.mockResolvedValue({ result: scenario.accounts });
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify(scenario.tokenResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`);

      await expectCompletionResponse(response, {
        eventType:
          scenario.provider === "cloudflare"
            ? "cloudflare-oauth-complete"
            : "cloudflare-mcp-oauth-complete",
        returnUrl: buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: "cloudflare",
          code: "target-mismatch",
        }),
      });
      expect(providerMocks.createCloudflareClient).toHaveBeenCalledWith({
        token: scenario.tokenResponse.access_token,
        transport: scenario.provider === "cloudflare" ? "direct" : "mcp",
      });
      expect(providerMocks.getCloudflareAccounts).toHaveBeenCalledWith({
        client: providerMocks.createCloudflareClient.mock.results.at(-1)?.value,
        query: { page: 1, per_page: 5 },
      });
      const snapshot = await t.run(async (ctx) => ({
        credentials: await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .unique(),
        oauthState: await ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_state", (query) => query.eq("state", state))
          .unique(),
        organization: await ctx.db.get(organizationId),
      }));
      expect(snapshot.credentials).toBeNull();
      expect(snapshot.oauthState).toBeNull();
      expect(snapshot.organization).not.toHaveProperty("cloudflareAccount");
    },
  );

  it.each(safeCloudflareCleanupCases)(
    "keeps the current $provider grant after $failure at storage",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-current-grant@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-current-grant-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-current-grant-installation`,
        },
      );
      const initialAuth =
        scenario.failure === "access_lost"
          ? scenario.auth
          : scenario.provider === "cloudflare"
            ? {
                method: "oauth" as const,
                credential: "old-access-token",
                refreshCredential: "old-refresh-token",
                credentialExpiresAt: Date.now() + 60_000,
              }
            : {
                method: "mcp_oauth" as const,
                credential: "old-access-token",
                refreshCredential: "old-refresh-token",
                credentialExpiresAt: Date.now() + 60_000,
                clientId: scenario.clientId,
              };
      await t.run(async (ctx) => {
        await ctx.db.patch(organizationId, {
          cloudflareAccount: {
            accountId: "cloudflare-account",
            accountName: "Cloudflare Account",
          },
        });
        await ctx.db.insert("organizationProviderCredentials", {
          organizationId,
          cloudflare: {
            auth: initialAuth,
            connectedByUserId: userId,
            updatedAt: Date.now(),
          },
        });
      });

      const state = `${scenario.provider}-current-grant-state`;
      const now = Date.now();
      if (scenario.provider === "cloudflare") {
        await t.mutation(internal.oauthState.createOauthState, {
          provider: "cloudflare",
          userId,
          organizationId,
          state,
          createdAt: now,
          expiresAt: now + 60_000,
        });
        vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
        vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
        vi.stubEnv(
          "PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL",
          "https://api.samebase.com/oauth/cloudflare",
        );
      } else {
        await createCloudflareMcpCallbackState(t, {
          userId,
          organizationId,
          state,
          clientId: scenario.clientId,
          codeVerifier: scenario.codeVerifier,
          createdAt: now,
          expiresAt: now + 60_000,
        });
        vi.stubEnv(
          "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
          "https://api.samebase.com/oauth/cloudflare-mcp",
        );
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const requestUrl =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        expect(requestUrl).toBe(scenario.tokenEndpoint);
        await t.run(async (ctx) => {
          if (scenario.failure === "access_lost") {
            const membership = await ctx.db
              .query("organizationMemberships")
              .withIndex("by_organization_and_user", (query) =>
                query.eq("organizationId", organizationId).eq("userId", userId),
              )
              .unique();
            if (membership === null) throw new Error("Expected owner membership.");
            await ctx.db.patch(membership._id, { role: "member" });
            return;
          }
          const credentials = await ctx.db
            .query("organizationProviderCredentials")
            .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
            .unique();
          if (credentials?.cloudflare === undefined) {
            throw new Error("Expected Cloudflare credentials.");
          }
          await ctx.db.patch(credentials._id, {
            cloudflare: {
              ...credentials.cloudflare,
              auth: scenario.auth,
              updatedAt: Date.now(),
            },
          });
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

      await expectCompletionResponse(response, {
        eventType:
          scenario.provider === "cloudflare"
            ? "cloudflare-oauth-complete"
            : "cloudflare-mcp-oauth-complete",
        returnUrl: buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: "cloudflare",
          code: scenario.failure === "access_lost" ? "access-changed" : "configuration-changed",
        }),
      });
      expect(fetch).toHaveBeenCalledOnce();
      const snapshot = await t.run(async (ctx) => ({
        credentials: await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .unique(),
        oauthState: await ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_state", (query) => query.eq("state", state))
          .unique(),
      }));
      expect(snapshot.credentials?.cloudflare?.auth).toEqual(scenario.auth);
      expect(snapshot.oauthState).toBeNull();
    },
  );

  it("keeps the configured Convex team and credential after a callback selects another team", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "convex-target-mismatch@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    });
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "convex-target-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "OAuth-Owner",
        githubInstallationId: "convex-target-installation",
      },
    );
    const storedAuth = { method: "oauth" as const, credential: "stored-convex-token" };
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, {
        convexTeam: { teamId: "configured-team", teamSlug: "configured-team" },
      });
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: { auth: storedAuth, connectedByUserId: userId, updatedAt: 1 },
      });
    });
    const state = "convex-target-mismatch-state";
    await t.mutation(internal.oauthState.createOauthState, {
      provider: "convex",
      userId,
      organizationId,
      returnToPath: "/org/oauth-owner/providers?prod-ui#connections",
      state,
      codeVerifier: "convex-code-verifier",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    providerMocks.fetchConvexTeamTokenDetails.mockResolvedValue({ teamId: "other-team" });
    vi.stubEnv("SITE_URL", "https://samebase.com");
    vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID", "convex-client");
    vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_SECRET", "convex-secret");
    vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://api.samebase.com/oauth/convex");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ access_token: "new-convex-token", token_type: "bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const response = await t.fetch(`/oauth/convex/callback?code=provider-code&state=${state}`);
    const html = await expectCompletionResponse(response, {
      eventType: "convex-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(
        "https://samebase.com/org/oauth-owner/providers?prod-ui#connections",
        { provider: "convex", code: "target-mismatch" },
      ),
    });
    const snapshot = await t.run(async (ctx) => ({
      credentials: await ctx.db
        .query("organizationProviderCredentials")
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
        .unique(),
      oauthState: await ctx.db
        .query("providerOAuthCallbackStates")
        .withIndex("by_state", (query) => query.eq("state", state))
        .unique(),
      organization: await ctx.db.get(organizationId),
    }));
    expect(snapshot.organization?.convexTeam).toEqual({
      teamId: "configured-team",
      teamSlug: "configured-team",
    });
    expect(snapshot.credentials?.convex?.auth).toEqual(storedAuth);
    expect(snapshot.oauthState).toBeNull();
    expect(html).not.toContain("provider-code");
    expect(html).not.toContain("new-convex-token");
  });

  it.each(reusedCloudflareGrantScenarios)(
    "keeps the configured Cloudflare account and credential after a $provider callback exposes another account too",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${scenario.provider}-target-mismatch@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
      });
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-target-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-target-installation`,
        },
      );
      await t.run(async (ctx) => {
        await ctx.db.patch(organizationId, {
          cloudflareAccount: {
            accountId: "configured-account",
            accountName: "Configured Account",
          },
        });
        await ctx.db.insert("organizationProviderCredentials", {
          organizationId,
          cloudflare: {
            auth: scenario.auth,
            connectedByUserId: userId,
            updatedAt: 1,
          },
        });
      });
      const state = `${scenario.provider}-target-mismatch-state`;
      const commonState = {
        userId,
        organizationId,
        returnToPath: "/org/oauth-owner/providers?prod-ui#connections",
        state,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      };
      if (scenario.provider === "cloudflare") {
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
      } else {
        await createCloudflareMcpCallbackState(t, {
          ...commonState,
          clientId: scenario.clientId,
          codeVerifier: scenario.codeVerifier,
        });
        vi.stubEnv(
          "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
          "https://api.samebase.com/oauth/cloudflare-mcp",
        );
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");
      providerMocks.getCloudflareAccounts.mockResolvedValue({
        result: [
          { id: "configured-account", name: "Configured Account" },
          { id: "other-account", name: "Other Account" },
        ],
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify(scenario.tokenResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`);
      const html = await expectCompletionResponse(response, {
        eventType:
          scenario.provider === "cloudflare"
            ? "cloudflare-oauth-complete"
            : "cloudflare-mcp-oauth-complete",
        returnUrl: buildAuthorizationErrorUrl(
          "https://samebase.com/org/oauth-owner/providers?prod-ui#connections",
          { provider: "cloudflare", code: "target-mismatch" },
        ),
      });
      const snapshot = await t.run(async (ctx) => ({
        credentials: await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .unique(),
        oauthState: await ctx.db
          .query("providerOAuthCallbackStates")
          .withIndex("by_state", (query) => query.eq("state", state))
          .unique(),
        organization: await ctx.db.get(organizationId),
      }));
      expect(snapshot.organization?.cloudflareAccount).toEqual({
        accountId: "configured-account",
        accountName: "Configured Account",
      });
      expect(snapshot.credentials?.cloudflare?.auth).toEqual(scenario.auth);
      expect(snapshot.oauthState).toBeNull();
      expect(html).not.toContain("provider-code");
      expect(html).not.toContain("exchanged-access-token");
    },
  );
});
