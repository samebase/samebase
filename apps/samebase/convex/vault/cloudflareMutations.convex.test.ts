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
      return vaultId;
    };

    return {
      userId,
      otherUserId,
      primaryVaultId: await createConnectedVault(userId, "ada"),
      secondaryVaultId: await createConnectedVault(userId, "ada-second"),
      foreignVaultId: await createConnectedVault(otherUserId, "grace"),
    };
  });
  return { ids, t };
}

describe("vault Cloudflare Worker attachment mutations", () => {
  it("atomically attaches multiple Workers and upgrades confirmed ownership", async () => {
    const { ids, t } = await createGraphFixture();
    const workerIds = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      workers: [
        {
          accountId: "account-1",
          workerName: "selected-worker",
          workerTag: "selected-tag",
          origin: "selected_existing",
        },
        {
          accountId: "account-1",
          workerName: "provisioned-worker",
          workerTag: "provisioned-tag",
          origin: "provisioned",
        },
      ],
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        workers: [
          {
            accountId: "account-1",
            workerName: "selected-worker",
            workerTag: "selected-tag",
            origin: "provisioned",
          },
        ],
      }),
    ).resolves.toEqual([workerIds[0]]);

    const workers = await t.run(async (ctx) =>
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.primaryVaultId))
        .collect(),
    );
    expect(workers).toHaveLength(2);
    expect(workers.map((worker) => worker.origin)).toEqual(["provisioned", "provisioned"]);
  });

  it("rejects provider identity conflicts before writing any batch member", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      workers: [
        {
          accountId: "account-1",
          workerName: "shared-name",
          workerTag: "shared-tag",
          origin: "selected_existing",
        },
      ],
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        vaultId: ids.secondaryVaultId,
        userId: ids.userId,
        workers: [
          {
            accountId: "account-1",
            workerName: "new-worker",
            workerTag: "new-tag",
            origin: "selected_existing",
          },
          {
            accountId: "account-1",
            workerName: "different-name",
            workerTag: "shared-tag",
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow("Cloudflare Worker is already attached.");

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_account_and_worker", (q) =>
            q.eq("accountId", "account-1").eq("workerName", "new-worker"),
          )
          .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("detaches only an explicitly selected unchanged attachment", async () => {
    const { ids, t } = await createGraphFixture();
    const [workerId] = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      workers: [
        {
          accountId: "account-1",
          workerName: "selected-worker",
          workerTag: "selected-tag",
          origin: "selected_existing",
        },
      ],
    });
    if (!workerId) {
      throw new Error("Expected a Worker attachment.");
    }

    await expect(
      t.mutation(internal.vault.cloudflareMutations.detachWorker, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        workerId,
        accountId: "account-1",
        workerName: "selected-worker",
        workerTag: "changed-tag",
      }),
    ).rejects.toThrow("Cloudflare Worker attachment changed before removal.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.detachWorker, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        workerId,
        accountId: "account-1",
        workerName: "selected-worker",
        workerTag: "selected-tag",
      }),
    ).resolves.toBeNull();
  });

  it("checkpoints managed Worker creation only for the active run", async () => {
    const { ids, t } = await createGraphFixture();
    const { planId, runId, writeLockId } = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.primaryVaultId,
        repositoryFullName: "ada/repository",
        trigger: "retry",
        state: "running",
        currentStep: "attach_worker",
        createdAt: 10,
        updatedAt: 10,
      });
      const writeLockId = await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.primaryVaultId,
        runId,
        state: "active",
        updatedAt: 10,
      });
      const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        convexConfigPath: "convex.json",
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

    await t.mutation(internal.vault.cloudflareMutations.beginManagedWorkerCreate, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      runId,
      accountId: "account-1",
      workerName: "managed-worker",
    });
    const workerId = await t.mutation(
      internal.vault.cloudflareMutations.recordManagedWorkerCreated,
      {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
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
      plan: { cloudflare: { state: "created", workerTag: "created-worker-tag" } },
      worker: {
        vaultId: ids.primaryVaultId,
        accountId: "account-1",
        workerName: "managed-worker",
        workerTag: "created-worker-tag",
        origin: "provisioned",
      },
    });

    await t.run(async (ctx) => await ctx.db.patch(writeLockId, { state: "failed" }));
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
        accountId: "account-1",
        workerName: "managed-worker",
        workerTag: "other-worker-tag",
      }),
    ).rejects.toThrow("Managed provisioning run no longer holds the write lock.");
  });

  it("reads vault attachment context without inventing a Worker placement", async () => {
    const { ids, t } = await createGraphFixture();
    const [workerId] = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      workers: [
        {
          accountId: "account-1",
          workerName: "web-worker",
          workerTag: "web-tag",
          origin: "selected_existing",
        },
      ],
    });
    const [convexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      projects: [
        {
          teamId: "team-1",
          projectId: "shared-backend",
          convexConfigPath: "apps/api/convex.json",
          origin: "selected_existing",
        },
      ],
    });
    if (!workerId || !convexProjectId) {
      throw new Error("Expected provider attachments.");
    }

    await expect(
      t.query(internal.vault.providerObservationQueries.readProviderAttachmentVaultContext, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
      }),
    ).resolves.toEqual({
      ghRepoId: "github-ada",
      owner: "ada",
      name: "repository",
      defaultBranch: "main",
    });
    await expect(
      t.query(internal.vault.cloudflareMutations.readWorkerConvexProjectConfigurationContext, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        workerId,
        convexProjectId,
      }),
    ).resolves.toMatchObject({
      accountId: "account-1",
      workerName: "web-worker",
      workerTag: "web-tag",
      convexProject: {
        convexProjectId,
        teamId: "team-1",
        projectId: "shared-backend",
        convexConfigPath: "apps/api/convex.json",
      },
    });
  });

  it("enforces vault ownership", async () => {
    const { ids, t } = await createGraphFixture();
    await expect(
      t.query(internal.vault.providerObservationQueries.readProviderAttachmentVaultContext, {
        vaultId: ids.foreignVaultId,
        userId: ids.userId,
      }),
    ).rejects.toThrow("Vault not found.");
  });
});
