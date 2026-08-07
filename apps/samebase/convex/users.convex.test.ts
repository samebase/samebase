import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

const primaryCloudflareAccountId = "a".repeat(32);
const secondaryCloudflareAccountId = "b".repeat(32);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function cloudflareAccountsResponse(
  accounts: Array<{ id: string; name: string; type: "standard" }>,
): Response {
  return new Response(
    JSON.stringify({ success: true, errors: [], messages: [], result: accounts }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function cloudflareFailureResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  cloudflareTarget?: "configured" | "pending";
}) {
  const t = makeConvexTest();
  const { memberId, organizationId, outsiderId, providerCredentialsId, userId } = await t.run(
    async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "owner@example.com",
        isApproved: true,
      });
      const memberId = await ctx.db.insert("users", {
        email: "member@example.com",
        isApproved: true,
      });
      const outsiderId = await ctx.db.insert("users", {
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
        ...(options?.cloudflareTarget === "pending"
          ? {}
          : {
              cloudflareAccount: {
                accountId: primaryCloudflareAccountId,
                accountName: "Primary account",
              },
            }),
      });
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
        convex: {
          auth: { method: "api_key", credential: "convex-credential" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
        cloudflare: {
          auth:
            options?.cloudflareAuthMethod === "oauth"
              ? {
                  method: "oauth",
                  credential: "expired-access-token",
                  refreshCredential: "refresh-token",
                  credentialExpiresAt: 0,
                }
              : options?.cloudflareAuthMethod === "mcp_oauth"
                ? {
                    method: "mcp_oauth",
                    credential: "expired-access-token",
                    refreshCredential: "refresh-token",
                    credentialExpiresAt: 0,
                    clientId: "dynamic-client-id",
                  }
                : { method: "api_key", credential: "cloudflare-credential" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
      await ctx.db.patch(organizationId, { providerCredentialsId });
      return { memberId, organizationId, outsiderId, providerCredentialsId, userId };
    },
  );
  return { memberId, organizationId, outsiderId, providerCredentialsId, t, userId };
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

  it("disconnects credentials but preserves both destinations", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization();
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asOwner.action(api.users.disconnectConvex, { organizationId })).resolves.toEqual({
      upstreamRevocation: "not_supported",
    });
    await expect(asOwner.action(api.users.disconnectConvex, { organizationId })).resolves.toEqual({
      upstreamRevocation: "confirmed",
    });
    await expect(
      asOwner.action(api.users.disconnectCloudflare, { organizationId }),
    ).resolves.toEqual({ upstreamRevocation: "not_supported" });

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

  it("lets an owner list visible accounts and select the stable target", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = vi.fn(async () =>
      cloudflareAccountsResponse([
        { id: secondaryCloudflareAccountId, name: "Secondary account", type: "standard" },
        { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" },
      ]),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      asOwner.action(api.users.listCloudflareAccounts, { organizationId }),
    ).resolves.toEqual([
      { accountId: primaryCloudflareAccountId, accountName: "Primary account" },
      { accountId: secondaryCloudflareAccountId, accountName: "Secondary account" },
    ]);
    await expect(
      asOwner.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: secondaryCloudflareAccountId,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(organizationId))).resolves.toMatchObject({
      cloudflareAccount: {
        accountId: secondaryCloudflareAccountId,
        accountName: "Secondary account",
      },
    });
  });

  it("does not expose pending account choices or selection to a member", async () => {
    const { memberId, organizationId, t } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });

    await expect(
      asMember.action(api.users.listCloudflareAccounts, { organizationId }),
    ).resolves.toEqual([]);
    await expect(
      asMember.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: primaryCloudflareAccountId,
      }),
    ).rejects.toThrow("Organization owner access is required.");
  });

  it("does not expose Cloudflare account discovery errors", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        cloudflareFailureResponse(
          {
            success: false,
            errors: [{ code: 9109, message: "private provider detail" }],
            messages: [],
            result: null,
          },
          403,
        ),
      ),
    );

    const error = await readActionError(
      asOwner.action(api.users.listCloudflareAccounts, { organizationId }),
    );
    expect(error.message).toContain(
      "Cloudflare account discovery failed. Reconnect Cloudflare, then retry.",
    );
    expect(error.message).not.toContain("private provider detail");
  });

  it("does not expose Cloudflare refresh errors through public provider actions", async () => {
    const { organizationId, t, userId } = await seedProviderOrganization({
      cloudflareAuthMethod: "oauth",
      cloudflareTarget: "pending",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    stubCloudflareRefreshFailure("private refresh detail");

    const error = await readActionError(
      asOwner.action(api.users.listCloudflareAccounts, { organizationId }),
    );
    expect(error.message).toContain(
      "Cloudflare account discovery failed. Reconnect Cloudflare, then retry.",
    );
    expect(error.message).not.toContain("private refresh detail");

    const accessError = await readActionError(
      asOwner.action(api.cloudflareProviderAccess.checkCloudflareConnectionAccess, {
        organizationId,
      }),
    );
    expect(accessError.message).toContain("Cloudflare access check failed.");
    expect(accessError.message).not.toContain("private refresh detail");
  });

  it("replaces direct and MCP refresh errors at the shared resolver boundary", async () => {
    for (const method of ["oauth", "mcp_oauth"] as const) {
      const { organizationId, t, userId } = await seedProviderOrganization({
        cloudflareAuthMethod: method,
        cloudflareTarget: "pending",
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

  it("rejects account selection when the credential changes during discovery", async () => {
    const { organizationId, providerCredentialsId, t, userId } = await seedProviderOrganization({
      cloudflareTarget: "pending",
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await t.run(async (ctx) => {
          const credentials = await ctx.db.get(providerCredentialsId);
          if (credentials?.cloudflare === undefined) {
            throw new Error("Expected a Cloudflare credential.");
          }
          await ctx.db.patch(providerCredentialsId, {
            cloudflare: {
              ...credentials.cloudflare,
              auth: { method: "api_key", credential: "replacement-credential" },
              updatedAt: 2,
            },
          });
        });
        return cloudflareAccountsResponse([
          { id: primaryCloudflareAccountId, name: "Primary account", type: "standard" },
        ]);
      }),
    );

    await expect(
      asOwner.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: primaryCloudflareAccountId,
      }),
    ).rejects.toThrow("Cloudflare credential changed before account selection completed.");
    await expect(
      t.run(async (ctx) => await ctx.db.get(organizationId)),
    ).resolves.not.toHaveProperty("cloudflareAccount");
  });

  it("returns only the stable target and rejects a second target selection", async () => {
    const { memberId, organizationId, t, userId } = await seedProviderOrganization();
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|session`,
      tokenIdentifier: `test:${userId}`,
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      asMember.action(api.users.listCloudflareAccounts, { organizationId }),
    ).resolves.toEqual([{ accountId: primaryCloudflareAccountId, accountName: "Primary account" }]);
    await expect(
      asOwner.action(api.users.selectCloudflareAccount, {
        organizationId,
        accountId: secondaryCloudflareAccountId,
      }),
    ).rejects.toThrow("Cloudflare account is already configured.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
