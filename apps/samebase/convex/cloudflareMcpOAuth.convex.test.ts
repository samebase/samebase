import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { CLOUDFLARE_MCP_OAUTH_SETUP_OPERATION } from "./oauthState";
import { makeConvexTest } from "./test.setup";

async function seedOrganizationOwner() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email: "test@example.invalid",
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
  return { organizationId, t, userId };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getCloudflareMcpOAuthUrl", () => {
  it("registers the Cloudflare OAuth client with the Samebase display name", async () => {
    const { organizationId, t, userId } = await seedOrganizationOwner();
    vi.stubEnv(
      "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
      "https://samebase.test/api/auth/cloudflare/callback",
    );
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://mcp.cloudflare.com/register");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe(
        JSON.stringify({
          redirect_uris: ["https://samebase.test/api/auth/cloudflare/callback"],
          token_endpoint_auth_method: "none",
          response_types: ["code"],
          grant_types: ["authorization_code", "refresh_token"],
          client_name: "Samebase",
        }),
      );
      return new Response(JSON.stringify({ client_id: "registered-client" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const authorizeUrl = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .action(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl, { organizationId });

    expect(authorizeUrl).toContain("client_id=registered-client");
    expect(fetch).toHaveBeenCalledOnce();
    const oauthState = await t.run(async (ctx) => {
      return await ctx.db
        .query("providerOAuthCallbackStates")
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
        .unique();
    });
    expect(oauthState).toMatchObject({
      organizationId,
      provider: "cloudflare_mcp",
      userId,
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositoryOperationLeases").collect()),
    ).resolves.toEqual([]);
  });

  it("blocks setup before Cloudflare registration while draining", async () => {
    const { organizationId, t, userId } = await seedOrganizationOwner();
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    vi.stubEnv(
      "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
      "https://samebase.test/api/auth/cloudflare/callback",
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      t
        .withIdentity({
          subject: `${userId}|test-session`,
          tokenIdentifier: `test:${userId}`,
        })
        .action(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl, { organizationId }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires normal mode for ordinary OAuth state creation", async () => {
    const { organizationId, t, userId } = await seedOrganizationOwner();
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    const now = Date.now();

    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "convex",
        userId,
        organizationId,
        state: "convex-state",
        codeVerifier: "convex-verifier",
        createdAt: now,
        expiresAt: now + 60_000,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "cloudflare",
        userId,
        organizationId,
        state: "cloudflare-state",
        createdAt: now,
        expiresAt: now + 60_000,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
  });

  it("accepts only the exact setup lease for Cloudflare MCP OAuth state", async () => {
    const { organizationId, t, userId } = await seedOrganizationOwner();
    const state = "cloudflare-mcp-state";
    const correctLease = await t.mutation(
      internal.repositoryMigration.maintenance.claimOperationLease,
      {
        operationId: state,
        operationName: CLOUDFLARE_MCP_OAUTH_SETUP_OPERATION,
      },
    );
    const wrongLease = await t.mutation(
      internal.repositoryMigration.maintenance.claimOperationLease,
      {
        operationId: "another-cloudflare-mcp-state",
        operationName: CLOUDFLARE_MCP_OAUTH_SETUP_OPERATION,
      },
    );
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    const createdAt = Date.now();
    const expiresAt = createdAt + 60_000;

    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "cloudflare_mcp",
        userId,
        organizationId,
        state,
        clientId: "registered-client",
        codeVerifier: "cloudflare-verifier",
        leaseId: wrongLease.leaseId,
        createdAt,
        expiresAt,
      }),
    ).rejects.toThrow("Repository operation lease is not active.");
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "cloudflare_mcp",
        userId,
        organizationId,
        state,
        clientId: "registered-client",
        codeVerifier: "cloudflare-verifier",
        leaseId: correctLease.leaseId,
        createdAt,
        expiresAt,
      }),
    ).resolves.toBeDefined();
  });
});
