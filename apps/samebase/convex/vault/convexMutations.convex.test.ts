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

describe("vault Convex project attachment mutations", () => {
  it("atomically attaches multiple projects and permits a shared config path", async () => {
    const { ids, t } = await createGraphFixture();
    const projectIds = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      projects: [
        {
          teamId: "team-1",
          projectId: "project-1",
          convexConfigPath: "apps/web/convex.json",
          origin: "selected_existing",
        },
        {
          teamId: "team-1",
          projectId: "project-2",
          convexConfigPath: "apps/web/convex.json",
          origin: "provisioned",
        },
      ],
    });
    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        projects: [
          {
            teamId: "team-1",
            projectId: "project-1",
            convexConfigPath: "apps/web/convex.json",
            origin: "provisioned",
          },
        ],
      }),
    ).resolves.toEqual([projectIds[0]]);

    const projects = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.primaryVaultId))
        .collect();
    });
    expect(projects).toHaveLength(2);
    expect(projects.map((project) => project.origin)).toEqual(["provisioned", "provisioned"]);
  });

  it("enforces global project identity before writing any batch member", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      projects: [
        {
          teamId: "team-1",
          projectId: "shared-project",
          convexConfigPath: "convex.json",
          origin: "selected_existing",
        },
      ],
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: ids.secondaryVaultId,
        userId: ids.userId,
        projects: [
          {
            teamId: "team-1",
            projectId: "new-project",
            convexConfigPath: "convex.json",
            origin: "selected_existing",
          },
          {
            teamId: "team-2",
            projectId: "shared-project",
            convexConfigPath: "apps/admin/convex.json",
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow("Convex project is already attached.");

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_project", (q) => q.eq("projectId", "new-project"))
          .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("reconciles one field at a time and detaches only an expected attachment", async () => {
    const { ids, t } = await createGraphFixture();
    const [convexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      projects: [
        {
          teamId: "team-1",
          projectId: "project-1",
          convexConfigPath: "convex.json",
          origin: "selected_existing",
        },
      ],
    });
    if (!convexProjectId) {
      throw new Error("Expected a project attachment.");
    }

    await expect(
      t.mutation(internal.vault.convexMutations.reconcileProjectTeam, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        convexProjectId,
        projectId: "project-1",
        expectedTeamId: "wrong-team",
        nextTeamId: "team-2",
      }),
    ).rejects.toThrow("Convex project attachment changed before team reconciliation.");
    await t.mutation(internal.vault.convexMutations.reconcileProjectTeam, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      convexProjectId,
      projectId: "project-1",
      expectedTeamId: "team-1",
      nextTeamId: "team-2",
    });
    await t.mutation(internal.vault.convexMutations.reconcileProjectConvexConfigPath, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      convexProjectId,
      projectId: "project-1",
      expectedConvexConfigPath: "convex.json",
      nextConvexConfigPath: "apps/web/convex.json",
    });

    await expect(
      t.mutation(internal.vault.convexMutations.detachProject, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        convexProjectId,
        teamId: "team-1",
        projectId: "project-1",
        convexConfigPath: "apps/web/convex.json",
      }),
    ).rejects.toThrow("Convex project attachment changed before removal.");
    await expect(
      t.mutation(internal.vault.convexMutations.detachProject, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        convexProjectId,
        teamId: "team-2",
        projectId: "project-1",
        convexConfigPath: "apps/web/convex.json",
      }),
    ).resolves.toBeNull();
  });

  it("derives managed placement from the active provisioning plan", async () => {
    const { ids, t } = await createGraphFixture();
    const { planId, runId, writeLockId } = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.primaryVaultId,
        repositoryFullName: "ada/repository",
        trigger: "retry",
        state: "running",
        currentStep: "attach_convex",
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
        convexConfigPath: "apps/web/convex.json",
        convex: { state: "planned", projectName: "managed-project" },
        cloudflare: {
          state: "planned",
          accountId: "account-1",
          workerName: "managed-worker",
          build: {
            rootDirectory: "apps/web",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["apps/web/*"],
            pathExcludes: [],
          },
        },
        createdAt: 10,
        updatedAt: 10,
      });
      return { planId, runId, writeLockId };
    });

    await t.mutation(internal.vault.convexMutations.beginManagedProjectCreate, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      runId,
      projectName: "managed-project",
      teamId: "team-1",
    });
    await expect(
      t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
        convexConfigPath: "convex.json",
        projectName: "managed-project",
        teamId: "team-1",
        projectId: "created-project",
      }),
    ).rejects.toThrow("Managed Convex config path does not match the provisioning plan.");
    const convexProjectId = await t.mutation(
      internal.vault.convexMutations.recordManagedProjectCreated,
      {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
        convexConfigPath: "apps/web/convex.json",
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
      plan: { convex: { state: "created", projectId: "created-project" } },
      project: {
        vaultId: ids.primaryVaultId,
        convexConfigPath: "apps/web/convex.json",
        teamId: "team-1",
        projectId: "created-project",
        origin: "provisioned",
      },
    });

    await t.run(async (ctx) => await ctx.db.patch(writeLockId, { state: "failed" }));
    await expect(
      t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
        convexConfigPath: "apps/web/convex.json",
        projectName: "managed-project",
        teamId: "team-1",
        projectId: "other-project",
      }),
    ).rejects.toThrow("Managed provisioning run no longer holds the write lock.");
  });

  it("enforces vault ownership", async () => {
    const { ids, t } = await createGraphFixture();
    await expect(
      t.query(internal.vault.convexMutations.requireConvexProjectConnectionVault, {
        vaultId: ids.foreignVaultId,
        userId: ids.userId,
      }),
    ).rejects.toThrow("Vault not found.");
  });
});
