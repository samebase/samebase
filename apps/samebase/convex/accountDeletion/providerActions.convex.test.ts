import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("../cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;
const workflowId = "account-deletion-workflow-1";

afterEach(() => {
  callCloudflareMcpToolMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedUser(
  t: ConvexTest,
): Promise<{ userId: Id<"users">; runId: Id<"accountDeletionRuns"> }> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "test@example.invalid",
      isApproved: true,
    });
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: 2_000_000_000_000,
    });
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: { state: "active", userId, email: "test@example.invalid" },
      completionCapability: "provider-actions-test",
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "request_accepted",
      requestedAt: 1,
      updatedAt: 1,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });
    return { runId, userId };
  });
}

function readRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

async function seedRetainedProviderResources(t: ConvexTest, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const workerAppId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "apps/web",
      createdAt: 1,
    });
    const convexAppId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "packages/backend",
      createdAt: 1,
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      userId,
      appId: workerAppId,
      accountId: "cloudflare-account",
      workerName: "retained-worker",
      workerTag: "retained-worker-tag",
      origin: "selected_existing",
      builds: {
        state: "connected",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["apps/web/*"],
        pathExcludes: [],
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "recorded-build-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "recorded-build-token",
        },
      },
      connectedAt: 1,
      lastObservedAt: 1,
    });
    const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
      vaultId,
      userId,
      appId: convexAppId,
      projectId: "convex-project",
      teamSlug: "test-team",
      projectSlug: "backend",
      deploymentName: "backend-production",
      deploymentType: "prod",
      cloudUrl: "https://backend-production.convex.cloud",
      siteUrl: "https://backend-production.convex.site",
      previewDeployment: { state: "not_ensured" },
      origin: "selected_existing",
      connectedAt: 1,
      lastObservedAt: 1,
    });
    const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
      vaultId,
      userId,
      workerId,
      convexDeploymentId,
      wiring: {
        state: "wired",
        deployKeys: {
          production: {
            state: "created",
            name: "production-key",
            deploymentName: "backend-production",
          },
          preview: {
            state: "created",
            name: "preview-key",
            projectId: "convex-project",
          },
        },
      },
      createdAt: 1,
      updatedAt: 1,
    });

    return { dependencyId, workerId };
  });
}

describe("account deletion provider actions", () => {
  it("returns not connected without network calls", async () => {
    const t = makeConvexTest();
    const { runId } = await seedUser(t);
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.accountDeletion.providerActions.revokeForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      github: { state: "not_connected" },
      cloudflare: { state: "not_connected" },
      convex: { state: "not_connected" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats API keys as local deletion only", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: { method: "api_key", credential: "test-github-credential" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: { method: "api_key", credential: "test-cloudflare-credential" },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "api_key", credential: "test-convex-credential" },
        teamId: "test-team",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const resources = await seedRetainedProviderResources(t, userId);
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.accountDeletion.providerActions.revokeForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      github: { state: "local_delete_only" },
      cloudflare: { state: "local_delete_only" },
      convex: { state: "local_delete_only" },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(callCloudflareMcpToolMock).not.toHaveBeenCalled();
    await expect(
      t.run(async (ctx) => ({
        dependency: await ctx.db.get(resources.dependencyId),
        worker: await ctx.db.get(resources.workerId),
      })),
    ).resolves.toMatchObject({
      dependency: {
        wiring: {
          state: "wired",
          deployKeys: {
            production: { name: "production-key" },
            preview: { name: "preview-key" },
          },
        },
      },
      worker: {
        workerName: "retained-worker",
        builds: { state: "connected" },
      },
    });
  });

  it("revokes GitHub and native Cloudflare OAuth and flags Convex for manual revocation", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: { method: "oauth", credential: "test-github-credential" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "oauth",
          credential: "test-cloudflare-access-credential",
          refreshCredential: "test-cloudflare-refresh-credential",
          credentialExpiresAt: 100,
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "oauth", credential: "test-convex-credential" },
        teamId: "test-team",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await seedRetainedProviderResources(t, userId);
    vi.stubEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID", "github-client-test");
    vi.stubEnv("PROVIDER_GITHUB_OAUTH_CLIENT_SECRET", "github-secret-test");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client-test");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret-test");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(readRequestUrl(input));
        return new Response(null, { status: 204 });
      }),
    );

    const result = await t.action(
      internal.accountDeletion.providerActions.revokeForAccountDeletion,
      { runId, workflowId },
    );
    expect(result.github).toEqual({ state: "revoked" });
    expect(result.cloudflare).toEqual({ state: "revoked" });
    expect(result.convex).toEqual({
      state: "manual_revocation_required",
      safeNotice:
        "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications.",
    });
    expect(urls).toHaveLength(2);
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("api.github.com/applications/github-client-test/grant"),
        "https://dash.cloudflare.com/oauth2/revoke",
      ]),
    );
    expect(callCloudflareMcpToolMock).not.toHaveBeenCalled();
  });

  it("revokes a Cloudflare MCP OAuth refresh token through its advertised endpoint", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "mcp_oauth",
          credential: "test-cloudflare-access-credential",
          refreshCredential: "test-cloudflare-refresh-credential",
          credentialExpiresAt: 100,
          clientId: "test-cloudflare-client",
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const requests: Array<{ body: string | null; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : null,
          url: readRequestUrl(input),
        });
        return new Response(null, { status: 200 });
      }),
    );

    const result = await t.action(
      internal.accountDeletion.providerActions.revokeForAccountDeletion,
      { runId, workflowId },
    );
    expect(result.cloudflare).toEqual({ state: "revoked" });
    expect(requests).toEqual([
      {
        body: "client_id=test-cloudflare-client&token=test-cloudflare-refresh-credential&token_type_hint=refresh_token",
        url: "https://mcp.cloudflare.com/token",
      },
    ]);
  });

  it("returns provider-safe revocation failures", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "mcp_oauth",
          credential: "test-cloudflare-access-credential",
          refreshCredential: "test-cloudflare-refresh-credential",
          credentialExpiresAt: 100,
          clientId: "test-cloudflare-client",
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "provider-owned-sensitive-marker" }), {
          status: 503,
        }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await t.action(
      internal.accountDeletion.providerActions.revokeForAccountDeletion,
      { runId, workflowId },
    );
    expect(result.cloudflare).toEqual({
      state: "unconfirmed",
      safeError: "Cloudflare OAuth revocation could not be confirmed.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("provider-owned-sensitive-marker");
  });
});
