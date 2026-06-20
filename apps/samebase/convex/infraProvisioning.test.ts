import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import {
  resolveConnectionFailureProvider,
  selectCloudflareBuildConfigTreeData,
  selectExistingCloudflareWorker,
} from "./infraProvisioning";
import type { GithubTreeData } from "./schema";
import { makeConvexTest } from "./test.setup";
import { buildVaultCloudflareBuildConfigForAppRoot } from "./vault/model";

const branchTreeData = {
  sha: "branch-tree",
  truncated: false,
  tree: [
    {
      path: "apps/samebase/package.json",
      mode: "100644",
      type: "blob",
      sha: "package-sha",
    },
  ],
} satisfies GithubTreeData;
const convexProjectId = "9223372036854775807";
const convexTeamId = "9223372036854775806";
const otherConvexTeamId = "9223372036854775805";
const rootCloudflareAppRoot = ".";
const rootCloudflareBuild = buildVaultCloudflareBuildConfigForAppRoot({
  appRoot: rootCloudflareAppRoot,
});

describe("selectCloudflareBuildConfigTreeData", () => {
  it("prefers the branch tree cache", () => {
    expect(
      selectCloudflareBuildConfigTreeData({
        branchTreeData,
      }),
    ).toBe(branchTreeData);
  });

  it("fails before provider side effects when no tree is cached", () => {
    expect(() =>
      selectCloudflareBuildConfigTreeData({
        branchTreeData: null,
      }),
    ).toThrow("Default branch tree is not synced yet.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("selectExistingCloudflareWorker", () => {
  it("prefers the provisional Worker tag recorded for retries", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflareTarget: {
          state: "created",
          accountId: "account-1",
          workerName: "noter",
          workerTag: "provisional-worker-tag",
          workersDevUrl: "https://noter.example.workers.dev",
          build: rootCloudflareBuild,
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "created", workerTag: "provisional-worker-tag" });
  });

  it("keeps missing Worker identity adoptable without a recorded tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflareTarget: {
          state: "planned",
          accountId: "account-1",
          workerName: "noter",
          build: rootCloudflareBuild,
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "planned" });
  });

  it("keeps planned Worker names adoptable without a recorded tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflareTarget: {
          state: "planned",
          accountId: "account-2",
          workerName: "noter",
          build: rootCloudflareBuild,
        },
        accountId: "account-2",
      }),
    ).toEqual({ state: "planned" });
  });
});

describe("resolveConnectionFailureProvider", () => {
  it("detects Cloudflare connection failures", () => {
    expect(
      resolveConnectionFailureProvider(
        "Cloudflare connection is required to provision infrastructure.",
      ),
    ).toBe("cloudflare");
  });

  it("detects Convex connection failures", () => {
    expect(
      resolveConnectionFailureProvider(
        "Convex connection is required to provision infrastructure.",
      ),
    ).toBe("convex");
  });

  it("leaves unrelated failures unattributed", () => {
    expect(
      resolveConnectionFailureProvider(
        "GitHub connection is required to provision infrastructure.",
      ),
    ).toBe(null);
  });
});

