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

describe("vault Convex project graph mutations", () => {
  it("persists one project per app and upgrades confirmed creation ownership", async () => {
    const { ids, t } = await createGraphFixture();
    const selectedProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "selected-project",
      origin: "selected_existing",
    });
    await expect(
      t.mutation(internal.vault.convexMutations.attachProject, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.primary.appId,
        teamId: "team-1",
        projectId: "selected-project",
        origin: "provisioned",
      }),
    ).resolves.toEqual(selectedProjectId);
    await expect(
      t.mutation(internal.vault.convexMutations.attachProject, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.primary.appId,
        teamId: "team-1",
        projectId: "second-project",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Vault app already has a Convex project.");

    const projects = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_app", (q) => q.eq("appId", ids.primary.appId))
        .collect();
    });
    expect(projects).toMatchObject([
      {
        _id: selectedProjectId,
        appId: ids.primary.appId,
        origin: "provisioned",
        projectId: "selected-project",
      },
    ]);
  });

  it("rejects attaching one provider project to another app or vault", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "shared-project",
      origin: "selected_existing",
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachProject, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.primary.nestedAppId,
        teamId: "team-1",
        projectId: "shared-project",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Convex project is already attached.");
    await expect(
      t.mutation(internal.vault.convexMutations.attachProject, {
        vaultId: ids.foreign.vaultId,
        userId: ids.otherUserId,
        appId: ids.foreign.appId,
        teamId: "team-1",
        projectId: "shared-project",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Convex project is already attached.");
    await expect(
      t.mutation(internal.vault.convexMutations.attachProject, {
        vaultId: ids.secondary.vaultId,
        userId: ids.userId,
        appId: ids.secondary.appId,
        teamId: "team-1",
        projectId: "shared-project",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Convex project is already attached.");
  });

  it("removes only the unchanged missing project attachment", async () => {
    const { ids, t } = await createGraphFixture();
    const convexProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "missing-project",
      origin: "selected_existing",
    });

    await expect(
      t.mutation(internal.vault.convexMutations.removeMissingProjectAttachment, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        convexProjectId,
        teamId: "team-1",
        projectId: "changed-project",
      }),
    ).rejects.toThrow("Convex project attachment changed before removal.");

    await expect(
      t.mutation(internal.vault.convexMutations.removeMissingProjectAttachment, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        convexProjectId,
        teamId: "team-1",
        projectId: "missing-project",
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toBeNull();
  });

  it("checkpoints managed project creation only for the active run", async () => {
    const { ids, t } = await createGraphFixture();
    const { planId, runId, writeLockId } = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.primary.vaultId,
        repositoryFullName: "ada/repository",
        trigger: "retry",
        state: "running",
        currentStep: "attach_convex",
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
      t.query(internal.vault.convexMutations.readManagedProjectCreateCheckpoint, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        projectName: "managed-project",
        teamId: "team-1",
      }),
    ).resolves.toEqual({ state: "planned" });
    await expect(
      t.mutation(internal.vault.convexMutations.beginManagedProjectCreate, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        projectName: "managed-project",
        teamId: "team-1",
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.vault.convexMutations.readManagedProjectCreateCheckpoint, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        projectName: "managed-project",
        teamId: "team-1",
      }),
    ).resolves.toEqual({ state: "creating" });
    const convexProjectId = await t.mutation(
      internal.vault.convexMutations.recordManagedProjectCreated,
      {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        appId: ids.primary.appId,
        projectName: "managed-project",
        teamId: "team-1",
        projectId: "created-project",
      },
    );
    await expect(
      t.run(async (ctx) => ({
        plan: await ctx.db.get(planId),
        project: await ctx.db.get(convexProjectId),
      })),
    ).resolves.toMatchObject({
      plan: {
        convex: {
          state: "created",
          projectName: "managed-project",
          teamId: "team-1",
          projectId: "created-project",
        },
      },
      project: {
        vaultId: ids.primary.vaultId,
        appId: ids.primary.appId,
        teamId: "team-1",
        projectId: "created-project",
        origin: "provisioned",
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(writeLockId, { state: "failed" });
    });
    await expect(
      t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        runId,
        appId: ids.primary.appId,
        projectName: "managed-project",
        teamId: "team-1",
        projectId: "other-project",
      }),
    ).rejects.toThrow("Managed provisioning run no longer holds the write lock.");
  });

  it("enforces vault, app, and user ownership", async () => {
    const { ids, t } = await createGraphFixture();

    await expect(
      t.query(internal.vault.convexMutations.requireConvexProjectConnectionVault, {
        vaultId: ids.primary.vaultId,
        userId: ids.userId,
        appId: ids.secondary.appId,
      }),
    ).rejects.toThrow("Vault app not found.");
    await expect(
      t.mutation(internal.vault.convexMutations.attachProject, {
        vaultId: ids.primary.vaultId,
        userId: ids.otherUserId,
        appId: ids.primary.appId,
        teamId: "team-1",
        projectId: "foreign-project",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Vault not found.");
  });
});
