import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  managedBillingResourceOperationKey,
  manualBillingResourceOperationKey,
} from "./billingResourceQuotas";
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

async function seedProviderCreatedReservation(
  t: ConvexTest,
  args: {
    operationKey: string;
    providerResource:
      | {
          kind: "cloudflare_worker";
          accountId: string;
          workerName: string;
          workerTag: string;
        }
      | { kind: "convex_project"; teamId: string; projectId: string };
    userId: Id<"users">;
  },
): Promise<Id<"billingResourceReservations">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("billingResourceReservations", {
        userId: args.userId,
        operationKey: args.operationKey,
        resource: { state: "provider_created", ...args.providerResource },
        expiresAt: Date.now() + 60_000,
      }),
  );
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
      cloudflareWorkers: { used: { state: "exact", count: 6 }, limit: 5 },
      convexProjects: { used: { state: "exact", count: 6 }, limit: 5 },
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

  it("reports legacy usage above the bounded exact range as 41+", async () => {
    const { ids, t } = await createQuotaFixture("pro");
    await Promise.all([
      seedProjects(t, { ...ids, count: 45 }),
      seedWorkers(t, { ...ids, count: 45 }),
    ]);

    await expect(
      asUser(t, ids.userId).query(api.billingResourceQuotas.getViewerBillingResourceUsage, {}),
    ).resolves.toEqual({
      cloudflareWorkers: { used: { state: "at_least", count: 41 }, limit: 40 },
      convexProjects: { used: { state: "at_least", count: 41 }, limit: 40 },
    });
  });

  it("serializes concurrent claims for the last available slot", async () => {
    const { ids, t } = await createQuotaFixture();
    await seedProjects(t, { ...ids, count: 4 });

    const claims = await Promise.allSettled([
      t.mutation(internal.billingResourceQuotas.claimBillingResourceReservation, {
        userId: ids.userId,
        kind: "convex_project",
        operationKey: "concurrent-project-a",
      }),
      t.mutation(internal.billingResourceQuotas.claimBillingResourceReservation, {
        userId: ids.userId,
        kind: "convex_project",
        operationKey: "concurrent-project-b",
      }),
    ]);

    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(1);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("billingResourceReservations")
            .withIndex("by_userId_and_kind_and_operationKey", (q) =>
              q.eq("userId", ids.userId).eq("resource.kind", "convex_project"),
            )
            .take(2),
      ),
    ).resolves.toHaveLength(1);
  });

  it("reuses a stable claim key but rechecks capacity after downgrade", async () => {
    const { ids, t } = await createQuotaFixture("pro");
    await seedProjects(t, { ...ids, count: 5 });
    const operationKey = manualBillingResourceOperationKey({
      vaultId: ids.vaultId,
      providerScopeId: "team-1",
      resourceName: "stable-project",
    });
    const first = await t.mutation(internal.billingResourceQuotas.claimBillingResourceReservation, {
      userId: ids.userId,
      kind: "convex_project",
      operationKey,
    });
    await expect(
      t.mutation(internal.billingResourceQuotas.claimBillingResourceReservation, {
        userId: ids.userId,
        kind: "convex_project",
        operationKey,
      }),
    ).resolves.toEqual(first);

    await t.run(
      async (ctx) =>
        await ctx.db.patch(ids.userId, { billingPlan: "free", billingStatus: "inactive" }),
    );
    await expect(
      t.mutation(internal.billingResourceQuotas.claimBillingResourceReservation, {
        userId: ids.userId,
        kind: "convex_project",
        operationKey,
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");
  });

  it("releases provider failures but retains capacity after provider success", async () => {
    const { ids, t } = await createQuotaFixture();
    await seedWorkers(t, { ...ids, count: 4 });
    const operationKey = manualBillingResourceOperationKey({
      vaultId: ids.vaultId,
      providerScopeId: "account-1",
      resourceName: "retry-worker",
    });
    const failedClaim = await t.mutation(
      internal.billingResourceQuotas.claimBillingResourceReservation,
      {
        userId: ids.userId,
        kind: "cloudflare_worker",
        operationKey,
      },
    );
    await t.mutation(internal.billingResourceQuotas.releaseUnusedBillingResourceReservation, {
      reservationId: failedClaim,
      userId: ids.userId,
      kind: "cloudflare_worker",
      operationKey,
    });
    const retryClaim = await t.mutation(
      internal.billingResourceQuotas.claimBillingResourceReservation,
      {
        userId: ids.userId,
        kind: "cloudflare_worker",
        operationKey,
      },
    );
    expect(retryClaim).not.toEqual(failedClaim);

    await t.mutation(internal.billingResourceQuotas.markBillingResourceReservationProviderCreated, {
      reservationId: retryClaim,
      userId: ids.userId,
      operationKey,
      providerResource: {
        kind: "cloudflare_worker",
        accountId: "account-1",
        workerName: "retry-worker",
        workerTag: "retry-worker-tag",
      },
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.recordManualWorkerCreated, {
        billingReservationId: retryClaim,
        ...ids,
        actionId: "missing-provider-checkpoint",
        accountId: "account-1",
        workerName: "retry-worker",
        workerTag: "retry-worker-tag",
      }),
    ).rejects.toThrow("Manual provider action no longer owns the vault write.");
    await t.mutation(internal.billingResourceQuotas.releaseUnusedBillingResourceReservation, {
      reservationId: retryClaim,
      userId: ids.userId,
      kind: "cloudflare_worker",
      operationKey,
    });
    await expect(t.run(async (ctx) => await ctx.db.get(retryClaim))).resolves.toMatchObject({
      operationKey,
      resource: {
        state: "provider_created",
        kind: "cloudflare_worker",
        accountId: "account-1",
        workerName: "retry-worker",
        workerTag: "retry-worker-tag",
      },
    });

    await t.run(async (ctx) => await ctx.db.patch(retryClaim, { expiresAt: 0 }));
    await expect(
      t.mutation(internal.billingResourceQuotas.claimBillingResourceReservation, {
        userId: ids.userId,
        kind: "cloudflare_worker",
        operationKey: "replacement-worker",
      }),
    ).resolves.toBeDefined();
    await expect(t.run(async (ctx) => await ctx.db.get(retryClaim))).resolves.toBeNull();
  });

  it("uses an exact retained Convex slot for ordinary recovery attachment", async () => {
    {
      const { ids, t } = await createQuotaFixture();
      await seedProjects(t, { ...ids, count: 4 });
      const recoveryProject = projectInput(1, "recovery-project");
      const reservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: "retained-convex-recovery",
        providerResource: {
          kind: "convex_project",
          teamId: recoveryProject.teamId,
          projectId: recoveryProject.projectId,
        },
      });

      await expect(
        t.mutation(internal.vault.convexMutations.attachProjects, {
          ...ids,
          projects: [recoveryProject],
        }),
      ).resolves.toHaveLength(1);
      await expect(readAttachmentCounts(t, ids.userId)).resolves.toMatchObject({
        convexProjects: 5,
      });
      await expect(t.run(async (ctx) => await ctx.db.get(reservationId))).resolves.toBeNull();
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedProjects(t, { ...ids, count: 4 });
      const recoveryProject = projectInput(1, "recovery-project");
      const reservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: "retained-other-convex-project",
        providerResource: {
          kind: "convex_project",
          teamId: recoveryProject.teamId,
          projectId: "another-project",
        },
      });

      await expect(
        t.mutation(internal.vault.convexMutations.attachProjects, {
          ...ids,
          projects: [recoveryProject],
        }),
      ).rejects.toThrow("Convex project attachment limit reached (5).");
      await expect(readAttachmentCounts(t, ids.userId)).resolves.toMatchObject({
        convexProjects: 4,
      });
      await expect(t.run(async (ctx) => await ctx.db.get(reservationId))).resolves.not.toBeNull();
    }
  });

  it("uses an exact retained Cloudflare slot for connect recovery", async () => {
    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 4 });
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        ...ids,
        actionId: "recover-worker",
        action: "connect_cloudflare_worker",
      });
      const reservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: "retained-worker-recovery",
        providerResource: {
          kind: "cloudflare_worker",
          accountId: "account-1",
          workerName: "recovery-worker",
          workerTag: "recovery-worker-tag",
        },
      });

      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManualConnectedWorker, {
          ...ids,
          actionId: "recover-worker",
          accountId: "account-1",
          workerName: "recovery-worker",
          workerTag: "recovery-worker-tag",
        }),
      ).resolves.toBeDefined();
      await expect(readAttachmentCounts(t, ids.userId)).resolves.toMatchObject({
        cloudflareWorkers: 5,
      });
      await expect(t.run(async (ctx) => await ctx.db.get(reservationId))).resolves.toBeNull();
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 4 });
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        ...ids,
        actionId: "recover-worker",
        action: "connect_cloudflare_worker",
      });
      const reservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: "retained-other-worker",
        providerResource: {
          kind: "cloudflare_worker",
          accountId: "account-1",
          workerName: "another-worker",
          workerTag: "another-worker-tag",
        },
      });

      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManualConnectedWorker, {
          ...ids,
          actionId: "recover-worker",
          accountId: "account-1",
          workerName: "recovery-worker",
          workerTag: "recovery-worker-tag",
        }),
      ).rejects.toThrow("Cloudflare Worker attachment limit reached (5).");
      await expect(readAttachmentCounts(t, ids.userId)).resolves.toMatchObject({
        cloudflareWorkers: 4,
      });
      await expect(t.run(async (ctx) => await ctx.db.get(reservationId))).resolves.not.toBeNull();
    }
  });

  it("consumes each retained provider slot once in batch attachment", async () => {
    {
      const { ids, t } = await createQuotaFixture();
      await seedProjects(t, { ...ids, count: 3 });
      const projects = [projectInput(1, "batch-recovery-a"), projectInput(2, "batch-recovery-b")];
      const reservationIds = await Promise.all(
        projects.map(
          async (project) =>
            await seedProviderCreatedReservation(t, {
              userId: ids.userId,
              operationKey: `retained-${project.projectId}`,
              providerResource: {
                kind: "convex_project",
                teamId: project.teamId,
                projectId: project.projectId,
              },
            }),
        ),
      );

      await expect(
        t.mutation(internal.vault.convexMutations.attachProjects, {
          ...ids,
          projects,
        }),
      ).resolves.toHaveLength(2);
      await expect(
        t.run(
          async (ctx) => await Promise.all(reservationIds.map(async (id) => await ctx.db.get(id))),
        ),
      ).resolves.toEqual([null, null]);
    }

    {
      const { ids, t } = await createQuotaFixture();
      await seedWorkers(t, { ...ids, count: 3 });
      const workers = [workerInput(1, "batch-recovery-a"), workerInput(2, "batch-recovery-b")];
      const reservationIds = await Promise.all(
        workers.map(
          async (worker) =>
            await seedProviderCreatedReservation(t, {
              userId: ids.userId,
              operationKey: `retained-${worker.workerTag}`,
              providerResource: {
                kind: "cloudflare_worker",
                accountId: worker.accountId,
                workerName: worker.workerName,
                workerTag: worker.workerTag,
              },
            }),
        ),
      );

      await expect(
        t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
          ...ids,
          workers,
        }),
      ).resolves.toHaveLength(2);
      await expect(
        t.run(
          async (ctx) => await Promise.all(reservationIds.map(async (id) => await ctx.db.get(id))),
        ),
      ).resolves.toEqual([null, null]);
    }
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
      const billingReservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: manualBillingResourceOperationKey({
          vaultId: ids.vaultId,
          providerScopeId: "team-1",
          resourceName: "manual-project",
        }),
        providerResource: {
          kind: "convex_project",
          teamId: "team-1",
          projectId: "manual-project",
        },
      });
      await expect(
        t.mutation(internal.vault.convexMutations.recordManualProjectCreated, {
          ...ids,
          billingReservationId,
          actionId: "manual-project",
          projectName: "manual-project",
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
      const billingReservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: managedBillingResourceOperationKey(runId),
        providerResource: {
          kind: "convex_project",
          teamId: "team-1",
          projectId: "managed-project",
        },
      });
      await expect(
        t.mutation(internal.vault.convexMutations.recordManagedProjectCreated, {
          ...ids,
          billingReservationId,
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
          billingReservationId: null,
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
      const billingReservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: manualBillingResourceOperationKey({
          vaultId: ids.vaultId,
          providerScopeId: "account-1",
          resourceName: "created-worker",
        }),
        providerResource: {
          kind: "cloudflare_worker",
          accountId: "account-1",
          workerName: "created-worker",
          workerTag: "created-worker-tag",
        },
      });
      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManualWorkerCreated, {
          ...ids,
          billingReservationId,
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
      const billingReservationId = await seedProviderCreatedReservation(t, {
        userId: ids.userId,
        operationKey: managedBillingResourceOperationKey(runId),
        providerResource: {
          kind: "cloudflare_worker",
          accountId: "account-1",
          workerName: "managed-worker",
          workerTag: "managed-worker-tag",
        },
      });
      await expect(
        t.mutation(internal.vault.cloudflareMutations.recordManagedWorkerCreated, {
          ...ids,
          billingReservationId,
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
          billingReservationId: null,
          runId,
          accountId: "account-1",
          workerName: "managed-worker",
          workerTag: "managed-worker-tag",
        }),
      ).resolves.toEqual(existingId);
    }
  });
});
