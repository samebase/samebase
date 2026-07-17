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
const dependencyDeployKeys = [
  {
    suffix: "one",
    deployKeys: {
      production: {
        state: "created",
        name: "production-key-one",
        deploymentName: "recorded-production-one",
      },
      preview: {
        state: "created",
        name: "preview-key-one",
        projectId: "1001",
      },
    },
  },
  {
    suffix: "two",
    deployKeys: {
      production: {
        state: "created",
        name: "production-key-two",
        deploymentName: "recorded-production-two",
      },
      preview: {
        state: "created",
        name: "preview-key-two",
        projectId: "1002",
      },
    },
  },
] as const;

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

async function seedConvexDependencyDeployKeys(t: ConvexTest, userId: Id<"users">): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: { method: "api_key", credential: "test-convex-credential" },
      teamId: "test-team",
      createdAt: 1,
      updatedAt: 1,
    });
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

    for (const dependency of dependencyDeployKeys) {
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appId: workerAppId,
        accountId: "cloudflare-account",
        workerName: `worker-${dependency.suffix}`,
        workerTag: `worker-tag-${dependency.suffix}`,
        origin: "selected_existing",
        builds: { state: "not_connected" },
        connectedAt: 1,
        lastObservedAt: 1,
      });
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appId: convexAppId,
        projectId: `current-project-${dependency.suffix}`,
        teamSlug: "test-team",
        projectSlug: `project-${dependency.suffix}`,
        deploymentName: `current-production-${dependency.suffix}`,
        deploymentType: "prod",
        cloudUrl: `https://current-production-${dependency.suffix}.convex.cloud`,
        siteUrl: `https://current-production-${dependency.suffix}.convex.site`,
        previewDeployment: { state: "not_ensured" },
        origin: "selected_existing",
        connectedAt: 1,
        lastObservedAt: 1,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId,
        userId,
        workerId,
        convexDeploymentId,
        wiring: {
          state: "wired",
          deployKeys: dependency.deployKeys,
        },
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
}

