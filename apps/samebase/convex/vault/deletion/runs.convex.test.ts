import { describe, expect, it } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

const rootDirectory = "/";

async function createExistingRepositoryVaultWithConvex(args: {
  origin: "provisioned" | "selected_existing";
}) {
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
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
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
      name: "manual-convex",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("vaultConvexProjects", {
      vaultId,
      userId,
      convexConfigPath: "convex.json",
      teamId: "team-id",
      projectId: "convex-project",
      origin: args.origin,
    });
    if (args.origin === "provisioned") {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: "team-id",
        teamSlug: "ada-team",
        createdAt: 15,
        updatedAt: 15,
      });
    }

    return { userId, vaultId };
  });

  return { ids, t };
}

async function createSamebaseManagedVaultWithConvex(args: { withProject: boolean }) {
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
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/managed-convex",
      trigger: "create",
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
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "managed-convex",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: {
        method: "api_key",
        credential: "convex-token",
      },
      teamId: "team-id",
      teamSlug: "ada-team",
      createdAt: 15,
      updatedAt: 15,
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
        accountId: "cloudflare-account",
        accountName: "Ada Cloudflare",
      },
      createdAt: 15,
      updatedAt: 15,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      userId,
      convexConfigPath: "convex.json",
      convex: { state: "planned", projectName: "managed-convex" },
      cloudflare: {
        state: "planned",
        accountId: "cloudflare-account",
        workerName: "managed-convex",
        build: {
          rootDirectory,
          buildCommand: "pnpm run build",
          deployCommand: "pnpm run deploy",
          previewDeployCommand: "pnpm run deploy:preview",
          pathIncludes: ["*"],
          pathExcludes: [],
        },
      },
      createdAt: 13,
      updatedAt: 13,
    });
    if (args.withProject) {
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        teamId: "team-id",
        projectId: "convex-project",
        origin: "provisioned",
      });
    }

    return { userId, vaultId };
  });

  return { ids, t };
}

const deleteConvexOptions = {
  removeGithubRepo: false,
  removeConvexProvision: true,
  removeCloudflareProvision: false,
};

const deleteCloudflareOptions = {
  removeGithubRepo: false,
  removeConvexProvision: false,
  removeCloudflareProvision: true,
};

describe("vault deletion Convex resource planning", () => {
  it.each([
    { currentStep: "run_created" as const, state: "queued" as const },
    { currentStep: "sync_tree" as const, state: "running" as const },
  ])("blocks deletion while connected repository setup is $state", async (run) => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "selected_existing",
    });
    await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      if (!vault || vault.state !== "connected") {
        throw new Error("Connected vault fixture is missing.");
      }
      await ctx.db.patch(vault.runId, {
        state: run.state,
        currentStep: run.currentStep,
        updatedAt: 30,
        completedAt: undefined,
      });
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        ...ids,
        options: {
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow("Vault source setup is still running.");

    const snapshot = await t.run(async (ctx) => ({
      deletionRuns: await ctx.db
        .query("workflow_vaultDeletion_runs")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect(),
      vault: await ctx.db.get(ids.vaultId),
    }));
    expect(snapshot.deletionRuns).toEqual([]);
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
  });

  it("blocks deletion while a manual provider write is active", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "selected_existing",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        owner: {
          kind: "manual_provider_write",
          actionId: "create-convex-project",
          action: "create_convex_project",
          expiresAt: 20,
        },
        state: "active",
        lastWriteAt: { convex: 12 },
        updatedAt: 12,
      });
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        ...ids,
        options: {
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow("A provider change is still running.");
  });

  it("keeps an attached Convex project when provider cleanup is not selected", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "provisioned",
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: {
        ...deleteConvexOptions,
        removeConvexProvision: false,
      },
    });
    const snapshot = await t.run(async (ctx) => ({
      projects: await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect(),
      run: await ctx.db.get(deletionRunId),
    }));

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "skip",
            reason: "not_requested",
          },
        },
      },
    });
  });

  it("deletes a provisioned Convex project attached to an existing repository vault", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "provisioned",
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "delete_project",
            projectId: "convex-project",
          },
        },
      },
    });
  });

  it("refuses automatic Convex cleanup across more than one team", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "provisioned",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexProjects", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        convexConfigPath: "convex.json",
        teamId: "other-team",
        projectId: "other-project",
        origin: "provisioned",
      });
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        ...ids,
        options: deleteConvexOptions,
      }),
    ).rejects.toThrow("Managed Convex projects span more than one team.");
  });

  it("requires the connected Convex team before planning project cleanup", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "provisioned",
    });
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Test Convex connection not found.");
      }
      await ctx.db.patch(connection._id, { teamId: "other-team" });
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        ...ids,
        options: deleteConvexOptions,
      }),
    ).rejects.toThrow("Connect the Convex team that owns these projects before removing them.");
  });

  it("does not delete a selected existing Convex project", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "selected_existing",
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "skip",
            reason: "not_managed",
          },
        },
      },
    });
  });

  it("does not treat a Convex checkpoint alone as deletion ownership", async () => {
    const { ids, t } = await createSamebaseManagedVaultWithConvex({
      withProject: false,
    });
    await t.run(async (ctx) => {
      const plan = await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!plan) {
        throw new Error("Test provisioning plan not found.");
      }
      await ctx.db.patch(plan._id, {
        convex: {
          state: "created",
          projectName: "managed-convex",
          teamId: "team-id",
          projectId: "created-convex-project",
        },
      });
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "skip",
            reason: "not_recorded",
          },
        },
      },
    });
  });

  it("does not treat a Worker checkpoint alone as deletion ownership", async () => {
    const { ids, t } = await createSamebaseManagedVaultWithConvex({
      withProject: false,
    });
    await t.run(async (ctx) => {
      const plan = await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!plan) {
        throw new Error("Test provisioning plan not found.");
      }
      await ctx.db.patch(plan._id, {
        cloudflare: {
          ...plan.cloudflare,
          state: "created",
          workerTag: "created-worker-tag",
        },
      });
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteCloudflareOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          cloudflare: {
            action: "skip",
            reason: "not_recorded",
          },
        },
      },
    });
  });

  it("deletes a managed Convex project only when the project records provisioned origin", async () => {
    const withProject = await createSamebaseManagedVaultWithConvex({
      withProject: true,
    });
    const withoutProject = await createSamebaseManagedVaultWithConvex({
      withProject: false,
    });

    const { deletionRunId: deleteRunId } = await withProject.t.mutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        ...withProject.ids,
        options: deleteConvexOptions,
      },
    );
    const { deletionRunId: skipRunId } = await withoutProject.t.mutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        ...withoutProject.ids,
        options: deleteConvexOptions,
      },
    );
    const [deleteRun, skipRun] = await Promise.all([
      withProject.t.run(async (ctx) => await ctx.db.get(deleteRunId)),
      withoutProject.t.run(async (ctx) => await ctx.db.get(skipRunId)),
    ]);

    expect(deleteRun).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "delete_project",
            projectId: "convex-project",
          },
        },
      },
    });
    expect(skipRun).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "skip",
            reason: "not_recorded",
          },
        },
      },
    });
  });
});
