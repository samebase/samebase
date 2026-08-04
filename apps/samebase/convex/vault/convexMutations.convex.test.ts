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
    const organizationId = await ctx.db.insert("organizations", {});
    const otherOrganizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    await ctx.db.insert("organizationMemberships", {
      organizationId: otherOrganizationId,
      userId: otherUserId,
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId: otherOrganizationId,
      plan: "free",
      status: "inactive",
    });
    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "github-token" },
      accountId: "github-ada",
      createdAt: 1,
      updatedAt: 1,
    });
    const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "convex",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "convex-token" },
      teamId: "team-1",
      createdAt: 1,
      updatedAt: 1,
    });
    const cloudflareProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "cloudflare-token" },
      defaultAccount: { state: "not_selected" },
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(organizationId, {
      selectedConvexProviderConnectionId: convexProviderConnectionId,
      selectedCloudflareProviderConnectionId: cloudflareProviderConnectionId,
      selectedGithubProviderConnectionId: githubProviderConnectionId,
    });
    const otherGithubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId: otherOrganizationId,
      connectedByUserId: otherUserId,
      auth: { method: "api_key", credential: "github-grace-token" },
      accountId: "github-grace",
      createdAt: 1,
      updatedAt: 1,
    });

    const createConnectedVault = async (
      ownerId: typeof userId,
      vaultOrganizationId: typeof organizationId,
      suffix: string,
    ) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId: vaultOrganizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: ownerId,
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
        organizationId: vaultOrganizationId,
        githubProviderConnectionId:
          vaultOrganizationId === organizationId
            ? githubProviderConnectionId
            : otherGithubProviderConnectionId,
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
      cloudflareProviderConnectionId,
      convexProviderConnectionId,
      githubProviderConnectionId,
      otherUserId,
      organizationId,
      primaryVaultId: await createConnectedVault(userId, organizationId, "ada"),
      secondaryVaultId: await createConnectedVault(userId, organizationId, "ada-second"),
      foreignVaultId: await createConnectedVault(otherUserId, otherOrganizationId, "grace"),
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
      providerConnectionId: ids.convexProviderConnectionId,
      projects: [
        {
          teamId: "team-1",
          projectId: "project-1",
          codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
          origin: "selected_existing",
        },
        {
          teamId: "team-1",
          projectId: "project-2",
          codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
          origin: "provisioned",
        },
      ],
    });
    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        providerConnectionId: ids.convexProviderConnectionId,
        projects: [
          {
            teamId: "team-1",
            projectId: "project-1",
            codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
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
    expect(projects.map((project) => project.organizationId)).toEqual([
      ids.organizationId,
      ids.organizationId,
    ]);
  });

  it("enforces global project identity before writing any batch member", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      providerConnectionId: ids.convexProviderConnectionId,
      projects: [
        {
          teamId: "team-1",
          projectId: "shared-project",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: ids.secondaryVaultId,
        userId: ids.userId,
        providerConnectionId: ids.convexProviderConnectionId,
        projects: [
          {
            teamId: "team-1",
            projectId: "new-project",
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            origin: "selected_existing",
          },
          {
            teamId: "team-2",
            projectId: "shared-project",
            codeLocation: { kind: "config", convexConfigPath: "apps/admin/convex.json" },
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
      providerConnectionId: ids.convexProviderConnectionId,
      projects: [
        {
          teamId: "team-1",
          projectId: "project-1",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
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
    await t.mutation(internal.vault.convexMutations.reconcileProjectCodeLocation, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      convexProjectId,
      projectId: "project-1",
      expectedCodeLocation: { kind: "config", convexConfigPath: "convex.json" },
      nextCodeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
    });

    await expect(
      t.mutation(internal.vault.convexMutations.detachProject, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        convexProjectId,
        teamId: "team-1",
        projectId: "project-1",
        codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
      }),
    ).rejects.toThrow("Convex project attachment changed before removal.");
    await expect(
      t.mutation(internal.vault.convexMutations.detachProject, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        convexProjectId,
        teamId: "team-2",
        projectId: "project-1",
        codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
      }),
    ).resolves.toBeNull();
  });

  it("derives managed placement from the active provisioning plan", async () => {
    const { ids, t } = await createGraphFixture();
    const { planId, runId, writeLockId } = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: ids.userId,
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
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: { cloudflare: 9 },
        updatedAt: 10,
      });
      const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId: ids.primaryVaultId,
        githubProviderConnectionId: ids.githubProviderConnectionId,
        convexProviderConnectionId: ids.convexProviderConnectionId,
        cloudflareProviderConnectionId: ids.cloudflareProviderConnectionId,
        convexConfigPath: "apps/web/convex.json",
        convex: {
          state: "planned",
          projectName: "managed-project",
          teamId: "team-1",
        },
        cloudflare: {
          state: "planned",
          accountId: "account-1",
          workerName: "managed-worker",
          rootDirectory: "apps/web",
        },
        createdAt: 10,
        updatedAt: 10,
      });
      return { planId, runId, writeLockId };
    });

    await expect(
      t.query(internal.vault.convexMutations.readManagedProjectCreateCheckpoint, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
        projectName: "managed-project",
        teamId: "team-2",
      }),
    ).rejects.toThrow("Connected Convex team does not match the provisioning plan.");
    await expect(
      t.mutation(internal.vault.convexMutations.beginManagedProjectCreate, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        runId,
        projectName: "managed-project",
        teamId: "team-2",
      }),
    ).rejects.toThrow("Connected Convex team does not match the provisioning plan.");
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
        writeLock: await ctx.db.get(writeLockId),
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
      writeLock: {
        lastWriteAt: {
          convex: expect.any(Number),
          cloudflare: 9,
        },
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

  it("records a manual project checkpoint only for its current owner", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      actionId: "manual-project",
      action: "create_convex_project",
    });

    await expect(
      t.mutation(internal.vault.convexMutations.recordManualProjectCreated, {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        actionId: "old-project-action",
        providerConnectionId: ids.convexProviderConnectionId,
        teamId: "team-1",
        projectId: "project-1",
        codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      }),
    ).rejects.toThrow("Manual provider action no longer owns the vault write.");
    const convexProjectId = await t.mutation(
      internal.vault.convexMutations.recordManualProjectCreated,
      {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        actionId: "manual-project",
        providerConnectionId: ids.convexProviderConnectionId,
        teamId: "team-1",
        projectId: "project-1",
        codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      },
    );

    await expect(
      t.run(async (ctx) => ({
        project: await ctx.db.get(convexProjectId),
        write: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.primaryVaultId))
          .unique(),
      })),
    ).resolves.toMatchObject({
      project: {
        projectId: "project-1",
        convexConfigPath: "convex.json",
        origin: "provisioned",
      },
      write: {
        owner: {
          actionId: "manual-project",
          action: "create_convex_project",
        },
        state: "active",
      },
    });
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
