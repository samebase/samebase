import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import {
  resolveConnectionFailureProvider,
  selectCloudflareBuildConfigTreeData,
  selectExistingCloudflareWorkerTag,
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

describe("selectExistingCloudflareWorkerTag", () => {
  it("prefers the fully connected Worker tag", () => {
    expect(
      selectExistingCloudflareWorkerTag({
        cloudflare: {
          state: "connected",
          accountId: "account-1",
          workerName: "noter",
          workerTag: "connected-worker-tag",
          productionUrl: "https://noter.example.workers.dev",
          connectedAt: 20,
        },
        target: {
          cloudflareAccountId: "account-1",
          cloudflareWorkerTag: "target-worker-tag",
        },
        accountId: "account-1",
      }),
    ).toBe("connected-worker-tag");
  });

  it("trusts a recorded target Worker tag for the same account", () => {
    expect(
      selectExistingCloudflareWorkerTag({
        cloudflare: { state: "not_configured" },
        target: {
          cloudflareAccountId: "account-1",
          cloudflareWorkerTag: " target-worker-tag ",
        },
        accountId: "account-1",
      }),
    ).toBe("target-worker-tag");
  });

  it("ignores a recorded target Worker tag for another account", () => {
    expect(
      selectExistingCloudflareWorkerTag({
        cloudflare: { state: "not_configured" },
        target: {
          cloudflareAccountId: "account-1",
          cloudflareWorkerTag: "target-worker-tag",
        },
        accountId: "account-2",
      }),
    ).toBe(undefined);
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
        convexProjectName: "provider-retry",
        cloudflareWorkerName: "provider-retry",
        createdAt: 31,
        updatedAt: 31,
      });

      return { runId, vaultId };
    });

    const result = await t.mutation(
      internal.infraProvisioning.recordConvexProjectIdentity,
      {
        vaultId: ids.vaultId,
        runId: ids.runId,
        projectId: "convex-project-id",
      },
    );
    const target = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(result).toEqual({ applied: true });
    expect(target).toMatchObject({
      convexProjectId: "convex-project-id",
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
        cloudflare: {
          state: "provisioning",
          runId,
          startedAt: 26,
        },
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
        convexProjectName: "provider-retry",
        cloudflareWorkerName: "provider-retry",
        createdAt: 31,
        updatedAt: 31,
      });

      return { runId, vaultId };
    });

    const result = await t.mutation(
      internal.infraProvisioning.recordCloudflareWorkerIdentity,
      {
        vaultId: ids.vaultId,
        runId: ids.runId,
        accountId: "cloudflare-account-id",
        workerName: "provider-retry",
        workerTag: "cloudflare-worker-tag",
        productionUrl: "https://provider-retry.example.workers.dev",
      },
    );
    const target = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });

    expect(result).toEqual({ applied: true });
    expect(target).toMatchObject({
      cloudflareAccountId: "cloudflare-account-id",
      cloudflareWorkerName: "provider-retry",
      cloudflareWorkerTag: "cloudflare-worker-tag",
      cloudflareProductionUrl: "https://provider-retry.example.workers.dev",
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

    const result = await t.mutation(
      internal.infraProvisioning.claimWorkflowProvisioning,
      {
        vaultId: ids.vaultId,
        runId: ids.nextRunId,
        force: false,
      },
    );
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

    await t.mutation(
      internal.infraProvisioning.markWorkflowProvisioningFailed,
      {
        runId: ids.runId,
        workflowId: "workflow-generic",
        message: "GitHub connection is required to provision infrastructure.",
      },
    );

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
        cloudflare: {
          state: "provisioning",
          runId,
          startedAt: 26,
        },
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

    await t.mutation(
      internal.infraProvisioning.markWorkflowProvisioningFailed,
      {
        runId: ids.runId,
        workflowId: "workflow-cloudflare",
        message:
          "Error: Uncaught Error: Cloudflare connection is missing Workers Builds write access. Reconnect Cloudflare and grant Workers Builds, Workers, and Workers Scripts access, then retry.\n    at requestCloudflareApi",
      },
    );

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
});
