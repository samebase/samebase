import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

function projectInput(index: number, prefix = "project") {
  return {
    teamId: "team-1",
    projectId: `${prefix}-${index}`,
    codeLocation: { kind: "config", convexConfigPath: `apps/${prefix}-${index}/convex.json` },
    origin: "selected_existing",
  } as const;
}

function workerInput(index: number, prefix = "worker") {
  return {
    accountId: "account-1",
    workerName: `${prefix}-${index}`,
    workerTag: `${prefix}-tag-${index}`,
    origin: "selected_existing",
  } as const;
}

async function createQuotaFixture(entitlement: "free" | "pro" = "free") {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId =
      entitlement === "pro"
        ? await ctx.db.insert("users", {
            email: "member@example.com",
            isApproved: true,
            billingPlan: "pro",
            billingStatus: "active",
          })
        : await ctx.db.insert("users", {
            email: "member@example.com",
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
      repositoryFullName: "member/repository",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "github-repository",
      owner: "member",
      name: "repository",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 3,
    });
    return { userId, vaultId };
  });
  return { ids, t };
}

async function seedProjects(
  t: ConvexTest,
  args: {
    count: number;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    prefix?: string;
  },
): Promise<Array<Id<"vaultConvexProjects">>> {
  return await t.run(async (ctx) => {
    const projectIds: Array<Id<"vaultConvexProjects">> = [];
    for (let index = 0; index < args.count; index += 1) {
      const project = projectInput(index, args.prefix);
      projectIds.push(
        await ctx.db.insert("vaultConvexProjects", {
          vaultId: args.vaultId,
          userId: args.userId,
          teamId: project.teamId,
          projectId: project.projectId,
          convexConfigPath: project.codeLocation.convexConfigPath,
          origin: project.origin,
        }),
      );
    }
    return projectIds;
  });
}

async function seedWorkers(
  t: ConvexTest,
  args: {
    count: number;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    prefix?: string;
  },
): Promise<Array<Id<"vaultCloudflareWorkers">>> {
  return await t.run(async (ctx) => {
    const workerIds: Array<Id<"vaultCloudflareWorkers">> = [];
    for (let index = 0; index < args.count; index += 1) {
      const worker = workerInput(index, args.prefix);
      workerIds.push(
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId: args.vaultId,
          userId: args.userId,
          accountId: worker.accountId,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          origin: worker.origin,
        }),
      );
    }
    return workerIds;
  });
}

async function readAttachmentCounts(
  t: ConvexTest,
  userId: Id<"users">,
): Promise<{ cloudflareWorkers: number; convexProjects: number }> {
  return await t.run(async (ctx) => {
    const [cloudflareWorkers, convexProjects] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(50),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(50),
    ]);
    return {
      cloudflareWorkers: cloudflareWorkers.length,
      convexProjects: convexProjects.length,
    };
  });
}

function asUser(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

async function createManagedProjectCheckpoint(
  t: ConvexTest,
  args: {
    projectId?: string;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
) {
  return await t.run(async (ctx) => {
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: "member/repository",
      trigger: "retry",
      state: "running",
      currentStep: "attach_convex",
      createdAt: 10,
      updatedAt: 10,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId: args.vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 10,
    });
    const planId = args.projectId
      ? await ctx.db.insert("workflow_vaultProvisioning_plans", {
          vaultId: args.vaultId,
          userId: args.userId,
          convexConfigPath: "apps/managed/convex.json",
          convex: {
            state: "created",
            projectName: "managed-project",
            teamId: "team-1",
            projectId: args.projectId,
          },
          cloudflare: {
            state: "planned",
            accountId: "account-1",
            workerName: "managed-worker",
            rootDirectory: "apps/managed",
          },
          createdAt: 10,
          updatedAt: 10,
        })
      : await ctx.db.insert("workflow_vaultProvisioning_plans", {
          vaultId: args.vaultId,
          userId: args.userId,
          convexConfigPath: "apps/managed/convex.json",
          convex: {
            state: "creating",
            projectName: "managed-project",
            teamId: "team-1",
          },
          cloudflare: {
            state: "planned",
            accountId: "account-1",
            workerName: "managed-worker",
            rootDirectory: "apps/managed",
          },
          createdAt: 10,
          updatedAt: 10,
        });
    return { planId, runId };
  });
}