async function seedCloudflareBuildTargets(t: ConvexTest, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      userId,
      auth: { method: "api_key", credential: "test-cloudflare-credential" },
      defaultAccount: { state: "not_selected" },
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "apps/web",
      createdAt: 1,
    });
    const connectedWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      userId,
      appId,
      accountId: "connected-account",
      workerName: "connected-worker",
      workerTag: "connected-worker-tag",
      origin: "selected_existing",
      builds: {
        state: "connected",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["apps/web/*"],
        pathExcludes: [],
        production: {
          triggerUuid: "recorded-production-trigger",
          buildTokenUuid: "recorded-build-token",
        },
        preview: {
          triggerUuid: "recorded-preview-trigger",
          buildTokenUuid: "recorded-build-token",
        },
      },
      connectedAt: 1,
      lastObservedAt: 1,
    });
    const notConnectedWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      userId,
      appId,
      accountId: "not-connected-account",
      workerName: "not-connected-worker",
      workerTag: "not-connected-worker-tag",
      origin: "selected_existing",
      builds: { state: "not_connected" },
      connectedAt: 1,
      lastObservedAt: 1,
    });

    return { connectedWorkerId, notConnectedWorkerId };
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
  });

  it("paginates relation-owned Convex deploy keys without dropping a dependency", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await seedConvexDependencyDeployKeys(t, userId);

    const firstPage = await t.query(
      internal.accountDeletion.providerActions.listConvexDependencyDeployKeys,
      {
        runId,
        workflowId,
        paginationOpts: { cursor: null, numItems: 1 },
      },
    );
    expect(firstPage.page).toEqual([{ deployKeys: dependencyDeployKeys[0].deployKeys }]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await t.query(
      internal.accountDeletion.providerActions.listConvexDependencyDeployKeys,
      {
        runId,
        workflowId,
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
      },
    );
    expect(secondPage.page).toEqual([{ deployKeys: dependencyDeployKeys[1].deployKeys }]);
    expect(secondPage.isDone).toBe(true);
  });

  it("revokes every relation-owned Convex deploy key from its stored target", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await seedConvexDependencyDeployKeys(t, userId);
    const requests: Array<{ body: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ body: await request.clone().text(), url: request.url });
        return new Response("missing", { status: 404 });
      }),
    );

    await expect(
      t.action(internal.accountDeletion.providerActions.revokeForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      github: { state: "not_connected" },
      cloudflare: { state: "not_connected" },
      convex: { state: "local_delete_only" },
    });
    expect(requests).toEqual([
      {
        body: JSON.stringify({ id: "production-key-one" }),
        url: "https://api.convex.dev/v1/deployments/recorded-production-one/delete_deploy_key",
      },
      {
        body: JSON.stringify({ id: "preview-key-one" }),
        url: "https://api.convex.dev/v1/projects/1001/delete_preview_deploy_key",
      },
      {
        body: JSON.stringify({ id: "production-key-two" }),
        url: "https://api.convex.dev/v1/deployments/recorded-production-two/delete_deploy_key",
      },
      {
        body: JSON.stringify({ id: "preview-key-two" }),
        url: "https://api.convex.dev/v1/projects/1002/delete_preview_deploy_key",
      },
    ]);
  });

  it("detaches only connected Worker build triggers before locally deleting an API key", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    const workerIds = await seedCloudflareBuildTargets(t, userId);
    callCloudflareMcpToolMock
      .mockResolvedValueOnce(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [
            { trigger_uuid: "provider-production-trigger" },
            { trigger_uuid: "provider-preview-trigger" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ success: true, errors: [], messages: [], result: null }),
      )
      .mockRejectedValueOnce(
        new Error("Cloudflare MCP tool call failed: Error: Cloudflare API error: 12000: Not found"),
      );

    await expect(
      t.action(internal.accountDeletion.providerActions.revokeForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({
      github: { state: "not_connected" },
      cloudflare: { state: "local_delete_only" },
      convex: { state: "not_connected" },
    });
    expect(callCloudflareMcpToolMock).toHaveBeenCalledTimes(3);
    expect(callCloudflareMcpToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolArgs: {
          code: expect.stringContaining(
            "/accounts/connected-account/builds/workers/connected-worker-tag/triggers",
          ),
        },
      }),
    );
    expect(callCloudflareMcpToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolArgs: {
          code: expect.stringContaining(
            "/accounts/connected-account/builds/triggers/provider-production-trigger",
          ),
        },
      }),
    );
    expect(callCloudflareMcpToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolArgs: {
          code: expect.stringContaining(
            "/accounts/connected-account/builds/triggers/provider-preview-trigger",
          ),
        },
      }),
    );
    expect(JSON.stringify(callCloudflareMcpToolMock.mock.calls)).not.toContain(
      "not-connected-worker-tag",
    );
    expect(JSON.stringify(callCloudflareMcpToolMock.mock.calls)).not.toContain("/workers/workers/");

    await expect(
      t.run(async (ctx) => ({
        connected: await ctx.db.get(workerIds.connectedWorkerId),
        notConnected: await ctx.db.get(workerIds.notConnectedWorkerId),
      })),
    ).resolves.toMatchObject({
      connected: { workerName: "connected-worker" },
      notConnected: { workerName: "not-connected-worker" },
    });
  });

  it("treats a missing connected Worker as already detached", async () => {
    const t = makeConvexTest();
    const { runId, userId } = await seedUser(t);
    await seedCloudflareBuildTargets(t, userId);
    callCloudflareMcpToolMock.mockRejectedValueOnce(
      new Error(
        "Cloudflare MCP tool call failed: Error: Cloudflare API error: 10007: Worker not found",
      ),
    );

    await expect(
      t.action(internal.accountDeletion.providerActions.revokeForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toMatchObject({
      cloudflare: { state: "local_delete_only" },
    });
    expect(callCloudflareMcpToolMock).toHaveBeenCalledTimes(1);
    expect(callCloudflareMcpToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolArgs: {
          code: expect.stringContaining(
            "/accounts/connected-account/builds/workers/connected-worker-tag/triggers",
          ),
        },
      }),
    );
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
        "Convex OAuth cannot be revoked by Samebase. Samebase removed its recorded Worker deploy keys; revoke Samebase in Convex Authorized Applications to end the remaining OAuth grant.",
    });
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("api.github.com/applications/github-client-test/grant"),
        "https://dash.cloudflare.com/oauth2/revoke",
      ]),
    );
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