describe("infrastructure provisioning ownership", () => {
  it("requires a target row before provider side effects", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/older-retry",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 10,
        updatedAt: 10,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "older-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });

      return { runId, vaultId };
    });

    await expect(
      t.mutation(internal.infraProvisioning.claimWorkflowProvisioning, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        force: true,
      }),
    ).rejects.toThrow("Infrastructure target is required before provisioning can be claimed.");
  });

  it("records provisional Convex project identity for retries", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/provider-retry",
        trigger: "create",
        state: "running",
        currentStep: "ensure_convex",
        createdAt: 10,
        updatedAt: 10,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "provider-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appRoot: rootCloudflareAppRoot,
        convex: {
          state: "planned",
          projectName: "provider-retry",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "provider-retry",
          build: rootCloudflareBuild,
        },
        createdAt: 31,
        updatedAt: 31,
      });

      return { runId, vaultId };
    });

    const result = await t.mutation(internal.infraProvisioning.recordConvexProjectIdentity, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      projectId: "convex-project-id",
    });
    const target = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(result).toEqual({ applied: true });
    expect(target).toMatchObject({
      convex: {
        state: "created",
        projectName: "provider-retry",
        projectId: "convex-project-id",
      },
      appRoot: rootCloudflareAppRoot,
    });
  });

  it("records provisional Cloudflare Worker identity for retries", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/provider-retry",
        trigger: "create",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 10,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "provider-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appRoot: rootCloudflareAppRoot,
        convex: {
          state: "planned",
          projectName: "provider-retry",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "provider-retry",
          build: rootCloudflareBuild,
        },
        createdAt: 31,
        updatedAt: 31,
      });

      return { runId, vaultId };
    });

    const result = await t.mutation(internal.infraProvisioning.recordCloudflareWorkerIdentity, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      accountId: "cloudflare-account-id",
      workerName: "provider-retry",
      workerTag: "cloudflare-worker-tag",
      workersDevUrl: "https://provider-retry.example.workers.dev",
    });
    const target = await t.run(async (ctx) => {
      const target = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return target;
    });

    expect(result).toEqual({ applied: true });
    expect(target).toMatchObject({
      cloudflare: {
        state: "created",
        accountId: "cloudflare-account-id",
        workerName: "provider-retry",
        workerTag: "cloudflare-worker-tag",
        workersDevUrl: "https://provider-retry.example.workers.dev",
        build: rootCloudflareBuild,
      },
      appRoot: rootCloudflareAppRoot,
    });
  });

  it("records production and preview Convex deploy key ids separately", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/deploy-keys",
        trigger: "create",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 10,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "deploy-keys",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appRoot: rootCloudflareAppRoot,
        convex: {
          state: "created",
          projectName: "deploy-keys",
          projectId: "convex-project-id",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "deploy-keys",
          build: rootCloudflareBuild,
        },
        createdAt: 31,
        updatedAt: 31,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot: rootCloudflareAppRoot,
        projectId: "convex-project-id",
        teamSlug: "ada-team",
        projectSlug: "deploy-keys",
        deploymentName: "deploy-keys-prod",
        deploymentType: "prod",
        cloudUrl: "https://deploy-keys.convex.cloud",
        siteUrl: "https://deploy-keys.convex.site",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "provisioned",
        connectedAt: 25,
        lastObservedAt: 25,
      });

      return { runId, vaultId };
    });

    const productionRecord = await t.mutation(
      internal.infraProvisioning.recordConvexDeployKeyIdentity,
      {
        vaultId: ids.vaultId,
        runId: ids.runId,
        deployment: "production",
        convexDeployKeyId: "production-key-id",
      },
    );
    const previewRecord = await t.mutation(
      internal.infraProvisioning.recordConvexDeployKeyIdentity,
      {
        vaultId: ids.vaultId,
        runId: ids.runId,
        deployment: "preview",
        convexDeployKeyId: "preview-key-id",
      },
    );
    const deployment = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(productionRecord).toEqual({ applied: true });
    expect(previewRecord).toEqual({ applied: true });
    expect(deployment).toMatchObject({
      deployKeys: {
        production: { state: "created", id: "production-key-id" },
        preview: { state: "created", id: "preview-key-id" },
      },
    });
  });

  it("creates project preview deploy keys for Cloudflare preview builds", async () => {
    const requests: { method: string; url: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ method: request.method, url: request.url });
        const json = (value: string) =>
          new Response(value, {
            status: 200,
            headers: { "content-type": "application/json" },
          });

        if (request.url === `https://api.convex.dev/v1/projects/${convexProjectId}`) {
          return json(`{
            "createTime": 1710000000000,
            "id": ${convexProjectId},
            "name": "Deploy keys",
            "slug": "deploy-keys",
            "teamId": ${convexTeamId},
            "teamSlug": "ada-team"
          }`);
        }
        if (
          request.url ===
          `https://api.convex.dev/v1/projects/${convexProjectId}/deployment?defaultDev=true`
        ) {
          return json(`{
            "class": "free",
            "createTime": 1710000000000,
            "deploymentType": "dev",
            "deploymentUrl": "https://deploy-keys-dev.convex.cloud",
            "id": 123,
            "isDefault": true,
            "kind": "cloud",
            "name": "deploy-keys-dev",
            "projectId": ${convexProjectId},
            "reference": "default-dev",
            "region": "aws-us-east-1"
          }`);
        }
        if (
          request.url === "https://api.convex.dev/v1/deployments/deploy-keys-prod/create_deploy_key"
        ) {
          return json(`{
            "deployKey": "prod:deploy-keys-prod|production-secret"
          }`);
        }
        if (
          request.url ===
          `https://api.convex.dev/v1/projects/${convexProjectId}/create_preview_deploy_key`
        ) {
          return json(`{
            "previewDeployKey": "preview:ada-team:deploy-keys|preview-secret"
          }`);
        }

        return new Response("stop after Convex key creation", {
          status: 500,
          headers: { "content-type": "text/plain" },
        });
      }),
    );

    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/deploy-keys",
        trigger: "create",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 10,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "deploy-keys",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: {
          method: "api_key",
          credential: "github-token",
        },
        createdAt: 21,
        updatedAt: 21,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: convexTeamId,
        createdAt: 22,
        updatedAt: 22,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "api_key",
          credential: "cloudflare-token",
        },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare-account-id",
          accountName: "Ada Cloudflare",
        },
        createdAt: 23,
        updatedAt: 23,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appRoot: rootCloudflareAppRoot,
        convex: {
          state: "created",
          projectName: "deploy-keys",
          projectId: convexProjectId,
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "deploy-keys",
          build: rootCloudflareBuild,
        },
        createdAt: 31,
        updatedAt: 31,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot: rootCloudflareAppRoot,
        projectId: convexProjectId,
        teamSlug: "ada-team",
        projectSlug: "deploy-keys",
        deploymentName: "deploy-keys-prod",
        deploymentType: "prod",
        cloudUrl: "https://deploy-keys.convex.cloud",
        siteUrl: "https://deploy-keys.convex.site",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "provisioned",
        connectedAt: 25,
        lastObservedAt: 25,
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: branchTreeData.sha,
        treeData: branchTreeData,
        lastTreeRefreshAt: 32,
      });

      return { runId, vaultId };
    });

    await expect(
      t.action(internal.infraProvisioning.ensureCloudflareInfrastructure, {
        vaultId: ids.vaultId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("GitHub API request failed");

    const convexKeyRequests = requests
      .filter((request) => request.url.startsWith("https://api.convex.dev/v1/"))
      .filter((request) => request.method === "POST")
      .map((request) => new URL(request.url).pathname);
    const deployment = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(convexKeyRequests).toEqual([
      "/v1/deployments/deploy-keys-prod/create_deploy_key",
      `/v1/projects/${convexProjectId}/create_preview_deploy_key`,
    ]);
    expect(deployment).toMatchObject({
      deployKeys: {
        production: { state: "created", id: "prod:deploy-keys-prod" },
        preview: { state: "created", id: "preview:ada-team:deploy-keys" },
      },
    });
  });

  it("keeps active ownership fresh between provider state transitions", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const activeRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/fresh-ownership",
        trigger: "create",
        state: "running",
        currentStep: "ensure_convex_preview",
        createdAt: 10,
        updatedAt: 30,
      });
      const nextRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/fresh-ownership",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 40,
        updatedAt: 40,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: activeRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "fresh-ownership",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId: activeRunId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: Date.now(),
      });

      return { activeRunId, nextRunId, vaultId };
    });

    const result = await t.mutation(internal.infraProvisioning.claimWorkflowProvisioning, {
      vaultId: ids.vaultId,
      runId: ids.nextRunId,
      force: false,
    });
    const ownership = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(result).toEqual({ claimed: false });
    expect(ownership).toMatchObject({
      runId: ids.activeRunId,
      state: "active",
    });
  });

  it("leaves generic connection failures unattributed to a provider", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/generic-connection-failure",
        workflowId: "workflow-generic",
        trigger: "retry",
        state: "running",
        currentStep: "validate_connections",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "generic-connection-failure",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 31,
      });

      return { runId, vaultId };
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-generic",
      message: "GitHub connection is required to provision infrastructure.",
    });

    const vault = await t.run(async (ctx) => await ctx.db.get(ids.vaultId));

    expect(vault).toMatchObject({
      state: "connected",
    });
  });

  it("records known provider errors in the visible provisioning log", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/cloudflare-token-failure",
        workflowId: "workflow-cloudflare",
        trigger: "retry",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "cloudflare-token-failure",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 31,
      });

      return { runId };
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-cloudflare",
      message:
        "Error: Uncaught Error: Cloudflare connection is missing Workers Builds write access. Reconnect Cloudflare and grant Workers Builds, Workers, and Workers Scripts access, then retry.\n    at requestCloudflareApi",
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const event = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first();
      return { event, run };
    });

    const expectedMessage =
      "Cloudflare connection is missing Workers Builds write access. Reconnect Cloudflare and grant Workers Builds, Workers, and Workers Scripts access, then retry.";
    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "ensure_cloudflare",
      level: "error",
      message: expectedMessage,
    });
  });

  it("records GitHub repository validation errors in the visible provisioning log", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/github-validation-failure",
        workflowId: "workflow-github",
        trigger: "create",
        state: "running",
        currentStep: "fetch_github_repo",
        createdAt: 10,
        updatedAt: 30,
      });

      return { runId };
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-github",
      message:
        "Error: Uncaught Error: GitHub repository response did not match the vault repo.\n    at fetchGitHubRepoIdentity",
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const event = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first();
      return { event, run };
    });

    const expectedMessage = "GitHub repository response did not match the vault repo.";
    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "fetch_github_repo",
      level: "error",
      message: expectedMessage,
    });
  });

  it("validates the preview Convex project against the connected team", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);
        return new Response(
          `{
            "createTime": 1710000000000,
            "id": ${convexProjectId},
            "name": "Preview validation",
            "slug": "preview-validation",
            "teamId": ${otherConvexTeamId},
            "teamSlug": "other-team"
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/preview-validation",
        trigger: "create",
        state: "running",
        currentStep: "ensure_convex_preview",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "preview-validation",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: convexTeamId,
        createdAt: 26,
        updatedAt: 26,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appRoot: rootCloudflareAppRoot,
        convex: {
          state: "created",
          projectName: "preview-validation",
          projectId: convexProjectId,
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "preview-validation",
          build: rootCloudflareBuild,
        },
        createdAt: 31,
        updatedAt: 31,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot: rootCloudflareAppRoot,
        projectId: convexProjectId,
        teamSlug: "ada-team",
        projectSlug: "preview-validation",
        deploymentName: "preview-validation-prod",
        deploymentType: "prod",
        cloudUrl: "https://preview-validation.convex.cloud",
        siteUrl: "https://preview-validation.convex.site",
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "provisioned",
        connectedAt: 25,
        lastObservedAt: 25,
      });

      return { runId, vaultId };
    });

    await expect(
      t.action(internal.infraProvisioning.ensureConvexPreviewInfrastructure, {
        vaultId: ids.vaultId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Convex project belonged to a different team.");

    expect(requests).toEqual([`https://api.convex.dev/v1/projects/${convexProjectId}`]);
  });
});
