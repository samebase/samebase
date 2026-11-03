import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;
type GitHubOwnerType = "organization" | "user";

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

async function seedConnectedRepositories(
  t: ConvexTest,
  args: {
    count: number;
    organizationId: Id<"organizations">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    prefix?: string;
  },
): Promise<void> {
  await t.run(async (ctx) => {
    for (let index = 0; index < args.count; index += 1) {
      const name = `${args.prefix ?? "seeded"}-${index}`;
      await ctx.db.insert("repositories", {
        organizationId: args.organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: args.runId,
        githubRepositoryDatabaseId: name,
        githubRepositoryName: name,
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
    }
  });
}

async function readConnectionCount(
  t: ConvexTest,
  organizationId: Id<"organizations">,
): Promise<number> {
  return await t.run(async (ctx) => {
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_organization_and_state_and_deletion_state", (query) =>
        query.eq("organizationId", organizationId).eq("state", "connected"),
      )
      .take(200);
    return repositories.length;
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
      await seedConnectedRepositories(t, { ...ids, count: limit - 1 });

      await expect(
        t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
          organizationId: ids.organizationId,
          userId: ids.userId,
          githubRepositoryDatabaseId: "blocked-id",
          githubOwnerLogin: "quota-owner",
          githubRepositoryName: "blocked",
        }),
      ).rejects.toThrow(`Organization connection limit reached (${limit}).`);
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
      await expect(readConnectionCount(t, ids.organizationId)).resolves.toBe(limit);
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
    await seedConnectedRepositories(t, { ...ids, count: 11 });

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

    await expect(readConnectionCount(t, ids.organizationId)).resolves.toBe(12);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("repositories")
          .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
          .take(20),
      ),
    ).resolves.toHaveLength(12);
  });

  it("rechecks both repository transitions after an in-flight provisioning race", async () => {
    const { ids, t } = await createQuotaFixture({ githubOwnerType: "user", plan: "free" });
    await seedConnectedRepositories(t, { ...ids, count: 10 });
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
    await seedConnectedRepositories(t, { ...ids, count: 1, prefix: "late" });

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
});
