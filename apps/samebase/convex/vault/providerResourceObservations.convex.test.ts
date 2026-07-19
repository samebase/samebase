import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

type SeedOptions = {
  cloudflareConnection: boolean;
  convexConnection: boolean;
};

function cloudflareResponse(result: unknown): Response {
  return Response.json({ success: true, errors: [], messages: [], result });
}

function readFetchUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

async function seedVault(options: SeedOptions) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    if (options.convexConnection) {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "1000",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    if (options.cloudflareConnection) {
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "oauth",
          credential: "cloudflare-token",
          refreshCredential: "cloudflare-refresh-token",
          credentialExpiresAt: 4_102_444_800_000,
        },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare-account",
          accountName: "Ada Cloudflare",
        },
        createdAt: 1,
        updatedAt: 1,
      });
    }
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot: ".",
      createdAt: 21,
    });
    const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
      vaultId,
      userId,
      appRoot: ".",
      projectId: "123",
      deploymentName: "demo-prod",
      origin: "selected_existing",
      connectedAt: 22,
    });
    const cloudflareWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      userId,
      appRoot: ".",
      accountId: "cloudflare-account",
      workerName: "demo-worker",
      workerTag: "demo-worker-tag",
      origin: "selected_existing",
      connectedAt: 23,
    });
    return { cloudflareWorkerId, convexDeploymentId, userId, vaultId };
  });
  const user = t.withIdentity({
    subject: `${ids.userId}|test-session`,
    tokenIdentifier: `test:${ids.userId}`,
  });
  return { ids, t, user };
}

function installAvailableProviderFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = readFetchUrl(input);
      if (url.endsWith("/v1/projects/123")) {
        return Response.json({
          createTime: 1,
          id: "123",
          name: "Demo",
          prodDeploymentName: "demo-prod",
          slug: "demo",
          teamId: "1000",
          teamSlug: "ada-team",
        });
      }
      if (url.endsWith("/v1/deployments/demo-prod")) {
        return Response.json({
          class: "s16",
          createTime: 1,
          deploymentType: "prod",
          deploymentUrl: "https://demo.convex.cloud",
          id: "456",
          isDefault: true,
          kind: "cloud",
          name: "demo-prod",
          projectId: "123",
          reference: "prod",
          region: "aws-us-east-1",
        });
      }
      if (url.endsWith("/builds/workers/demo-worker-tag/triggers")) {
        return cloudflareResponse([]);
      }
      if (url.endsWith("/workers/scripts/demo-worker/subdomain")) {
        return cloudflareResponse({ enabled: false });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("vault provider resource observations", () => {
  it("observes current provider state without mutating attachment rows", async () => {
    const { ids, t, user } = await seedVault({
      cloudflareConnection: true,
      convexConnection: true,
    });
    vi.spyOn(Date, "now").mockReturnValue(100);
    installAvailableProviderFetch();

    await expect(
      user.action(api.vault.providerResourceObservations.observeVaultProviderResources, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      vaultId: ids.vaultId,
      convexDeployments: [
        {
          appRoot: ".",
          projectId: "123",
          deploymentName: "demo-prod",
          observation: {
            state: "available",
            observedAt: 100,
            projectSlug: "demo",
            teamSlug: "ada-team",
            cloudUrl: "https://demo.convex.cloud",
            siteUrl: "https://demo-prod.convex.site",
            projectSettingsDashboardUrl: "https://dashboard.convex.dev/t/ada-team/demo/settings",
            deploymentDashboardUrl: "https://dashboard.convex.dev/t/ada-team/demo/demo-prod",
          },
        },
      ],
      cloudflareWorkers: [
        {
          appRoot: ".",
          accountId: "cloudflare-account",
          workerName: "demo-worker",
          workerTag: "demo-worker-tag",
          observation: {
            state: "available",
            observedAt: 100,
            githubRepositoryConnection: "not_connected",
            convexDeployKeys: "not_applicable",
          },
        },
      ],
    });

    const attachments = await t.run(async (ctx) => ({
      convex: await ctx.db.get(ids.convexDeploymentId),
      cloudflare: await ctx.db.get(ids.cloudflareWorkerId),
    }));
    expect(attachments.convex).toMatchObject({
      projectId: "123",
      deploymentName: "demo-prod",
      connectedAt: 22,
    });
    expect(attachments.convex).not.toHaveProperty("cloudUrl");
    expect(attachments.convex).not.toHaveProperty("lastObservedAt");
    expect(attachments.cloudflare).toMatchObject({
      accountId: "cloudflare-account",
      workerName: "demo-worker",
      connectedAt: 23,
    });
    expect(attachments.cloudflare).not.toHaveProperty("deployment");
    expect(attachments.cloudflare).not.toHaveProperty("lastObservedAt");
  });

  it("reports connection-required failures without attempting provider requests", async () => {
    const { ids, user } = await seedVault({
      cloudflareConnection: false,
      convexConnection: false,
    });
    vi.spyOn(Date, "now").mockReturnValue(200);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await user.action(
      api.vault.providerResourceObservations.observeVaultProviderResources,
      { vaultId: ids.vaultId },
    );

    expect(result.convexDeployments[0]?.observation).toEqual({
      state: "failed",
      observedAt: 200,
      reason: "connection_required",
    });
    expect(result.cloudflareWorkers[0]?.observation).toEqual({
      state: "failed",
      observedAt: 200,
      reason: "connection_required",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a provider-deleted Convex deployment as missing", async () => {
    const { ids, user } = await seedVault({
      cloudflareConnection: false,
      convexConnection: true,
    });
    vi.spyOn(Date, "now").mockReturnValue(300);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    const result = await user.action(
      api.vault.providerResourceObservations.observeVaultProviderResources,
      { vaultId: ids.vaultId },
    );

    expect(result.convexDeployments[0]?.observation).toEqual({
      state: "missing",
      observedAt: 300,
    });
  });
});
