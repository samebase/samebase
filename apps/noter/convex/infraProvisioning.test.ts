import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import {
  resolveCloudflareBuildConfig,
  resolveConnectionFailureProvider,
  selectCloudflareBuildConfigTreeData,
  selectExistingCloudflareWorker,
} from "./infraProvisioning";
import type { GithubTreeData } from "./schema";
import { makeConvexTest } from "./test.setup";

const branchTreeData = {
  sha: "branch-tree",
  truncated: false,
  tree: [
    {
      path: "apps/noter/package.json",
      mode: "100644",
      type: "blob",
      sha: "package-sha",
    },
  ],
} satisfies GithubTreeData;
const convexProjectId = "9223372036854775807";
const convexTeamId = "9223372036854775806";
const otherConvexTeamId = "9223372036854775805";

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

describe("resolveCloudflareBuildConfig", () => {
  it("narrows Workers Builds triggers for monorepo Noter apps", () => {
    expect(resolveCloudflareBuildConfig({ treeData: branchTreeData })).toEqual({
      rootDir: "apps/noter",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm exec wrangler deploy",
      previewDeployCommand: "pnpm exec wrangler versions upload",
      pathIncludes: [
        "apps/noter/*",
        "packages/dependent/*",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "package.json",
        ".nvmrc",
      ],
      pathExcludes: [],
    });
  });

  it("keeps root apps on the broad trigger default", () => {
    expect(
      resolveCloudflareBuildConfig({
        treeData: {
          sha: "root-tree",
          truncated: false,
          tree: [
            {
              path: "package.json",
              mode: "100644",
              type: "blob",
              sha: "package-sha",
            },
          ],
        },
      }),
    ).toEqual({
      rootDir: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("selectExistingCloudflareWorker", () => {
  it("prefers the fully connected Worker tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflare: {
          state: "connected",
          accountId: "account-1",
          workerName: "noter",
          workerTag: "connected-worker-tag",
          workersDevUrl: "https://noter.example.workers.dev",
          origin: "provisioned",
          connectedAt: 20,
          lastObservedAt: 20,
        },
        cloudflareTarget: {
          state: "planned",
          accountId: "account-1",
          workerName: "noter",
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "created", workerTag: "connected-worker-tag" });
  });

  it("prefers the provisional Worker tag recorded for retries", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflare: { state: "not_configured" },
        cloudflareTarget: {
          state: "created",
          accountId: "account-1",
          workerName: "noter",
          workerTag: "provisional-worker-tag",
          workersDevUrl: "https://noter.example.workers.dev",
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "created", workerTag: "provisional-worker-tag" });
  });

  it("keeps missing Worker identity adoptable without a recorded tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflare: { state: "not_configured" },
        cloudflareTarget: {
          state: "planned",
          accountId: "account-1",
          workerName: "noter",
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "planned" });
  });

  it("keeps planned Worker names adoptable without a recorded tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflare: { state: "not_configured" },
        cloudflareTarget: {
          state: "planned",
          accountId: "account-2",
          workerName: "noter",
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
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
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
        convex: {
          state: "provisioning",
          runId,
          startedAt: 25,
        },
        cloudflare: { state: "not_configured" },
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
        convex: {
          state: "planned",
          projectName: "provider-retry",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "provider-retry",
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
        convex: {
          state: "connected",
          projectId: "convex-project-id",
          projectSlug: "provider-retry",
          deploymentName: "provider-retry-prod",
          connectedAt: 25,
        },
        cloudflare: { state: "not_configured" },
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
        convex: {
          state: "planned",
          projectName: "provider-retry",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account-id",
          workerName: "provider-retry",
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
    const { vault, target } = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const target = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { target, vault };
    });

    expect(result).toEqual({ applied: true });
    expect(vault).toMatchObject({
      cloudflare: {
        state: "not_configured",
      },
    });
    expect(target).toMatchObject({
      cloudflare: {
        state: "created",
        accountId: "cloudflare-account-id",
        workerName: "provider-retry",
        workerTag: "cloudflare-worker-tag",
        workersDevUrl: "https://provider-retry.example.workers.dev",
      },
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
        convex: {
          state: "connected",
          projectId: "convex-project-id",
          projectSlug: "deploy-keys",
          deploymentName: "deploy-keys-prod",
          connectedAt: 25,
        },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("vaultInfrastructure", {
        vaultId,
        convexProjectId: "convex-project-id",
        convexTeamSlug: "ada-team",
        convexProjectSlug: "deploy-keys",
        convexDeploymentName: "deploy-keys-prod",
        convexDeploymentType: "prod",
        convexCloudUrl: "https://deploy-keys.convex.cloud",
        convexSiteUrl: "https://deploy-keys.convex.site",
        convexDeployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
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
    const infrastructure = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructure")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(productionRecord).toEqual({ applied: true });
    expect(previewRecord).toEqual({ applied: true });
    expect(infrastructure).toMatchObject({
      convexDeployKeys: {
        production: { state: "created", id: "production-key-id" },
        preview: { state: "created", id: "preview-key-id" },
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
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "fresh-ownership-project",
          deploymentName: "fresh-ownership-prod",
          connectedAt: 25,
        },
        cloudflare: { state: "not_configured" },
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
        convex: {
          state: "provisioning",
          runId,
          startedAt: 25,
        },
        cloudflare: { state: "not_configured" },
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
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
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
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "cloudflare-token-failure",
          deploymentName: "cloudflare-token-failure-prod",
          connectedAt: 25,
        },
        cloudflare: { state: "not_configured" },
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
        convex: {
          state: "connected",
          projectId: convexProjectId,
          projectSlug: "preview-validation",
          deploymentName: "preview-validation-prod",
          connectedAt: 25,
        },
        cloudflare: { state: "not_configured" },
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
      await ctx.db.insert("vaultInfrastructure", {
        vaultId,
        convexProjectId,
        convexTeamSlug: "ada-team",
        convexProjectSlug: "preview-validation",
        convexDeploymentName: "preview-validation-prod",
        convexDeploymentType: "prod",
        convexCloudUrl: "https://preview-validation.convex.cloud",
        convexSiteUrl: "https://preview-validation.convex.site",
        convexDeployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
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
