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
    };
  });
  return { ids, t };
}

describe("vault Convex project graph mutations", () => {
  it("persists resource origin and permits multiple projects on one app", async () => {
    const { ids, t } = await createGraphFixture();
    const selectedProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "selected-project",
      origin: "selected_existing",
    });
    const provisionedProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId: ids.primary.vaultId,
      userId: ids.userId,
      appId: ids.primary.appId,
      teamId: "team-1",
      projectId: "provisioned-project",
      origin: "provisioned",
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

    const projects = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_app", (q) => q.eq("appId", ids.primary.appId))
        .collect();
    });
    expect(projects.sort((left, right) => left.projectId.localeCompare(right.projectId))).toMatchObject(
      [
        {
          _id: provisionedProjectId,
          appId: ids.primary.appId,
          origin: "provisioned",
          projectId: "provisioned-project",
        },
        {
          _id: selectedProjectId,
          appId: ids.primary.appId,
          origin: "selected_existing",
          projectId: "selected-project",
        },
      ],
    );
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
        vaultId: ids.secondary.vaultId,
        userId: ids.userId,
        appId: ids.secondary.appId,
        teamId: "team-1",
        projectId: "shared-project",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Convex project is already attached.");
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
