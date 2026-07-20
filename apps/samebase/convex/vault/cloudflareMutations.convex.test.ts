import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function createGraphFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const otherUserId = await ctx.db.insert("users", {
      name: "Grace",
      email: "grace@example.com",
      isApproved: true,
    });

    const createConnectedVault = async (ownerId: typeof userId, suffix: string) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId: ownerId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ownerId,
        vaultId,
        repositoryFullName: `${suffix}/repository`,
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        userId: ownerId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: `github-${suffix}`,
        owner: suffix,
        name: "repository",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 3,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId: ownerId,
        rootDirectory: "/",
        createdAt: 4,
      });
      const nestedAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId: ownerId,
        rootDirectory: "apps/admin",
        createdAt: 5,
      });
      return { appId, nestedAppId, vaultId };
    };

    return {
      userId,
      otherUserId,
      primary: await createConnectedVault(userId, "ada"),
      secondary: await createConnectedVault(userId, "ada-second"),
      foreign: await createConnectedVault(otherUserId, "grace"),
    };
  });
  return { ids, t };
}

describe("vault Cloudflare Worker graph mutations", () => {
  it("persists resource origin and permits multiple Workers on one app", async () => {
    const { ids, t } = await createGraphFixture();
    const selectedWorkerId = await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      accountId: "account-1",
      workerName: "selected-worker",
      workerTag: "selected-tag",
      origin: "selected_existing",
    });
    const provisionedWorkerId = await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      accountId: "account-1",
      workerName: "provisioned-worker",
      workerTag: "provisioned-tag",
      origin: "provisioned",
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.primary.appId,
        accountId: "account-1",
        workerName: "selected-worker",
        workerTag: "selected-tag",
        origin: "provisioned",
      }),
    ).resolves.toEqual(selectedWorkerId);

    const workers = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_app", (q) => q.eq("appId", ids.primary.appId))
        .collect();
    });
    expect(
      workers.sort((left, right) => left.workerName.localeCompare(right.workerName)),
    ).toMatchObject([
      {
        _id: provisionedWorkerId,
        appId: ids.primary.appId,
        origin: "provisioned",
        workerName: "provisioned-worker",
      },
      {
        _id: selectedWorkerId,
        appId: ids.primary.appId,
        origin: "provisioned",
        workerName: "selected-worker",
      },
    ]);
  });

  it("rejects duplicate provider names or tags elsewhere in the Samebase graph", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      accountId: "account-1",
      workerName: "shared-name",
      workerTag: "shared-tag",
      origin: "selected_existing",
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.primary.nestedAppId,
        accountId: "account-1",
        workerName: "shared-name",
        workerTag: "different-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Cloudflare Worker is already attached.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: ids.foreign.vaultId,
        userId: ids.otherUserId,
        appId: ids.foreign.appId,
        accountId: "account-1",
        workerName: "shared-name",
        workerTag: "shared-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Cloudflare Worker is already attached.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: ids.secondary.vaultId,
        userId: ids.userId,
        appId: ids.secondary.appId,
        accountId: "account-1",
        workerName: "different-name",
        workerTag: "shared-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Cloudflare Worker is already attached.");
  });

  it("removes only the unchanged missing Worker attachment", async () => {
    const { ids, t } = await createGraphFixture();
    const workerId = await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      accountId: "account-1",
      workerName: "missing-worker",
      workerTag: "missing-tag",
      origin: "selected_existing",
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.removeMissingWorkerAttachment, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        accountId: "account-1",
        workerName: "missing-worker",
        workerTag: "changed-tag",
      }),
    ).rejects.toThrow("Cloudflare Worker attachment changed before removal.");

    await expect(
      t.mutation(internal.vault.cloudflareMutations.removeMissingWorkerAttachment, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        accountId: "account-1",
        workerName: "missing-worker",
        workerTag: "missing-tag",
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toBeNull();
  });

  it("checkpoints managed Worker creation only for the active run", async () => {
    const { ids, t } = await createGraphFixture();
    const { planId, runId, writeLockId } = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.primary.vaultId,
        repositoryFullName: "ada/repository",
        trigger: "retry",
        state: "running",
        currentStep: "attach_worker",
        createdAt: 10,
        updatedAt: 10,
      });
      const writeLockId = await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.primary.vaultId,
        runId,
        state: "active",
        updatedAt: 10,
      });
      const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appRoot: ".",
        convex: { state: "planned", projectName: "managed-project" },
        cloudflare: {
          state: "planned",
          accountId: "account-1",
          workerName: "managed-worker",
          build: {
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
          },
        },
        createdAt: 10,
        updatedAt: 10,
      });
      return { planId, runId, writeLockId };
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.readManagedWorkerCreateCheckpoint, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        accountId: "account-1",
        workerName: "managed-worker",
      }),
    ).resolves.toEqual({ state: "planned" });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.beginManagedWorkerCreate, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        accountId: "account-1",
        workerName: "managed-worker",
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.vault.cloudflareMutations.readManagedWorkerCreateCheckpoint, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        accountId: "account-1",
        workerName: "managed-worker",
      }),
    ).resolves.toEqual({ state: "creating" });
    const workerId = await t.mutation(
      internal.vault.cloudflareMutations.recordManagedWorkerCreated,
      {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        appId: ids.primary.appId,
        accountId: "account-1",
        workerName: "managed-worker",
        workerTag: "created-worker-tag",
      },
    );
    await expect(
      t.run(async (ctx) => ({
        plan: await ctx.db.get(planId),
        worker: await ctx.db.get(workerId),
      })),
    ).resolves.toMatchObject({
      plan: {
        cloudflare: {
          state: "created",
          accountId: "account-1",
          workerName: "managed-worker",
          workerTag: "created-worker-tag",
        },
      },
      worker: {
        vaultId: ids.primary.vaultId,
        appId: ids.primary.appId,
        accountId: "account-1",
        workerName: "managed-worker",
        workerTag: "created-worker-tag",
        origin: "provisioned",
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(writeLockId, { state: "failed" });
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        appId: ids.primary.appId,
        accountId: "account-1",
        workerName: "managed-worker",
        workerTag: "other-worker-tag",
      }),
    ).rejects.toThrow("Managed provisioning run no longer holds the write lock.");
  });

  it("enforces vault, app, and user ownership", async () => {
    const { ids, t } = await createGraphFixture();

    await expect(
      t.query(internal.vault.cloudflareMutations.readWorkerAttachmentContext, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.secondary.appId,
      }),
    ).rejects.toThrow("Vault app not found.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: ids.primary.vaultId,
        userId: ids.otherUserId,
        appId: ids.primary.appId,
        accountId: "account-1",
        workerName: "foreign-worker",
        workerTag: "foreign-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Vault not found.");
  });

  it("reads an explicitly selected Worker and Convex project without persisting a relationship", async () => {
    const { ids, t } = await createGraphFixture();
    const workerId = await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      accountId: "account-1",
      workerName: "web-worker",
      workerTag: "web-tag",
      origin: "selected_existing",
    });
    const convexProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.nestedAppId,
      teamId: "team-1",
      projectId: "shared-backend",
      origin: "provisioned",
    });
    const foreignProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.secondary.vaultId,
      userId: ids.userId,
      appId: ids.secondary.appId,
      teamId: "team-1",
      projectId: "foreign-project",
      origin: "selected_existing",
    });
    await expect(
      t.query(internal.vault.cloudflareMutations.readWorkerConvexProjectConfigurationContext, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        convexProjectId: foreignProjectId,
      }),
    ).rejects.toThrow("Convex project attachment not found.");

    await expect(
      t.query(internal.vault.cloudflareMutations.readWorkerConvexProjectConfigurationContext, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        convexProjectId,
      }),
    ).resolves.toMatchObject({
      ghRepoId: "github-ada",
      owner: "ada",
      name: "repository",
      defaultBranch: "main",
      rootDirectory: "/",
      accountId: "account-1",
      workerName: "web-worker",
      workerTag: "web-tag",
      convexProject: {
        convexProjectId,
        teamId: "team-1",
        projectId: "shared-backend",
      },
    });
    await expect(
      t.query(internal.vault.cloudflareMutations.readWorkerConfigurationContext, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
      }),
    ).resolves.toEqual({
      ghRepoId: "github-ada",
      owner: "ada",
      name: "repository",
      defaultBranch: "main",
      rootDirectory: "/",
      accountId: "account-1",
      workerName: "web-worker",
      workerTag: "web-tag",
    });
  });
});
