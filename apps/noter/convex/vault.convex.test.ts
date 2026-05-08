import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("vault dashboard Convex contract", () => {
  it("exposes post-GitHub source setup failures from the current run", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/source-setup-failed",
        trigger: "create",
        state: "failed",
        currentStep: "sync_tree",
        lastError: "Fallback sync failure.",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "source-setup-failed",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("appProvisioningEvents", {
        userId,
        vaultId,
        repositoryFullName: "ada/source-setup-failed",
        runId,
        step: "sync_tree",
        level: "error",
        message: "Initial tree sync failed.",
        createdAt: 31,
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.getUserVaults);

    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: true,
      repositoryFullName: "ada/source-setup-failed",
      state: "copying_files",
      sourceSetup: {
        status: "failed",
        runId: ids.runId,
        step: "sync_tree",
        message: "Initial tree sync failed.",
        updatedAt: 30,
      },
    });
  });

  it("surfaces a missing setup run instead of hiding source setup", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/missing-run",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "missing-run",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.delete(runId);

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: true,
      state: "copying_files",
      sourceSetup: {
        status: "failed",
        runId: ids.runId,
        step: "run_created",
        message: "Provisioning run not found.",
        updatedAt: 20,
      },
    });
  });

  it("derives provider setup from vault provider states instead of infrastructure metadata", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/provider-state",
        trigger: "create",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "provider-state",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "provider-state-project",
          deploymentName: "provider-state-prod",
          connectedAt: 24,
        },
        cloudflare: {
          state: "provisioning",
          runId,
          startedAt: 25,
        },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("vaultInfrastructure", {
        vaultId,
        status: "ready",
        provisioningVersion: 1,
        convexProjectId: "stale-convex-project",
        convexProjectSlug: "stale-project",
        convexDeploymentName: "stale-prod",
        cloudflare: {
          accountId: "stale-account",
          projectName: "stale-pages-project",
          productionUrl: "https://stale.pages.dev",
        },
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      state: "ready",
      hasConvexProvision: true,
      hasCloudflareProvision: false,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        runId: ids.runId,
        step: "ensure_cloudflare",
        updatedAt: 30,
      },
    });
    expect(vaults[0]).not.toHaveProperty("cloudflareProductionUrl");
    expect(vaults[0]).not.toHaveProperty("cloudflareProjectDashboardUrl");
  });

  it("uses the active infrastructure retry run while Cloudflare is not configured", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
      });
      const createRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/cloudflare-retry",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });
      const retryRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/cloudflare-retry",
        trigger: "retry",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 40,
        updatedAt: 45,
      });

      await ctx.db.replace(vaultId, {
        userId,
        state: "connected",
        githubMode: "create_repository",
        runId: createRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "cloudflare-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "cloudflare-retry-project",
          deploymentName: "cloudflare-retry-prod",
          connectedAt: 24,
        },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId: retryRunId,
        provisioningVersion: 2,
        state: "active",
        updatedAt: 44,
      });

      return { retryRunId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        runId: ids.retryRunId,
        step: "ensure_cloudflare",
        updatedAt: 45,
      },
    });
  });

  it("does not surface completed provider runs as active", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/completed-provider-run",
        trigger: "retry",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "completed-provider-run",
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
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      providerSetup: {
        status: "failed",
        provider: "convex",
        runId: ids.runId,
        step: "finish",
        updatedAt: 30,
      },
    });
  });

  it("returns infrastructure domains in a stable display order", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/domain-order",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "domain-order",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "domain-order-project",
          deploymentName: "domain-order-prod",
          connectedAt: 24,
        },
        cloudflare: {
          state: "connected",
          accountId: "cloudflare-account",
          projectName: "domain-order-pages",
          productionUrl: "https://domain-order.pages.dev",
          connectedAt: 26,
        },
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "z-feature",
        kind: "branch_preview",
        url: "https://z-feature.pages.dev",
        source: "cloudflare_pages_default",
        active: true,
        lastSyncedAt: 30,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "main",
        kind: "main",
        url: "https://b-main.pages.dev",
        source: "cloudflare_pages_default",
        active: true,
        lastSyncedAt: 31,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "a-feature",
        kind: "branch_preview",
        url: "https://a-feature.pages.dev",
        source: "cloudflare_pages_default",
        active: true,
        lastSyncedAt: 32,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "main",
        kind: "main",
        url: "https://a-main.pages.dev",
        source: "cloudflare_pages_custom",
        active: true,
        lastSyncedAt: 33,
      });

      return { userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const infrastructure = await asUser.query(
      api.vault.getVaultInfrastructure,
      {
        vaultId: ids.vaultId,
      },
    );
    if (!infrastructure) {
      throw new Error("Vault infrastructure result is missing.");
    }

    expect(infrastructure.domains.map((domain) => domain.url)).toEqual([
      "https://a-main.pages.dev",
      "https://b-main.pages.dev",
      "https://a-feature.pages.dev",
      "https://z-feature.pages.dev",
    ]);
  });
});
