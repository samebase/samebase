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
    expect(workers.sort((left, right) => left.workerName.localeCompare(right.workerName))).toMatchObject(
      [
        {
          _id: provisionedWorkerId,
          appId: ids.primary.appId,
          origin: "provisioned",
          workerName: "provisioned-worker",
        },
        {
          _id: selectedWorkerId,
          appId: ids.primary.appId,
          origin: "selected_existing",
          workerName: "selected-worker",
        },
      ],
    );
  });

  it("rejects duplicate provider names or tags elsewhere in the user's graph", async () => {
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

  it("attaches, orders, and removes explicit Worker-to-project dependencies", async () => {
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
    const zetaProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "zeta-project",
      origin: "selected_existing",
    });
    const alphaProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "alpha-project",
      origin: "provisioned",
    });
    const zetaDependencyId = await t.mutation(
      internal.vault.cloudflareMutations.attachWorkerConvexProjectDependency,
      {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        convexProjectId: zetaProjectId,
      },
    );
    const foreignProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.secondary.vaultId,
      userId: ids.userId,
      appId: ids.secondary.appId,
      teamId: "team-1",
      projectId: "foreign-project",
      origin: "selected_existing",
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerConvexProjectDependency, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        convexProjectId: foreignProjectId,
      }),
    ).rejects.toThrow("Convex project attachment not found.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.removeWorkerConvexProjectDependency, {
        vaultId: ids.secondary.vaultId,
        userId: ids.userId,
        dependencyId: zetaDependencyId,
      }),
    ).rejects.toThrow("Worker dependency not found.");
    const alphaDependencyId = await t.mutation(
      internal.vault.cloudflareMutations.attachWorkerConvexProjectDependency,
      {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        convexProjectId: alphaProjectId,
      },
    );
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerConvexProjectDependency, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
        convexProjectId: alphaProjectId,
      }),
    ).resolves.toEqual(alphaDependencyId);

    const beforeRemoval = await t.query(
      internal.vault.cloudflareMutations.readWorkerConfigurationContext,
      {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
      },
    );
    expect(beforeRemoval.convexProjects.map((project) => project.projectId)).toEqual([
      "alpha-project",
      "zeta-project",
    ]);
    expect(beforeRemoval).toMatchObject({
      ghRepoId: "github-ada",
      owner: "ada",
      name: "repository",
      defaultBranch: "main",
      rootDirectory: "/",
      accountId: "account-1",
      workerName: "web-worker",
      workerTag: "web-tag",
    });

    await t.mutation(internal.vault.cloudflareMutations.removeWorkerConvexProjectDependency, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      dependencyId: alphaDependencyId,
    });
    const afterRemoval = await t.query(
      internal.vault.cloudflareMutations.readWorkerConfigurationContext,
      {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        workerId,
      },
    );
    expect(afterRemoval.convexProjects.map((project) => project.projectId)).toEqual([
      "zeta-project",
    ]);
  });
});
