import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import {
  organizationProviderCredentialAad,
  type CloudflareProviderCredential,
} from "./organization/providerCredentialModel";
import { openSecret, type StoredSecret } from "./sealedSecret";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "./test.setup";

const actionId = "rotate-keys";
const now = 1_800_000_000_000;
const account = { accountId: "cloudflare-account", accountName: "Cloudflare account" };
const oauth = {
  method: "oauth",
  credential: testCredential("old-access"),
  refreshCredential: testCredential("old-refresh"),
  credentialExpiresAt: now - 1,
} as const;

async function seedManualWrite(auth: CloudflareProviderCredential["auth"]) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "owner@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "owner",
      githubOwnerType: "user",
      githubOwnerLogin: "owner",
      githubOwnerLoginNormalized: "owner",
      githubInstallationId: "installation",
      cloudflareAccount: account,
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const credentialId = await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      cloudflare: { auth, connectedByUserId: userId, updatedAt: now },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      cloudflareAccountId: account.accountId,
      deletion: { state: "not_deleting" },
      createdAt: now,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "owner/app",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      cloudflareAccountId: account.accountId,
      deletion: { state: "not_deleting" },
      createdAt: now,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "repository",
      githubRepositoryName: "app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: now,
    });
    return { userId, organizationId, repositoryId, credentialId };
  });
  await sealTestCredentials(t);
  await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
    repositoryId: ids.repositoryId,
    userId: ids.userId,
    actionId,
    action: "rotate_convex_deploy_keys_for_workers_builds",
  });
  const stored = await t.run(async (ctx) => await ctx.db.get(ids.credentialId));
  if (stored?.cloudflare === undefined) {
    throw new Error("Expected the Cloudflare credential.");
  }
  return { t, ...ids, sealedAuth: stored.cloudflare.auth };
}

function openCloudflareCredential(
  seed: Awaited<ReturnType<typeof seedManualWrite>>,
  sealed: StoredSecret,
  field: "cloudflare.auth.credential" | "cloudflare.auth.refreshCredential",
) {
  return openSecret({ sealed, aad: organizationProviderCredentialAad(seed.organizationId, field) });
}

function resolveManualWrite(seed: Awaited<ReturnType<typeof seedManualWrite>>) {
  return seed.t.action(internal.cloudflareOAuth.resolveConnectionForManualProviderWrite, {
    organizationId: seed.organizationId,
    repositoryId: seed.repositoryId,
    userId: seed.userId,
    actionId,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "client");
  vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "client-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloudflare connection for manual provider writes", () => {
  it.each([
    { name: "expired OAuth", auth: oauth, endpoint: "https://dash.cloudflare.com/oauth2/token" },
    {
      name: "expiring OAuth",
      auth: { ...oauth, credentialExpiresAt: now + 60_000 },
      endpoint: "https://dash.cloudflare.com/oauth2/token",
    },
    {
      name: "expired MCP OAuth",
      auth: { ...oauth, method: "mcp_oauth" as const, clientId: "mcp-client" },
      endpoint: "https://mcp.cloudflare.com/token",
    },
  ])("refreshes $name under the manual write and token leases", async ({ auth, endpoint }) => {
    const seed = await seedManualWrite(auth);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(endpoint);
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain("grant_type=refresh_token");
      expect(init?.body).toContain("refresh_token=old-refresh");
      const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
      expect(credentials?.cloudflare?.tokenRefreshLease).toMatchObject({ startedAt: now });
      return Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3_600,
      });
    });
    vi.stubGlobal("fetch", fetch);

    const connection = await resolveManualWrite(seed);

    expect(connection).toMatchObject({
      auth: { method: auth.method, credentialExpiresAt: now + 3_600_000 },
      account,
      tokenHealth: { status: "valid", source: "refresh_attempt" },
    });
    if (connection === null || connection.auth.method === "api_key") {
      throw new Error("Expected a refreshed OAuth connection.");
    }
    await expect(
      openCloudflareCredential(seed, connection.auth.credential, "cloudflare.auth.credential"),
    ).resolves.toBe("new-access");
    await expect(
      openCloudflareCredential(
        seed,
        connection.auth.refreshCredential,
        "cloudflare.auth.refreshCredential",
      ),
    ).resolves.toBe("new-refresh");
    const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
    expect(credentials?.cloudflare).toMatchObject({
      auth: connection.auth,
      tokenHealth: connection.tokenHealth,
      lastTokenRefreshAt: now,
    });
    expect(credentials?.cloudflare?.tokenRefreshLease).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "API key",
      auth: { method: "api_key" as const, credential: testCredential("api-key") },
    },
    { name: "valid OAuth", auth: { ...oauth, credentialExpiresAt: now + 3_600_000 } },
  ])("uses $name without a refresh", async ({ auth }) => {
    const seed = await seedManualWrite(auth);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(resolveManualWrite(seed)).resolves.toMatchObject({
      auth: seed.sealedAuth,
      account,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a different action even when the user owns the organization", async () => {
    const seed = await seedManualWrite(oauth);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      seed.t.action(internal.cloudflareOAuth.resolveConnectionForManualProviderWrite, {
        organizationId: seed.organizationId,
        repositoryId: seed.repositoryId,
        userId: seed.userId,
        actionId: "another-action",
      }),
    ).rejects.toThrow("Manual provider action no longer owns the repository write.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not use an expired token or release another caller's refresh lease", async () => {
    const seed = await seedManualWrite(oauth);
    const claim = await seed.t.mutation(
      internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
      {
        organizationId: seed.organizationId,
        userId: seed.userId,
        expectedAuth: seed.sealedAuth,
      },
    );
    if (!claim.claimed) throw new Error("Expected a refresh lease.");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(resolveManualWrite(seed)).rejects.toThrow(
      "Cloudflare token refresh is in progress.",
    );
    const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
    expect(credentials?.cloudflare?.tokenRefreshLease).toEqual(claim.tokenRefreshLease);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a refresh failure and releases its token lease", async () => {
    const seed = await seedManualWrite(oauth);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
    );

    await expect(resolveManualWrite(seed)).rejects.toThrow("invalid_grant");

    const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
    expect(credentials?.cloudflare).toMatchObject({
      auth: seed.sealedAuth,
      tokenHealth: { status: "invalid", source: "refresh_attempt" },
    });
    expect(credentials?.cloudflare?.tokenRefreshLease).toBeUndefined();
    expect(credentials?.cloudflare?.lastTokenRefreshAt).toBeUndefined();
  });
});
