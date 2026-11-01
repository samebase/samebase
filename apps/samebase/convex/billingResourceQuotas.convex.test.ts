import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;
type GitHubOwnerType = "organization" | "user";

function projectInput(index: number, prefix = "project") {
  return {
    teamId: "convex-team",
    projectId: `${prefix}-${index}`,
    codeLocation: { kind: "config", convexConfigPath: `apps/${prefix}-${index}/convex.json` },
    origin: "selected_existing",
  } as const;
}

function workerInput(index: number, prefix = "worker") {
  return {
    accountId: "cloudflare-account",
    workerName: `${prefix}-${index}`,
    workerTag: `${prefix}-tag-${index}`,
    rootDirectory: `apps/${prefix}-${index}`,
    origin: "selected_existing",
  } as const;
}

async function createQuotaFixture(args: {
  githubOwnerType: GitHubOwnerType;
  plan: "free" | "pro";
}) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "owner@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "github-owner",
      githubOwnerType: args.githubOwnerType,
      githubOwnerLogin: "quota-owner",
      githubOwnerLoginNormalized: "quota-owner",
      githubInstallationId: "github-installation",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: args.plan,
      status: args.plan === "pro" ? "active" : "inactive",
      ...(args.plan === "pro"
        ? {
            provider: "polar" as const,
            polarExternalCustomerId: `quota-customer-${organizationId}`,
            polarBillingUserId: userId,
            polarSeatQuantity: 2,
          }
        : {}),
    });
    const repositoryId = await ctx.db.insert("repositories", {
      createdAt: 1,
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "quota-owner/host",
      trigger: "connect_existing_repository",
      state: "queued",
      currentStep: "connect_github_repository",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(repositoryId, {
      createdAt: 1,
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "host-repository",
      githubRepositoryName: "host",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 2,
    });
    return { organizationId, runId, userId, repositoryId };
  });
  return { ids, t };
}

async function seedProjects(
  t: ConvexTest,
  args: {
    count: number;
    organizationId: Id<"organizations">;
    repositoryId: Id<"repositories">;
    prefix?: string;
  },
): Promise<Array<Id<"repositoryConvexProjects">>> {
  return await t.run(async (ctx) => {
    const ids: Array<Id<"repositoryConvexProjects">> = [];
    for (let index = 0; index < args.count; index += 1) {
      const project = projectInput(index, args.prefix);
      ids.push(
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId: args.repositoryId,
          organizationId: args.organizationId,
          teamId: project.teamId,
          projectId: project.projectId,
          convexConfigPath: project.codeLocation.convexConfigPath,
          origin: project.origin,
        }),
      );
    }
    return ids;
  });
}

async function readConnectionCounts(
  t: ConvexTest,
  organizationId: Id<"organizations">,
): Promise<{
  repositories: number;
  cloudflareWorkers: number;
  convexProjects: number;
  total: number;
}> {
  return await t.run(async (ctx) => {
    const [repositories, cloudflareWorkers, convexProjects] = await Promise.all([
      ctx.db
        .query("repositories")
        .withIndex("by_organization_and_state_and_deletion_state", (query) =>
          query.eq("organizationId", organizationId).eq("state", "connected"),
        )
        .take(200),
      ctx.db
        .query("repositoryCloudflareWorkers")
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
        .take(200),
      ctx.db
        .query("repositoryConvexProjects")
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
        .take(200),
    ]);
    return {
      repositories: repositories.length,
      cloudflareWorkers: cloudflareWorkers.length,
      convexProjects: convexProjects.length,
      total: repositories.length + cloudflareWorkers.length + convexProjects.length,
    };
  });
}

