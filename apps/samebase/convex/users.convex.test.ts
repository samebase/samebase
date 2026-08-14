import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ConvexError } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

const primaryCloudflareAccountId = "a".repeat(32);
const secondaryCloudflareAccountId = "b".repeat(32);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function cloudflareAccountsResponse(
  accounts: Array<{ id: string; name: string; type: "standard" }>,
): Response {
  return cloudflareSuccessResponse(accounts);
}

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function cloudflareFailureResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubCloudflareApiTokenAccounts(
  token: string,
  accounts: Array<{ id: string; name: string; type: "standard" }>,
) {
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
      switch (url.pathname) {
        case "/client/v4/user/tokens/verify":
          return cloudflareSuccessResponse({ id: "c".repeat(32), status: "active" });
        case "/client/v4/accounts": {
          expect(url.searchParams.get("per_page")).toBe("5");
          return cloudflareAccountsResponse(accounts);
        }
        default:
          throw new Error(`Unexpected Cloudflare API token probe ${url.pathname}.`);
      }
    },
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function stubCloudflareRefreshFailure(detail: string): void {
  vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "client-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      cloudflareFailureResponse({ error: "invalid_grant", error_description: detail }, 400),
    ),
  );
}

function convexProjectResponse() {
  return {
    createTime: 1_710_000_000_000,
    id: 1,
    name: "Samebase",
    slug: "samebase",
    teamId: 38_516,
    teamSlug: "nicu",
  };
}

function stubConvexProviderAccess(projects: ReturnType<typeof convexProjectResponse>[]) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    switch (url.pathname) {
      case "/v1/token_details":
        return Response.json({
          createTime: 1_710_000_000_000,
          id: 2,
          name: "Samebase OAuth",
          teamId: 38_516,
          type: "teamToken",
        });
      case "/v1/teams/38516/projects":
        return Response.json({
          items: projects,
          pagination: { hasMore: false },
        });
      case "/v1/teams/38516/list_deployments":
        return Response.json({
          items: [],
          pagination: { hasMore: false },
        });
      default:
        throw new Error(`Unexpected Convex probe ${url.pathname}.`);
    }
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function readActionError(operation: Promise<unknown>): Promise<Error> {
  const result = await operation.then(
    () => ({ state: "resolved" as const }),
    (error: unknown) => ({ state: "rejected" as const, error }),
  );
  if (result.state === "resolved") {
    throw new Error("Expected the action to fail.");
  }
  if (!(result.error instanceof Error)) {
    throw new Error("Expected an Error result.");
  }
  return result.error;
}

async function seedProviderOrganization(options?: {
  cloudflareAuthMethod?: "api_key" | "oauth" | "mcp_oauth";
  cloudflareState?: "connected" | "not_configured";
  convexAuthMethod?: "api_key" | "oauth";
}) {
  const t = makeConvexTest();
  const { memberId, organizationId, outsiderId, providerCredentialsId, userId } = await t.run(
    async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "owner@example.com",
        isApproved: true,
      });
      const memberId = await ctx.db.insert("users", {
        state: "active",
        email: "member@example.com",
        isApproved: true,
      });
      const outsiderId = await ctx.db.insert("users", {
        state: "active",
        email: "outsider@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "owner-1",
        githubOwnerType: "organization",
        githubOwnerLogin: "Primary",
        githubOwnerLoginNormalized: "primary",
        githubInstallationId: "installation-1",
        convexTeam: { teamId: "team-1", teamSlug: "team-one" },
        ...(options?.cloudflareState === "not_configured"
          ? {}
          : {
              cloudflareAccount: {
                accountId: primaryCloudflareAccountId,
                accountName: "Primary account",
              },
            }),
      });
      await insertTestOrganizationBillingAccount(ctx.db, organizationId);
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: memberId,
        role: "member",
      });
      const providerCredentialsId = await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          auth:
            options?.convexAuthMethod === "oauth"
              ? { method: "oauth", credential: "convex-credential" }
              : { method: "api_key", credential: "convex-credential" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
        ...(options?.cloudflareState === "not_configured"
          ? {}
          : {
              cloudflare: {
                auth:
                  options?.cloudflareAuthMethod === "oauth"
                    ? {
                        method: "oauth" as const,
                        credential: "expired-access-token",
                        refreshCredential: "refresh-token",
                        credentialExpiresAt: 0,
                      }
                    : options?.cloudflareAuthMethod === "mcp_oauth"
                      ? {
                          method: "mcp_oauth" as const,
                          credential: "expired-access-token",
                          refreshCredential: "refresh-token",
                          credentialExpiresAt: 0,
                          clientId: "dynamic-client-id",
                        }
                      : { method: "api_key" as const, credential: "cloudflare-credential" },
                connectedByUserId: userId,
                updatedAt: 1,
              },
            }),
      });
      return { memberId, organizationId, outsiderId, providerCredentialsId, userId };
    },
  );
  return { memberId, organizationId, outsiderId, providerCredentialsId, t, userId };
}

