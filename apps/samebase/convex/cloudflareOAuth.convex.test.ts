import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import {
  organizationProviderCredentialAad,
  type CloudflareProviderCredential,
} from "./organization/providerCredentialModel";
import { openSecret, type SealedSecret } from "./sealedSecret";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "./test.setup";

const now = 1_800_000_000_000;
const account = { accountId: "cloudflare-account", accountName: "Cloudflare account" };
const oauth = {
  method: "oauth",
  credential: testCredential("old-access"),
  refreshCredential: testCredential("old-refresh"),
  credentialExpiresAt: now - 1,
} as const;
async function seedConnection(auth: CloudflareProviderCredential["auth"]) {
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
    return { userId, organizationId, credentialId };
  });
  await sealTestCredentials(t);
  const stored = await t.run(async (ctx) => await ctx.db.get(ids.credentialId));
  if (stored?.cloudflare === undefined) {
    throw new Error("Expected the Cloudflare credential.");
  }
  return { t, ...ids, sealedAuth: stored.cloudflare.auth };
}

function openCloudflareCredential(
  seed: Awaited<ReturnType<typeof seedConnection>>,
  sealed: SealedSecret,
  field: "cloudflare.auth.credential" | "cloudflare.auth.refreshCredential",
) {
  return openSecret({ sealed, aad: organizationProviderCredentialAad(seed.organizationId, field) });
}

function resolveConnection(seed: Awaited<ReturnType<typeof seedConnection>>) {
  return seed.t.action(internal.cloudflareOAuth.resolveConnectionForOrganization, {
    organizationId: seed.organizationId,
    userId: seed.userId,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("IDENTITY_HUB_ISSUER", "https://hub.example.test");
  vi.stubEnv("IDENTITY_HUB_CLIENT_ID", "resource-client");
  vi.stubEnv("IDENTITY_HUB_CLIENT_SECRET", "resource-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloudflare connection refresh", () => {
  it.each([
    { name: "expired OAuth", auth: oauth, endpoint: "https://hub.example.test/token" },
    {
      name: "expiring OAuth",
      auth: { ...oauth, credentialExpiresAt: now + 60_000 },
      endpoint: "https://hub.example.test/token",
    },
    {
      name: "expired MCP OAuth",
      auth: { ...oauth, method: "mcp_oauth" as const, clientId: "mcp-client" },
      endpoint: "https://mcp.cloudflare.com/token",
    },
  ])("refreshes $name under the token lease", async ({ auth, endpoint }) => {
    const seed = await seedConnection(auth);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe(endpoint);
      expect(init?.method).toBe("POST");
      const body = await request.formData();
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("old-refresh");
      if (auth.method === "oauth") {
        expect(body.get("client_id")).toBe("resource-client");
        expect(body.get("client_secret")).toBe("resource-secret");
        expect(body.get("resource")).toBe("https://api.cloudflare.com/client/v4/");
      }
      const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
      expect(credentials?.cloudflare?.tokenRefreshLease).toMatchObject({ startedAt: now });
      return Response.json({
        access_token: "new-access",
        token_type: "bearer",
        refresh_token: "new-refresh",
        expires_in: 3_600,
      });
    });
    vi.stubGlobal("fetch", fetch);

    const connection = await resolveConnection(seed);

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
    const seed = await seedConnection(auth);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(resolveConnection(seed)).resolves.toMatchObject({
      auth: seed.sealedAuth,
      account,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not use an expired token or release another caller's refresh lease", async () => {
    const seed = await seedConnection(oauth);
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

    await expect(resolveConnection(seed)).rejects.toThrow(
      "Cloudflare token refresh is in progress.",
    );
    const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
    expect(credentials?.cloudflare?.tokenRefreshLease).toEqual(claim.tokenRefreshLease);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a hub invalid grant and releases its token lease", async () => {
    const seed = await seedConnection(oauth);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
    );

    await expect(resolveConnection(seed)).rejects.toThrow();

    const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
    expect(credentials?.cloudflare).toMatchObject({
      auth: seed.sealedAuth,
      tokenHealth: { status: "invalid", source: "refresh_attempt" },
    });
    expect(credentials?.cloudflare?.tokenRefreshLease).toBeUndefined();
    expect(credentials?.cloudflare?.lastTokenRefreshAt).toBeUndefined();
  });

  it.each([
    {
      name: "is unavailable",
      response: () => Response.json({ error: "temporarily_unavailable" }, { status: 503 }),
    },
    {
      name: "rejects the client",
      response: () =>
        Response.json(
          { error: "invalid_client" },
          { status: 401, headers: { "WWW-Authenticate": 'Basic realm="token"' } },
        ),
    },
  ])("keeps the connection when the hub $name", async ({ response }) => {
    const seed = await seedConnection(oauth);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );

    await expect(resolveConnection(seed)).rejects.toThrow();

    const credentials = await seed.t.run(async (ctx) => await ctx.db.get(seed.credentialId));
    expect(credentials?.cloudflare).toMatchObject({
      auth: seed.sealedAuth,
      tokenHealth: { status: "expired", source: "runtime_error" },
    });
  });
});
