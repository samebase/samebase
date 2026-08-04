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
    await ctx.db.patch(organizationId, {
      selectedCloudflareProviderConnectionId: cloudflareProviderConnectionId,
      selectedConvexProviderConnectionId: convexProviderConnectionId,
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

describe("vault Cloudflare Worker attachment mutations", () => {
  it("atomically attaches multiple Workers and upgrades confirmed ownership", async () => {
    const { ids, t } = await createGraphFixture();
    const workerIds = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      providerConnectionId: ids.cloudflareProviderConnectionId,
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
        providerConnectionId: ids.cloudflareProviderConnectionId,
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
    expect(workers.map((worker) => worker.organizationId)).toEqual([
      ids.organizationId,
      ids.organizationId,
    ]);
  });

  it("rejects provider identity conflicts before writing any batch member", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      providerConnectionId: ids.cloudflareProviderConnectionId,
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
        providerConnectionId: ids.cloudflareProviderConnectionId,
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
      providerConnectionId: ids.cloudflareProviderConnectionId,
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
        requestedByUserId: ids.userId,
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
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: { convex: 9 },
        updatedAt: 10,
      });
      const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId: ids.primaryVaultId,
        githubProviderConnectionId: ids.githubProviderConnectionId,
        convexProviderConnectionId: ids.convexProviderConnectionId,
        cloudflareProviderConnectionId: ids.cloudflareProviderConnectionId,
        convexConfigPath: "convex.json",
        convex: {
          state: "planned",
          projectName: "managed-project",
          teamId: "team-1",
        },
        cloudflare: {
          state: "planned",
          accountId: "account-1",
          workerName: "managed-worker",
          rootDirectory: "/",
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
        writeLock: await ctx.db.get(writeLockId),
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
      writeLock: {
        lastWriteAt: {
          convex: 9,
          cloudflare: expect.any(Number),
        },
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

  it("records manual connect and create checkpoints only for their current owners", async () => {
    const { ids, t } = await createGraphFixture();
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      actionId: "connect-worker",
      action: "connect_cloudflare_worker",
    });
    const connectedWorkerId = await t.mutation(
      internal.vault.cloudflareMutations.recordManualConnectedWorker,
      {
        vaultId: ids.primaryVaultId,
        userId: ids.userId,
        actionId: "connect-worker",
        providerConnectionId: ids.cloudflareProviderConnectionId,
        accountId: "account-1",
        workerName: "connected-worker",
        workerTag: "connected-tag",
      },
    );
    await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: ids.primaryVaultId,
      actionId: "connect-worker",
      result: "failed",
    });

    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.secondaryVaultId,
      userId: ids.userId,
      actionId: "create-worker",
      action: "create_cloudflare_worker",
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordManualWorkerCreated, {
        vaultId: ids.secondaryVaultId,
        userId: ids.userId,
        actionId: "old-create-worker",
        providerConnectionId: ids.cloudflareProviderConnectionId,
        accountId: "account-1",
        workerName: "created-worker",
        workerTag: "created-tag",
      }),
    ).rejects.toThrow("Manual provider action no longer owns the vault write.");
    const createdWorkerId = await t.mutation(
      internal.vault.cloudflareMutations.recordManualWorkerCreated,
      {
        vaultId: ids.secondaryVaultId,
        userId: ids.userId,
        actionId: "create-worker",
        providerConnectionId: ids.cloudflareProviderConnectionId,
        accountId: "account-1",
        workerName: "created-worker",
        workerTag: "created-tag",
      },
    );

    await expect(
      t.run(async (ctx) => ({
        connected: await ctx.db.get(connectedWorkerId),
        created: await ctx.db.get(createdWorkerId),
        write: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.secondaryVaultId))
          .unique(),
      })),
    ).resolves.toMatchObject({
      connected: {
        workerName: "connected-worker",
        workerTag: "connected-tag",
        origin: "selected_existing",
      },
      created: {
        workerName: "created-worker",
        workerTag: "created-tag",
        origin: "provisioned",
      },
      write: {
        owner: {
          actionId: "create-worker",
          action: "create_cloudflare_worker",
        },
        state: "active",
      },
    });
  });

  it("reads vault attachment context without inventing a Worker placement", async () => {
    const { ids, t } = await createGraphFixture();
    const [workerId] = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: ids.primaryVaultId,
      userId: ids.userId,
      providerConnectionId: ids.cloudflareProviderConnectionId,
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
      providerConnectionId: ids.convexProviderConnectionId,
      projects: [
        {
          teamId: "team-1",
          projectId: "shared-backend",
          codeLocation: { kind: "config", convexConfigPath: "apps/api/convex.json" },
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
      organizationId: ids.organizationId,
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
