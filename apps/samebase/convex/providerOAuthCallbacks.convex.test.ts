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

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import { buildProviderOAuthCompletionUrl } from "../shared/providerOAuthReturn";
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
    storedAuth: { method: "oauth", credential: "convex-access-token" },
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
    storedAuth: {
      method: "oauth",
      credential: "cloudflare-access-token",
      refreshCredential: "cloudflare-refresh-token",
      credentialExpiresAt: expect.any(Number),
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
    storedAuth: {
      method: "mcp_oauth",
      credential: "cloudflare-mcp-access-token",
      refreshCredential: "cloudflare-mcp-refresh-token",
      credentialExpiresAt: expect.any(Number),
      clientId: "cloudflare-mcp-client",
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
    scenario: { provider: OAuthProvider };
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
      args.scenario.provider satisfies never;
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

async function insertApprovedUser(t: TestBackend, email: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
}

function signedInAs(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|session`,
    tokenIdentifier: `test:${userId}`,
  });
}

function stubProviderOAuthEnv(provider: OAuthProvider) {
  vi.stubEnv("SITE_URL", "https://samebase.com");
  switch (provider) {
    case "convex":
      vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID", "convex-client");
      vi.stubEnv("PROVIDER_CONVEX_OAUTH_CLIENT_SECRET", "convex-secret");
      vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://samebase.com/oauth/convex");
      return;
    case "cloudflare":
      vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
      vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
      vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL", "https://samebase.com/oauth/cloudflare");
      return;
    case "cloudflare_mcp":
      vi.stubEnv(
        "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
        "https://samebase.com/oauth/cloudflare-mcp",
      );
      return;
    default:
      provider satisfies never;
  }
}

async function readProviderOAuthSnapshot(
  t: TestBackend,
  args: { organizationId: Id<"organizations">; state: string },
) {
  return await t.run(async (ctx) => ({
    credentials: await ctx.db
      .query("organizationProviderCredentials")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .unique(),
    oauthState: await ctx.db
      .query("providerOAuthCallbackStates")
      .withIndex("by_state", (query) => query.eq("state", args.state))
      .unique(),
  }));
}

/**
Runs the provider redirect to the callback and then the owner's completion from
the app completion page, and returns the app URL the completion continues to.
*/
async function completeAsOwner(
  t: TestBackend,
  args: { provider: OAuthProvider; path: string; state: string; userId: Id<"users"> },
): Promise<string> {
  const callbackResponse = await t.fetch(`${args.path}?code=provider-code&state=${args.state}`);
  await expectCompletionResponse(callbackResponse, {
    eventType: readCompletionEventType(args.provider),
    returnUrl: buildProviderOAuthCompletionUrl({
      appOrigin: new URL("https://samebase.com"),
      completion: { provider: args.provider, state: args.state, code: "provider-code" },
    }),
  });
  return await signedInAs(t, args.userId).action(
    api.providerOAuthCompletion.completeProviderOAuth,
    { provider: args.provider, state: args.state, code: "provider-code" },
  );
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
    "returns $provider completions to the scoped route after owner access changes",
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

      await expect(
        completeAsOwner(t, { provider: scenario.provider, path: scenario.path, state, userId }),
      ).resolves.toBe(
        buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: scenario.provider === "convex" ? "convex" : "cloudflare",
          code: "access-changed",
        }),
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
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL", "https://samebase.com/oauth/cloudflare");
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

    const returnUrl = await completeAsOwner(t, {
      provider: "cloudflare",
      path: "/oauth/cloudflare/callback",
      state,
      userId,
    });

    expect(returnUrl).toBe(
      buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
        provider: "cloudflare",
        code: "failed",
      }),
    );
    expect(returnUrl).not.toContain("provider-code");
    expect(returnUrl).not.toContain("provider-secret-detail");
  });

  it.each(storageBoundaryScenarios)(
    "hands the $provider code to the app completion page without calling the provider",
    async (scenario) => {
      const t = makeConvexTest();
      const userId = await insertApprovedUser(t, `${scenario.provider}-handoff@example.com`);
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId,
          githubOwnerId: `${scenario.provider}-handoff-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-handoff-installation`,
        },
      );
      const state = `${scenario.provider}-handoff-state`;
      await createCallbackState(t, { organizationId, scenario, state, userId });
      stubProviderOAuthEnv(scenario.provider);
      const providerFetch = vi.fn();
      vi.stubGlobal("fetch", providerFetch);

      const response = await t.fetch(`${scenario.path}?code=provider-code&state=${state}`);

      const html = await expectCompletionResponse(response, {
        eventType: scenario.completionEventType,
        returnUrl: `https://samebase.com/oauth/provider-complete#provider=${scenario.provider}&state=${state}&code=provider-code`,
      });
      expect(html).not.toContain("window.opener.location.reload()");
      expect(providerFetch).not.toHaveBeenCalled();
      expect(providerMocks.fetchConvexTeamTokenDetails).not.toHaveBeenCalled();
      expect(providerMocks.getCloudflareAccounts).not.toHaveBeenCalled();
      await expect(readProviderOAuthSnapshot(t, { organizationId, state })).resolves.toMatchObject({
        credentials: null,
        oauthState: { state, userId },
      });
    },
  );

  it.each(storageBoundaryScenarios)(
    "stores the $provider credential and returns to the scoped route when the owner completes",
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
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://samebase.com/oauth/convex");
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
            "https://samebase.com/oauth/cloudflare",
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
            "https://samebase.com/oauth/cloudflare-mcp",
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

      const returnUrl = await completeAsOwner(t, {
        provider: scenario.provider,
        path: scenario.path,
        state,
        userId,
      });

      expect(returnUrl).toBe("https://samebase.com/org/oauth-owner/providers");
      expect(fetch).toHaveBeenCalledOnce();
      const snapshot = await readProviderOAuthSnapshot(t, { organizationId, state });
      expect(snapshot.oauthState).toBeNull();
      expect(
        scenario.provider === "convex"
          ? snapshot.credentials?.convex
          : snapshot.credentials?.cloudflare,
      ).toMatchObject({ auth: scenario.storedAuth, connectedByUserId: userId });
    },
  );

  it.each(storageBoundaryCases)(
    "returns $provider completions to the scoped route when owner access becomes $accessChange at storage",
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
          vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://samebase.com/oauth/convex");
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
            "https://samebase.com/oauth/cloudflare",
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
            "https://samebase.com/oauth/cloudflare-mcp",
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

      const returnUrl = await completeAsOwner(t, {
        provider: scenario.provider,
        path: scenario.path,
        state,
        userId,
      });

      expect(fetch).toHaveBeenCalledOnce();
      expect(returnUrl).toBe(
        buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: scenario.provider === "convex" ? "convex" : "cloudflare",
          code: "access-changed",
        }),
      );
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
          "https://samebase.com/oauth/cloudflare",
        );
      } else {
        await createCloudflareMcpCallbackState(t, {
          ...commonState,
          clientId: scenario.clientId,
          codeVerifier: scenario.codeVerifier,
        });
        vi.stubEnv(
          "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
          "https://samebase.com/oauth/cloudflare-mcp",
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

      const returnUrl = await completeAsOwner(t, {
        provider: scenario.provider,
        path: scenario.path,
        state,
        userId,
      });

      expect(returnUrl).toBe(
        buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: "cloudflare",
          code: "target-mismatch",
        }),
      );
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
          "https://samebase.com/oauth/cloudflare",
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
          "https://samebase.com/oauth/cloudflare-mcp",
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

      const returnUrl = await completeAsOwner(t, {
        provider: scenario.provider,
        path: scenario.path,
        state,
        userId,
      });

      expect(returnUrl).toBe(
        buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
          provider: "cloudflare",
          code: scenario.failure === "access_lost" ? "access-changed" : "configuration-changed",
        }),
      );
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

  it("keeps the configured Convex team and credential after a completion selects another team", async () => {
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
    vi.stubEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL", "https://samebase.com/oauth/convex");
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

    const returnUrl = await completeAsOwner(t, {
      provider: "convex",
      path: "/oauth/convex/callback",
      state,
      userId,
    });

    expect(returnUrl).toBe(
      buildAuthorizationErrorUrl(
        "https://samebase.com/org/oauth-owner/providers?prod-ui#connections",
        { provider: "convex", code: "target-mismatch" },
      ),
    );
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
    expect(returnUrl).not.toContain("provider-code");
    expect(returnUrl).not.toContain("new-convex-token");
  });

  it.each(reusedCloudflareGrantScenarios)(
    "keeps the configured Cloudflare account and credential after a $provider completion exposes another account too",
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
          "https://samebase.com/oauth/cloudflare",
        );
      } else {
        await createCloudflareMcpCallbackState(t, {
          ...commonState,
          clientId: scenario.clientId,
          codeVerifier: scenario.codeVerifier,
        });
        vi.stubEnv(
          "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
          "https://samebase.com/oauth/cloudflare-mcp",
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

      const returnUrl = await completeAsOwner(t, {
        provider: scenario.provider,
        path: scenario.path,
        state,
        userId,
      });

      expect(returnUrl).toBe(
        buildAuthorizationErrorUrl(
          "https://samebase.com/org/oauth-owner/providers?prod-ui#connections",
          { provider: "cloudflare", code: "target-mismatch" },
        ),
      );
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
      expect(returnUrl).not.toContain("provider-code");
      expect(returnUrl).not.toContain("exchanged-access-token");
    },
  );
});