async function createManagedWorkerCheckpoint(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    workerTag?: string;
  },
) {
  return await t.run(async (ctx) => {
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: "member/repository",
      trigger: "retry",
      state: "running",
      currentStep: "attach_worker",
      createdAt: 10,
      updatedAt: 10,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId: args.vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 10,
    });
    const planId = args.workerTag
      ? await ctx.db.insert("workflow_vaultProvisioning_plans", {
          vaultId: args.vaultId,
          userId: args.userId,
          convexConfigPath: "apps/managed/convex.json",
          convex: {
            state: "planned",
            projectName: "managed-project",
            teamId: "team-1",
          },
          cloudflare: {
            state: "created",
            accountId: "account-1",
            workerName: "managed-worker",
            workerTag: args.workerTag,
            rootDirectory: "apps/managed",
          },
          createdAt: 10,
          updatedAt: 10,
        })
      : await ctx.db.insert("workflow_vaultProvisioning_plans", {
          vaultId: args.vaultId,
          userId: args.userId,
          convexConfigPath: "apps/managed/convex.json",
          convex: {
            state: "planned",
            projectName: "managed-project",
            teamId: "team-1",
          },
          cloudflare: {
            state: "creating",
            accountId: "account-1",
            workerName: "managed-worker",
            rootDirectory: "apps/managed",
          },
          createdAt: 10,
          updatedAt: 10,
        });
    return { planId, runId };
  });
}

