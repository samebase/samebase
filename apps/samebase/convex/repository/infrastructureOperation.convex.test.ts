import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import { readRepositoryDeletionEligibility } from "./deletion/eligibility";
import { readRepositoryInfrastructureState } from "./infrastructureOperation";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createConnectedRepository() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "manual-provider-write-installation",
      githubOwnerId: "manual-provider-write-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
        lastUsedBuildTokenUuid: "previous-build-token",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/manual-provider-write",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "manual-provider-write",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    return { organizationId, runId, userId, repositoryId };
  });

  return { ids, t };
}

async function readInfrastructure(t: ConvexTest, repositoryId: Id<"repositories">) {
  return await t.run(async (ctx) => {
    const repository = await ctx.db.get(repositoryId);
    if (!repository || repository.state !== "connected") {
      throw new Error("Connected repository fixture is missing.");
    }
    return await readRepositoryInfrastructureState(ctx, repository);
  });
}

describe("repository infrastructure operation reads", () => {
  it("keeps source-only repository sync out of provider operations", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        state: "running",
        currentStep: "sync_tree",
        updatedAt: 30,
        completedAt: undefined,
      });
    });

    const infrastructure = await readInfrastructure(t, ids.repositoryId);

    expect(infrastructure.operation).toEqual({ kind: "none" });
  });

  it("reports the active run that holds the lock, as a New App or Retry run does", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, { state: "running", completedAt: undefined });
      await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId: ids.repositoryId,
        owner: { kind: "managed_run", runId: ids.runId },
        state: "active",
        lastWriteAt: {},
        updatedAt: 50,
      });
    });

    await expect(readInfrastructure(t, ids.repositoryId)).resolves.toMatchObject({
      operation: {
        kind: "managed_run",
        runId: ids.runId,
        run: { _id: ids.runId, state: "running" },
        updatedAt: 50,
      },
    });
    await expect(
      t.run(async (ctx) => {
        const repository = await ctx.db.get(ids.repositoryId);
        if (!repository) {
          throw new Error("Repository fixture is missing.");
        }
        return await readRepositoryDeletionEligibility(ctx, repository);
      }),
    ).resolves.toEqual({ state: "blocked", reason: "Repository setup is still running." });
  });

  it.each(["succeeded", "failed", "active"] as const)(
    "treats an old %s manual write as finished",
    async (state) => {
      const { ids, t } = await createConnectedRepository();
      await t.run(async (ctx) => {
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId: ids.repositoryId,
          owner: {
            kind: "manual_provider_write",
            userId: ids.userId,
            actionId: "old-action",
            action: "create_convex_project",
            expiresAt: 40,
          },
          state,
          lastWriteAt: { convex: 30 },
          updatedAt: 30,
        });
      });

      await expect(readInfrastructure(t, ids.repositoryId)).resolves.toMatchObject({
        operation: { kind: "none" },
        providerWrite: { owner: { kind: "manual_provider_write" }, state },
      });
      await expect(
        t.run(async (ctx) => {
          const repository = await ctx.db.get(ids.repositoryId);
          if (!repository) {
            throw new Error("Repository fixture is missing.");
          }
          return await readRepositoryDeletionEligibility(ctx, repository);
        }),
      ).resolves.toEqual({ state: "eligible" });
      await expect(
        t.query(internal.repository.listForUser, { userId: ids.userId }),
      ).resolves.toEqual([
        expect.objectContaining({
          providerWrite: { status: "idle", lastWriteAt: { convex: 30 } },
          deletion: { state: "not_deleting", deleteAction: { state: "available" } },
        }),
      ]);
    },
  );
});