async function makeSeedProviderOrganizationBillingLimited(
  t: ReturnType<typeof makeConvexTest>,
  organizationId: Id<"organizations">,
): Promise<void> {
  await t.run(async (ctx) => {
    const extraMemberId = await ctx.db.insert("users", {
      state: "active",
      email: "billing-limited-provider-member@example.com",
      isApproved: true,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: extraMemberId,
      role: "member",
    });
  });
}

describe("organization provider status", () => {
  it("shows the configured destinations and hides credentials", async () => {
    const { organizationId, outsiderId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const asOutsider = t.withIdentity({
      subject: `${outsiderId}|session`,
      tokenIdentifier: `test:${outsiderId}`,
    });

    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "connected",
      teamId: "team-1",
      teamSlug: "team-one",
      authMethod: "api_key",
    });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "connected",
      accountId: primaryCloudflareAccountId,
      accountName: "Primary account",
      authMethod: "api_key",
    });
    await expect(
      asOutsider.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).rejects.toThrow("Organization membership is required.");
  });

  it("keeps provider status and health visible while organization work is billing-limited", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization();
    await makeSeedProviderOrganizationBillingLimited(t, organizationId);
    const asOwner = t.withIdentity({
      subject: `${userId}|billing-limited-provider-status`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({ state: "connected", teamId: "team-1" });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({
      state: "connected",
      accountId: primaryCloudflareAccountId,
    });

    stubConvexProviderAccess([convexProjectResponse()]);
    await expect(
      asOwner.action(api.convexProviderAccess.checkConvexConnectionAccess, { organizationId }),
    ).resolves.toMatchObject({ connected: true });
  });

  it("shows the OAuth connector to organization owners", async () => {
    const { memberId, organizationId, t, userId } = await seedProviderOrganization({
      cloudflareAuthMethod: "mcp_oauth",
      convexAuthMethod: "oauth",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { displayName: "Provider Owner" });
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });

    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({
      authMethod: "oauth",
      connectedBy: { kind: "displayName", label: "Provider Owner" },
      state: "connected",
    });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({
      authMethod: "mcp_oauth",
      connectedBy: { kind: "displayName", label: "Provider Owner" },
      state: "connected",
    });
    await expect(
      asMember.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.not.toHaveProperty("connectedBy");
    await expect(
      asMember.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.not.toHaveProperty("connectedBy");

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", memberId),
        )
        .unique();
      if (membership === null) {
        throw new Error("Organization membership is required.");
      }
      await ctx.db.patch(membership._id, { role: "owner" });
    });
    await expect(
      asMember.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({
      connectedBy: { kind: "displayName", label: "Provider Owner" },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { displayName: undefined });
    });
    await expect(
      asMember.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.not.toHaveProperty("connectedBy");
    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toMatchObject({
      connectedBy: { kind: "email", label: "owner@example.com" },
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: { state: "active", userId, email: "owner@example.com" },
        completionCapability: "c".repeat(64),
        currentStep: "revoke_access",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "in_progress", convexManualRevocationRequired: false },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "provider-status-test", attempt: 1 },
      });
      await ctx.db.patch(userId, {
        state: "deleting",
        runId,
        requestedAt: now,
        displayName: "Provider Owner",
      });
    });
    const deletingConnectorStatuses = await Promise.all([
      asMember.query(api.users.getConvexConnectionStatus, { organizationId }),
      asMember.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ]);
    expect(deletingConnectorStatuses.every((status) => !("connectedBy" in status))).toBe(true);

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (membership === null) {
        throw new Error("Organization membership is required.");
      }
      await ctx.db.delete(membership._id);
      await ctx.db.delete(userId);
    });
    await expect(
      asMember.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).rejects.toThrow("Provider connector user reference is invalid.");
    await expect(
      asMember.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).rejects.toThrow("Provider connector user reference is invalid.");
  });

  it("disconnects credentials but preserves both destinations", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asOwner.action(api.users.disconnectConvex, { organizationId }),
    ).resolves.toBeNull();
    await expect(
      asOwner.action(api.users.disconnectConvex, { organizationId }),
    ).resolves.toBeNull();
    await expect(
      asOwner.action(api.users.disconnectCloudflare, { organizationId }),
    ).resolves.toBeNull();

    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toEqual({ state: "disconnected", teamId: "team-1", teamSlug: "team-one" });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "disconnected",
      accountId: primaryCloudflareAccountId,
      accountName: "Primary account",
    });
  });

  it("returns a public error for an invalid Convex team token", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const credentialBefore = await t.run(
      async (ctx) => (await ctx.db.get(providerCredentialsId))?.convex,
    );
    const fetch = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);

    const error = await readActionError(
      asOwner.action(api.users.connectConvexWithApiKey, {
        organizationId,
        token: "invalid-team-token",
      }),
    );

    expect(error).toBeInstanceOf(ConvexError);
    expect(error).toMatchObject({ data: "Invalid Convex API key" });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.convex),
    ).resolves.toEqual(credentialBefore);
  });

  it("keeps the configured Convex team when a token belongs to another team", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const credentialBefore = await t.run(
      async (ctx) => (await ctx.db.get(providerCredentialsId))?.convex,
    );
    const teamBefore = await t.run(async (ctx) => (await ctx.db.get(organizationId))?.convexTeam);
    const fetch = stubConvexProviderAccess([]);

    const error = await readActionError(
      asOwner.action(api.users.connectConvexWithApiKey, {
        organizationId,
        token: "another-team-token",
      }),
    );

    expect(error).toBeInstanceOf(ConvexError);
    expect(error).toMatchObject({
      data: "Convex API key cannot access the configured Convex team.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.convex),
    ).resolves.toEqual(credentialBefore);
    await expect(
      t.run(async (ctx) => (await ctx.db.get(organizationId))?.convexTeam),
    ).resolves.toEqual(teamBefore);
  });

  it.each(["oauth", "mcp_oauth"] as const)(
    "disconnects Cloudflare $method locally without an upstream request",
    async (cloudflareAuthMethod) => {
      const { organizationId, t, userId } = await seedProviderOrganization({
        cloudflareAuthMethod,
      });
      const asOwner = t.withIdentity({
        subject: `${userId}|session`,
        tokenIdentifier: `test:${userId}`,
      });
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);

      await expect(
        asOwner.action(api.users.disconnectCloudflare, { organizationId }),
      ).resolves.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      await expect(
        asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
      ).resolves.toEqual({
        state: "disconnected",
        accountId: primaryCloudflareAccountId,
        accountName: "Primary account",
      });
    },
  );

  it("connects a Cloudflare API token to its only accessible account", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization({
      cloudflareState: "not_configured",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = stubCloudflareApiTokenAccounts("direct-token", [
      { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" },
    ]);

    await expect(
      asOwner.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "  direct-token  ",
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(organizationId))).resolves.toMatchObject({
      cloudflareAccount: {
        accountId: primaryCloudflareAccountId,
        accountName: "Primary account",
      },
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare),
    ).resolves.toMatchObject({
      auth: { method: "api_key", credential: "direct-token" },
      connectedByUserId: userId,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.map(
        ([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname,
      ),
    ).toEqual(["/client/v4/user/tokens/verify", "/client/v4/accounts"]);
  });

  it.each([
    {
      accounts: [],
      error: "Cloudflare API token cannot access an account.",
      label: "no account",
    },
    {
      accounts: [
        { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" as const },
        { id: secondaryCloudflareAccountId, name: "Secondary account", type: "standard" as const },
      ],
      error: "Use a Cloudflare API token that can access ONLY ONE account.",
      label: "several accounts",
    },
  ])("rejects a Cloudflare API token with $label before storage", async (testCase) => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization({
      cloudflareState: "not_configured",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    stubCloudflareApiTokenAccounts("direct-token", testCase.accounts);

    const error = await readActionError(
      asOwner.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "direct-token",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(error).toMatchObject({ data: testCase.error });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({ state: "not_configured" });
    await expect(
      t.run(async (ctx) => {
        const credentials = await ctx.db.get(providerCredentialsId);
        return credentials !== null && credentials.cloudflare === undefined;
      }),
    ).resolves.toBe(true);
  });

  it("keeps account A disconnected until a replacement token proves account A", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization({
      cloudflareAuthMethod: "oauth",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asOwner.action(api.users.disconnectCloudflare, { organizationId }),
    ).resolves.toBeNull();
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "disconnected",
      accountId: primaryCloudflareAccountId,
      accountName: "Primary account",
    });

    stubCloudflareApiTokenAccounts("account-b-token", [
      { id: secondaryCloudflareAccountId, name: "Secondary account", type: "standard" },
    ]);
    const replacementError = await readActionError(
      asOwner.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "account-b-token",
      }),
    );
    expect(replacementError).toBeInstanceOf(ConvexError);
    expect(replacementError).toMatchObject({
      data: "Use a Cloudflare API token that can access ONLY Primary account.",
    });
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "disconnected",
      accountId: primaryCloudflareAccountId,
      accountName: "Primary account",
    });
    await expect(
      t.run(async (ctx) => {
        const credentials = await ctx.db.get(providerCredentialsId);
        return credentials !== null && credentials.cloudflare === undefined;
      }),
    ).resolves.toBe(true);

    stubCloudflareApiTokenAccounts("account-a-token", [
      { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" },
    ]);
    await expect(
      asOwner.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "account-a-token",
      }),
    ).resolves.toBeNull();
    await expect(
      asOwner.query(api.users.getCloudflareConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "connected",
      accountId: primaryCloudflareAccountId,
      accountName: "Primary account",
      authMethod: "api_key",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare?.auth),
    ).resolves.toEqual({ method: "api_key", credential: "account-a-token" });
  });

  it("rejects a token that Cloudflare does not verify as a user API token", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const credentialBefore = await t.run(
      async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare,
    );
    const fetch = vi.fn(async () =>
      cloudflareFailureResponse(
        {
          success: false,
          errors: [{ code: 1000, message: "private provider detail" }],
          messages: [],
          result: null,
        },
        403,
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const error = await readActionError(
      asOwner.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "unsupported-token",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(error).toMatchObject({ data: "Cloudflare API token check failed." });
    expect(error.message).not.toContain("private provider detail");
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare),
    ).resolves.toEqual(credentialBefore);
  });

  it("rejects an inactive Cloudflare user API token before account discovery", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const credentialBefore = await t.run(
      async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare,
    );
    const fetch = vi.fn(async () =>
      cloudflareSuccessResponse({ id: "c".repeat(32), status: "disabled" }),
    );
    vi.stubGlobal("fetch", fetch);

    const error = await readActionError(
      asOwner.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "disabled-token",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(error).toMatchObject({ data: "Cloudflare API token check failed." });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare),
    ).resolves.toEqual(credentialBefore);
  });

  it("requires an organization owner before checking a Cloudflare API token", async () => {
    const { memberId, organizationId, providerCredentialsId, t } = await seedProviderOrganization();
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });
    const credentialBefore = await t.run(
      async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare,
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      asMember.action(api.users.connectCloudflareWithApiToken, {
        organizationId,
        token: "member-token",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare),
    ).resolves.toEqual(credentialBefore);
  });

  it.each([
    { initialTeamSlug: undefined, label: "missing" },
    { initialTeamSlug: "old-team-name", label: "stale" },
  ])("uses a verified Convex team slug without changing a $label stored slug", async (testCase) => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization();
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, {
        convexTeam: {
          teamId: "38516",
          ...(testCase.initialTeamSlug ? { teamSlug: testCase.initialTeamSlug } : {}),
        },
      });
    });
    const credentialBefore = await t.run(
      async (ctx) => (await ctx.db.get(providerCredentialsId))?.convex,
    );
    const fetch = stubConvexProviderAccess([convexProjectResponse()]);
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });

    const access = await asOwner.action(api.convexProviderAccess.checkConvexConnectionAccess, {
      organizationId,
    });

    expect(access).toEqual({
      connected: true,
      team: { teamSlug: "nicu" },
      checks: [
        { key: "token", status: "ok" },
        { key: "projects", status: "ok" },
        { key: "deployments", status: "ok" },
      ],
    });
    await expect(
      asOwner.query(api.users.getConvexConnectionStatus, { organizationId }),
    ).resolves.toEqual({
      state: "connected",
      teamId: "38516",
      ...(testCase.initialTeamSlug ? { teamSlug: testCase.initialTeamSlug } : {}),
      authMethod: "api_key",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.convex),
    ).resolves.toEqual(credentialBefore);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("reports an inaccessible Cloudflare account while provider status is billing-limited", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization();
    await makeSeedProviderOrganizationBillingLimited(t, organizationId);
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      switch (url.pathname) {
        case "/client/v4/user/tokens/verify":
          return cloudflareSuccessResponse({
            id: "c".repeat(32),
            status: "active",
          });
        case "/client/v4/accounts":
          return cloudflareAccountsResponse([
            { id: secondaryCloudflareAccountId, name: "Secondary account", type: "standard" },
          ]);
        default:
          throw new Error(`Unexpected Cloudflare probe ${url.pathname}.`);
      }
    });
    vi.stubGlobal("fetch", fetch);

    const access = await asOwner.action(
      api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
      { organizationId },
    );

    expect(access).toEqual({
      connected: true,
      requestedScopes: [],
      checks: [
        { key: "token", status: "ok" },
        { key: "accounts", status: "error" },
        { key: "workers", status: "not_run" },
        { key: "workers_builds", status: "not_run" },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not refresh OAuth credentials while checking an inaccessible configured account", async () => {
    for (const cloudflareAuthMethod of ["oauth", "mcp_oauth"] as const) {
      const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization({
        cloudflareAuthMethod,
      });
      const asOwner = t.withIdentity({
        subject: `${userId}|session`,
        tokenIdentifier: `test:${userId}`,
      });
      const credentialBefore = await t.run(
        async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare,
      );
      const targetBefore = await t.run(
        async (ctx) => (await ctx.db.get(organizationId))?.cloudflareAccount,
      );
      const fetch = vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname !== "/client/v4/accounts") {
          throw new Error(`Unexpected Cloudflare probe ${url.pathname}.`);
        }
        return cloudflareAccountsResponse([
          { id: secondaryCloudflareAccountId, name: "Secondary account", type: "standard" },
        ]);
      });
      vi.stubGlobal("fetch", fetch);

      const access = await asOwner.action(
        api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
        { organizationId },
      );

      expect(access.checks).toEqual([
        { key: "token", status: "error" },
        { key: "accounts", status: "error" },
        { key: "workers", status: "not_run" },
        { key: "workers_builds", status: "not_run" },
      ]);
      expect(fetch).toHaveBeenCalledTimes(1);
      await expect(
        t.run(async (ctx) => (await ctx.db.get(providerCredentialsId))?.cloudflare),
      ).resolves.toEqual(credentialBefore);
      await expect(
        t.run(async (ctx) => (await ctx.db.get(organizationId))?.cloudflareAccount),
      ).resolves.toEqual(targetBefore);
    }
  });

  it("clears a shared MCP refresh lease when account deletion wins the return race", async () => {
    const { memberId, organizationId, providerCredentialsId, t, userId } =
      await seedProviderOrganization({ cloudflareAuthMethod: "mcp_oauth" });
    await t.run(async (ctx) => {
      const credentials = await ctx.db.get(providerCredentialsId);
      if (credentials?.cloudflare === undefined) {
        throw new Error("Expected a Cloudflare credential.");
      }
      await ctx.db.patch(credentials._id, {
        cloudflare: { ...credentials.cloudflare, connectedByUserId: memberId },
      });
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      expect(url).toBe("https://mcp.cloudflare.com/token");
      await t.run(async (ctx) => {
        await ctx.db.replace(userId, { state: "deleted", deletedAt: Date.now() });
      });
      return Response.json({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3_600,
      });
    });
    vi.stubGlobal("fetch", fetch);

    await expect(
      asOwner.action(api.users.refreshCloudflareMcpTokenIfNeeded, {
        organizationId,
        force: true,
      }),
    ).rejects.toThrow("Provider credentials are unavailable during account deletion.");

    const credentials = await t.run(async (ctx) => await ctx.db.get(providerCredentialsId));
    expect(credentials).toMatchObject({
      cloudflare: {
        connectedByUserId: memberId,
        auth: {
          method: "mcp_oauth",
          credential: "new-access-token",
          refreshCredential: "new-refresh-token",
        },
      },
    });
    expect(credentials?.cloudflare?.tokenRefreshLease).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("replaces direct and MCP refresh errors at the shared resolver boundary", async () => {
    for (const method of ["oauth", "mcp_oauth"] as const) {
      const { organizationId, t, userId } = await seedProviderOrganization({
        cloudflareAuthMethod: method,
      });
      stubCloudflareRefreshFailure(`private ${method} refresh detail`);

      const error = await readActionError(
        method === "oauth"
          ? t.action(internal.cloudflareOAuth.resolveConnectionForOrganization, {
              organizationId,
              userId,
            })
          : t.action(internal.cloudflareMcpOAuth.resolveConnectionForOrganization, {
              organizationId,
              userId,
            }),
      );
      expect(error.message).toContain("Cloudflare token refresh failed.");
      expect(error.message).not.toContain(`private ${method} refresh detail`);
    }
  });
});