describe("provider OAuth completion binding", () => {
  it.each(storageBoundaryScenarios)(
    "links nothing when another account receives the $provider authorization code",
    async (scenario) => {
      const t = makeConvexTest();
      const ownerId = await insertApprovedUser(t, `${scenario.provider}-owner@example.com`);
      const victimId = await insertApprovedUser(t, `${scenario.provider}-victim@example.com`);
      const { organizationId } = await t.mutation(
        internal.organizations.createOrReconnectVerifiedOrganization,
        {
          userId: ownerId,
          githubOwnerId: `${scenario.provider}-binding-owner`,
          githubOwnerType: "organization",
          githubOwnerLogin: "OAuth-Owner",
          githubInstallationId: `${scenario.provider}-binding-installation`,
        },
      );
      const state = `${scenario.provider}-binding-state`;
      await createCallbackState(t, { organizationId, scenario, state, userId: ownerId });
      stubProviderOAuthEnv(scenario.provider);
      const providerFetch = vi.fn(
        async () =>
          new Response(JSON.stringify(scenario.tokenResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      );
      vi.stubGlobal("fetch", providerFetch);

      // The provider sends the victim's browser to the callback with the victim's code.
      const callbackResponse = await t.fetch(`${scenario.path}?code=victim-code&state=${state}`);

      expect(callbackResponse.status).toBe(200);
      expect(providerFetch).not.toHaveBeenCalled();
      await expect(readProviderOAuthSnapshot(t, { organizationId, state })).resolves.toMatchObject({
        credentials: null,
      });

      const authorizationProvider = scenario.provider === "convex" ? "convex" : "cloudflare";
      await expect(
        signedInAs(t, victimId).action(api.providerOAuthCompletion.completeProviderOAuth, {
          provider: scenario.provider,
          state,
          code: "victim-code",
        }),
      ).resolves.toBe(
        buildAuthorizationErrorUrl("https://samebase.com/org", {
          provider: authorizationProvider,
          code: "started-by-another-account",
        }),
      );
      await expect(readProviderOAuthSnapshot(t, { organizationId, state })).resolves.toEqual({
        credentials: null,
        oauthState: null,
      });

      await expect(
        signedInAs(t, ownerId).action(api.providerOAuthCompletion.completeProviderOAuth, {
          provider: scenario.provider,
          state,
          code: "victim-code",
        }),
      ).resolves.toBe(
        buildAuthorizationErrorUrl("https://samebase.com/org", {
          provider: authorizationProvider,
          code: "expired",
        }),
      );
      await expect(readProviderOAuthSnapshot(t, { organizationId, state })).resolves.toEqual({
        credentials: null,
        oauthState: null,
      });
      expect(providerFetch).not.toHaveBeenCalled();
      expect(providerMocks.fetchConvexTeamTokenDetails).not.toHaveBeenCalled();
      expect(providerMocks.getCloudflareAccounts).not.toHaveBeenCalled();
    },
  );

  it("links nothing when the owner completes after the authorization expired", async () => {
    const t = makeConvexTest();
    const userId = await insertApprovedUser(t, "convex-expired-owner@example.com");
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "convex-expired-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "OAuth-Owner",
        githubInstallationId: "convex-expired-installation",
      },
    );
    const state = "convex-expired-state";
    await t.mutation(internal.oauthState.createOauthState, {
      provider: "convex",
      userId,
      organizationId,
      state,
      codeVerifier: "convex-code-verifier",
      createdAt: Date.now() - 120_000,
      expiresAt: Date.now() - 1,
    });
    stubProviderOAuthEnv("convex");
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);

    await expect(
      signedInAs(t, userId).action(api.providerOAuthCompletion.completeProviderOAuth, {
        provider: "convex",
        state,
        code: "provider-code",
      }),
    ).resolves.toBe(
      buildAuthorizationErrorUrl("https://samebase.com/org/oauth-owner/providers", {
        provider: "convex",
        code: "expired",
      }),
    );
    await expect(readProviderOAuthSnapshot(t, { organizationId, state })).resolves.toEqual({
      credentials: null,
      oauthState: null,
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