describe("billing resource quotas", () => {
  it("permits resource 5 and blocks resource 6 for a free account", async () => {
    const { ids, t } = await createQuotaFixture();
    await Promise.all([
      seedProjects(t, { ...ids, count: 4 }),
      seedWorkers(t, { ...ids, count: 4 }),
    ]);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(4)],
      }),
    ).resolves.toHaveLength(1);
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(4)],
      }),
    ).resolves.toHaveLength(1);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(5)],
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(5)],
      }),
    ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");
    await expect(readAttachmentCounts(t, ids.userId)).resolves.toEqual({
      cloudflareWorkers: 5,
      convexProjects: 5,
    });
  });

  it("permits resource 40 and blocks resource 41 for an entitled Pro account", async () => {
    const { ids, t } = await createQuotaFixture("pro");
    await Promise.all([
      seedProjects(t, { ...ids, count: 39 }),
      seedWorkers(t, { ...ids, count: 39 }),
    ]);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(39)],
      }),
    ).resolves.toHaveLength(1);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.userId, { billingStatus: "past_due" });
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(39)],
      }),
    ).resolves.toHaveLength(1);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(40)],
      }),
    ).rejects.toThrow("Convex project attachment limit reached (40).");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(40)],
      }),
    ).rejects.toThrow("Cloudflare Worker attachment limit reached (40).");
    await expect(readAttachmentCounts(t, ids.userId)).resolves.toEqual({
      cloudflareWorkers: 40,
      convexProjects: 40,
    });
  });

  it("rejects over-limit batches without retaining an earlier insertion", async () => {
    const { ids, t } = await createQuotaFixture();
    await Promise.all([
      seedProjects(t, { ...ids, count: 4 }),
      seedWorkers(t, { ...ids, count: 4 }),
    ]);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(4), projectInput(5)],
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(4), workerInput(5)],
      }),
    ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");
    await expect(readAttachmentCounts(t, ids.userId)).resolves.toEqual({
      cloudflareWorkers: 4,
      convexProjects: 4,
    });
  });

  it("keeps downgraded attachments usable until a new final count fits", async () => {
    const { ids, t } = await createQuotaFixture("pro");
    const [projectIds, workerIds] = await Promise.all([
      seedProjects(t, { ...ids, count: 6 }),
      seedWorkers(t, { ...ids, count: 6 }),
    ]);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.userId, {
        billingPlan: "free",
        billingStatus: "inactive",
      });
    });

    await expect(
      asUser(t, ids.userId).query(api.billingResourceQuotas.getViewerBillingResourceUsage, {}),
    ).resolves.toEqual({
      cloudflareWorkers: { used: 6, limit: 5 },
      convexProjects: { used: 6, limit: 5 },
    });
    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(0)],
      }),
    ).resolves.toEqual([projectIds[0]]);
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(0)],
      }),
    ).resolves.toEqual([workerIds[0]]);

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(6)],
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(6)],
      }),
    ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");

    const [firstProjectId, secondProjectId] = projectIds;
    const [firstWorkerId, secondWorkerId] = workerIds;
    if (!firstProjectId || !secondProjectId || !firstWorkerId || !secondWorkerId) {
      throw new Error("Expected seeded resource attachments.");
    }
    await t.mutation(internal.vault.convexMutations.detachProject, {
      ...ids,
      convexProjectId: firstProjectId,
      teamId: "team-1",
      projectId: projectInput(0).projectId,
      codeLocation: projectInput(0).codeLocation,
    });
    await t.mutation(internal.vault.cloudflareMutations.detachWorker, {
      ...ids,
      workerId: firstWorkerId,
      accountId: workerInput(0).accountId,
      workerName: workerInput(0).workerName,
      workerTag: workerInput(0).workerTag,
    });
    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(6)],
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(6)],
      }),
    ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");

    await t.mutation(internal.vault.convexMutations.detachProject, {
      ...ids,
      convexProjectId: secondProjectId,
      teamId: "team-1",
      projectId: projectInput(1).projectId,
      codeLocation: projectInput(1).codeLocation,
    });
    await t.mutation(internal.vault.cloudflareMutations.detachWorker, {
      ...ids,
      workerId: secondWorkerId,
      accountId: workerInput(1).accountId,
      workerName: workerInput(1).workerName,
      workerTag: workerInput(1).workerTag,
    });
    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        ...ids,
        projects: [projectInput(6)],
      }),
    ).resolves.toHaveLength(1);
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        ...ids,
        workers: [workerInput(6)],
      }),
    ).resolves.toHaveLength(1);
    await expect(readAttachmentCounts(t, ids.userId)).resolves.toEqual({
      cloudflareWorkers: 5,
      convexProjects: 5,
    });
  });

  it("enforces manual and managed Convex project attachment paths", async () => {
    {
      const { ids, t } = await createQuotaFixture();
      await seedProjects(t, { ...ids, count: 5 });
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        ...ids,
        actionId: "manual-project",
        action: "create_convex_project",
      });
      await expect(
        t.mutation(internal.vault.convexMutations.recordManualProjectCreated, {
          ...ids,
          actionId: "manual-project",
          teamId: "team-1",
          projectId: "manual-project",
          codeLocation: { kind: "config", convexConfigPath: "apps/manual/convex.json" },
        }),
      ).rejects.toThrow("Convex project attachment limit reached (5).");
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedProjects(t, { ...ids, count: 5 });
      const { planId, runId } = await createManagedProjectCheckpoint(t, ids);
      await expect(
        t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
          ...ids,
          runId,
          convexConfigPath: "apps/managed/convex.json",
          projectName: "managed-project",
          teamId: "team-1",
          projectId: "managed-project",
        }),
      ).rejects.toThrow("Convex project attachment limit reached (5).");
      await expect(t.run(async (ctx) => ctx.db.get(planId))).resolves.toMatchObject({
        convex: { state: "creating" },
      });
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedProjects(t, { ...ids, count: 4 });
      const existingId = await t.run(async (ctx) =>
        ctx.db.insert("vaultConvexProjects", {
          ...ids,
          teamId: "team-1",
          projectId: "managed-project",
          convexConfigPath: "apps/managed/convex.json",
          origin: "selected_existing",
        }),
      );
      const { runId } = await createManagedProjectCheckpoint(t, {
        ...ids,
        projectId: "managed-project",
      });
      await expect(
        t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
          ...ids,
          runId,
          convexConfigPath: "apps/managed/convex.json",
          projectName: "managed-project",
          teamId: "team-1",
          projectId: "managed-project",
        }),
      ).resolves.toEqual(existingId);
    }
  });

  it("enforces all manual and managed Cloudflare Worker attachment paths", async () => {
    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 5 });
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        ...ids,
        actionId: "connect-worker",
        action: "connect_cloudflare_worker",
      });
      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManualConnectedWorker, {
          ...ids,
          actionId: "connect-worker",
          accountId: "account-1",
          workerName: "connected-worker",
          workerTag: "connected-worker-tag",
        }),
      ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 5 });
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        ...ids,
        actionId: "create-worker",
        action: "create_cloudflare_worker",
      });
      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManualWorkerCreated, {
          ...ids,
          actionId: "create-worker",
          accountId: "account-1",
          workerName: "created-worker",
          workerTag: "created-worker-tag",
        }),
      ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 5 });
      const { planId, runId } = await createManagedWorkerCheckpoint(t, ids);
      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
          ...ids,
          runId,
          accountId: "account-1",
          workerName: "managed-worker",
          workerTag: "managed-worker-tag",
        }),
      ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");
      await expect(t.run(async (ctx) => ctx.db.get(planId))).resolves.toMatchObject({
        cloudflare: { state: "creating" },
      });
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 4 });
      const existingId = await t.run(async (ctx) =>
        ctx.db.insert("vaultCloudflareWorkers", {
          ...ids,
          accountId: "account-1",
          workerName: "managed-worker",
          workerTag: "managed-worker-tag",
          origin: "selected_existing",
        }),
      );
      const { runId } = await createManagedWorkerCheckpoint(t, {
        ...ids,
        workerTag: "managed-worker-tag",
      });
      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
          ...ids,
          runId,
          accountId: "account-1",
          workerName: "managed-worker",
          workerTag: "managed-worker-tag",
        }),
      ).resolves.toEqual(existingId);
    }
  });
});