describe("pooled organization connection quotas", () => {
  it.each([
    ["personal Free", "user", "free", 12],
    ["GitHub organization Free", "organization", "free", 6],
    ["personal Pro", "user", "pro", 120],
    ["GitHub organization Pro", "organization", "pro", 120],
  ] as const)(
    "enforces the %s pooled boundary and keeps existing connections idempotent",
    async (_label, githubOwnerType, plan, limit) => {
      const { ids, t } = await createQuotaFixture({ githubOwnerType, plan });
      const projectIds = await seedProjects(t, { ...ids, count: limit - 2 });
      const worker = workerInput(0);

      const [workerId] = await t.mutation(internal.repository.cloudflareMutations.attachWorkers, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        workers: [worker],
      });
      expect(workerId).toBeDefined();
      await expect(
        t.mutation(internal.repository.convexMutations.attachProjects, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          projects: [projectInput(limit, "blocked")],
        }),
      ).rejects.toThrow(`Organization connection limit reached (${limit}).`);

      await expect(
        t.mutation(internal.repository.cloudflareMutations.attachWorkers, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          workers: [worker],
        }),
      ).resolves.toEqual([workerId]);
      await expect(
        t.mutation(internal.repository.convexMutations.attachProjects, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          projects: [projectInput(0)],
        }),
      ).resolves.toEqual([projectIds[0]]);
      await expect(
        t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
          repositoryId: ids.repositoryId,
          runId: ids.runId,
          userId: ids.userId,
          githubRepositoryDatabaseId: "host-repository",
          githubOwnerLogin: "quota-owner",
          githubRepositoryName: "host",
          defaultBranch: "main",
          visibility: "private",
        }),
      ).resolves.toBeNull();
      await expect(readConnectionCounts(t, ids.organizationId)).resolves.toMatchObject({
        total: limit,
      });
      const asUser = t.withIdentity({
        subject: ids.userId,
        tokenIdentifier: `test:${ids.userId}`,
      });
      await expect(
        asUser.query(api.billingResourceQuotas.getViewerBillingResourceUsage, {
          organizationId: ids.organizationId,
        }),
      ).resolves.toEqual({
        connections: {
          used: { state: "exact", count: limit },
          limit,
        },
      });
    },
  );

  it("blocks both repository initialization paths before they create local provisioning state", async () => {
    const { ids, t } = await createQuotaFixture({ githubOwnerType: "user", plan: "free" });
    await seedProjects(t, { ...ids, count: 11 });

    await expect(
      t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
        organizationId: ids.organizationId,
        userId: ids.userId,
        githubRepositoryDatabaseId: "existing-blocked-id",
        githubOwnerLogin: "quota-owner",
        githubRepositoryName: "existing-blocked",
      }),
    ).rejects.toThrow("Organization connection limit reached (12).");
    await expect(
      t.mutation(internal.repository.records.createInitializingSamebaseManagedRepositoryForUser, {
        organizationId: ids.organizationId,
        userId: ids.userId,
        githubOwnerLogin: "quota-owner",
        githubRepositoryName: "managed-blocked",
        visibility: "private",
        description: null,
        convexTeamId: "convex-team",
      }),
    ).rejects.toThrow("Organization connection limit reached (12).");

    await expect(readConnectionCounts(t, ids.organizationId)).resolves.toMatchObject({
      repositories: 1,
      total: 12,
    });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("repositories")
          .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
          .take(20),
      ),
    ).resolves.toHaveLength(1);
  });

  it("rechecks both repository transitions after an in-flight provisioning race", async () => {
    const { ids, t } = await createQuotaFixture({ githubOwnerType: "user", plan: "free" });
    await seedProjects(t, { ...ids, count: 10 });
    const existing = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId: ids.organizationId,
        userId: ids.userId,
        githubRepositoryDatabaseId: "existing-race-id",
        githubOwnerLogin: "quota-owner",
        githubRepositoryName: "existing-race",
      },
    );
    const managed = await t.mutation(
      internal.repository.records.createInitializingSamebaseManagedRepositoryForUser,
      {
        organizationId: ids.organizationId,
        userId: ids.userId,
        githubOwnerLogin: "quota-owner",
        githubRepositoryName: "managed-race",
        visibility: "private",
        description: null,
        convexTeamId: "convex-team",
      },
    );
    await t.mutation(internal.repository.cloudflareMutations.attachWorkers, {
      repositoryId: ids.repositoryId,
      userId: ids.userId,
      workers: [workerInput(0, "race")],
    });

    await expect(
      t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
        ...existing,
        userId: ids.userId,
        githubRepositoryDatabaseId: "existing-race-id",
        githubOwnerLogin: "quota-owner",
        githubRepositoryName: "existing-race",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Organization connection limit reached (12).");
    await expect(
      t.mutation(internal.repository.records.connectSamebaseManagedRepositoryGitHub, {
        ...managed,
        userId: ids.userId,
        githubRepositoryDatabaseId: "managed-race-repository",
        githubOwnerLogin: "quota-owner",
        githubRepositoryName: "managed-race",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Organization connection limit reached (12).");

    const states = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(existing.repositoryId), ctx.db.get(managed.repositoryId)]),
    );
    expect(states).toEqual([
      expect.objectContaining({ state: "provisioning" }),
      expect.objectContaining({ state: "provisioning" }),
    ]);
  });

  it("serializes a cross-provider last-slot race and rolls back an oversized batch", async () => {
    {
      const { ids, t } = await createQuotaFixture({
        githubOwnerType: "organization",
        plan: "free",
      });
      await seedProjects(t, { ...ids, count: 4 });

      const writes = await Promise.allSettled([
        t.mutation(internal.repository.cloudflareMutations.attachWorkers, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          workers: [workerInput(0, "concurrent")],
        }),
        t.mutation(internal.repository.convexMutations.attachProjects, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          projects: [projectInput(0, "concurrent")],
        }),
      ]);

      expect(writes.filter((write) => write.status === "fulfilled")).toHaveLength(1);
      expect(writes.filter((write) => write.status === "rejected")).toHaveLength(1);
      await expect(readConnectionCounts(t, ids.organizationId)).resolves.toMatchObject({
        total: 6,
      });
    }

    {
      const { ids, t } = await createQuotaFixture({
        githubOwnerType: "organization",
        plan: "free",
      });
      await seedProjects(t, { ...ids, count: 4 });

      await expect(
        t.mutation(internal.repository.cloudflareMutations.attachWorkers, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          workers: [workerInput(0, "batch"), workerInput(1, "batch")],
        }),
      ).rejects.toThrow("Organization connection limit reached (6).");
      await expect(readConnectionCounts(t, ids.organizationId)).resolves.toEqual({
        repositories: 1,
        cloudflareWorkers: 0,
        convexProjects: 4,
        total: 5,
      });
    }
  });

  it("stops in-flight managed and manual provider writes when member billing is short", async () => {
    {
      const { ids, t } = await createQuotaFixture({ githubOwnerType: "user", plan: "free" });
      const workerId = await t.run(async (ctx) => {
        await ctx.db.patch(ids.runId, {
          trigger: "retry",
          state: "running",
          currentStep: "configure_workers_builds_for_github",
        });
        await ctx.db.insert("workflow_repositoryProvisioning_plans", {
          repositoryId: ids.repositoryId,
          convexConfigPath: "convex.json",
          convex: {
            state: "created",
            projectName: "quota-project",
            deploymentRegion: "aws-us-east-1",
            projectId: "quota-project",
          },
          cloudflare: {
            state: "created",
            workerName: "quota-worker",
            workerTag: "quota-worker-tag",
            rootDirectory: "",
            buildTokenUuid: "build-token",
          },
          createdAt: 2,
          updatedAt: 2,
        });
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId: ids.repositoryId,
          owner: { kind: "managed_run", runId: ids.runId },
          state: "active",
          lastWriteAt: {},
          updatedAt: 2,
        });
        return await ctx.db.insert("repositoryCloudflareWorkers", {
          repositoryId: ids.repositoryId,
          organizationId: ids.organizationId,
          accountId: "cloudflare-account",
          workerName: "quota-worker",
          workerTag: "quota-worker-tag",
          rootDirectory: "/",
          origin: "provisioned",
        });
      });
      await t.run(async (ctx) => {
        const extraUserId = await ctx.db.insert("users", {
          state: "active",
          email: "managed-extra@example.invalid",
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId: ids.organizationId,
          userId: extraUserId,
          role: "member",
        });
      });

      await expect(
        t.query(internal.repository.cloudflareMutations.readManagedWorkerConfigurationContext, {
          runId: ids.runId,
          userId: ids.userId,
          repositoryId: ids.repositoryId,
          workerId,
        }),
      ).rejects.toThrow("This organization needs more paid member seats.");
    }

    {
      const { ids, t } = await createQuotaFixture({ githubOwnerType: "user", plan: "free" });
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.runId, {
          state: "succeeded",
          currentStep: "finish",
          updatedAt: 3,
          completedAt: 3,
        });
      });
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "billing-limited-manual-write",
        action: "create_cloudflare_worker",
      });
      await t.run(async (ctx) => {
        const extraUserId = await ctx.db.insert("users", {
          state: "active",
          email: "manual-extra@example.invalid",
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId: ids.organizationId,
          userId: extraUserId,
          role: "member",
        });
      });

      await expect(
        t.mutation(internal.repository.cloudflareMutations.recordManualWorkerCreated, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          actionId: "billing-limited-manual-write",
          accountId: "cloudflare-account",
          workerName: "blocked-worker",
          workerTag: "blocked-worker-tag",
          rootDirectory: "apps/blocked-worker",
        }),
      ).rejects.toThrow("This organization needs more paid member seats.");
      await expect(readConnectionCounts(t, ids.organizationId)).resolves.toMatchObject({
        cloudflareWorkers: 0,
      });
    }
  });
});
