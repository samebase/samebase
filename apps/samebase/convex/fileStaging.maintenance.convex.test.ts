/// <reference types="vite/client" />

import { describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

async function createConnectedRepositoryFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "nicu@samebase.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "editor-maintenance-installation",
      githubOwnerId: "editor-maintenance-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "ada/editor-maintenance",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      name: "editor-maintenance",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });
    return { userId, vaultId };
  });
  return { t, ids };
}

describe("repository maintenance editor write authority", () => {
  it("keeps a cleanup lease until every scheduled update batch finishes", async () => {
    const { t, ids } = await createConnectedRepositoryFixture();
    const operationId = "clear-staging-operation";
    const operationName = "commit_staging";
    const parentLease = await t.mutation(
      internal.repositoryMigration.maintenance.claimOperationLease,
      {
        operationId,
        operationName,
      },
    );
    await t.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert("vaultStagedFileUpdates", {
          vaultId: ids.vaultId,
          branch: "main",
          filePath: "README.md",
          version: index + 1,
          clientId: `client-${index}`,
          changes: "[]",
          userId: ids.userId,
          timestamp: index + 1,
        });
      }
    });
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });

    vi.useFakeTimers();
    try {
      await t.mutation(internal.fileStaging.clearAllStagingForOperation, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        branch: "main",
        skipTreeUpdate: true,
        leaseId: parentLease.leaseId,
        operationId,
        operationName,
      });
      await t.mutation(internal.repositoryMigration.maintenance.releaseOperationLease, {
        leaseId: parentLease.leaseId,
        operationId,
        operationName,
      });

      const cleanupLease = await t.run(async (ctx) =>
        (await ctx.db.query("repositoryOperationLeases").collect()).find(
          (lease) => lease.operationName === "staging_cleanup",
        ),
      );
      expect(cleanupLease).toMatchObject({ operationName: "staging_cleanup" });
      await expect(
        t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
          mode: "frozen",
        }),
      ).rejects.toThrow("a repository operation lease is active");
      if (cleanupLease === undefined) {
        throw new Error("Expected a staging cleanup lease.");
      }
      await expect(
        t.mutation(internal.fileStaging.deleteCollaborativeUpdatesBatch, {
          vaultId: ids.vaultId,
          branch: "main",
          cutoffTimestamp: 0,
          leaseId: cleanupLease._id,
          operationId: cleanupLease.operationId,
          operationName: "another_operation",
        }),
      ).rejects.toThrow("Staging cleanup operation authority is required");

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const result = await t.run(async (ctx) => ({
        updates: await ctx.db.query("vaultStagedFileUpdates").collect(),
        leases: await ctx.db.query("repositoryOperationLeases").collect(),
      }));
      expect(result).toEqual({ updates: [], leases: [] });
      await expect(
        t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
          mode: "frozen",
        }),
      ).resolves.toMatchObject({ mode: "frozen" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the exact media upload capability active through draining", async () => {
    const { t, ids } = await createConnectedRepositoryFixture();
    const asUser = t.withIdentity({
      subject: `${ids.userId}|media-upload`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const capability = await asUser.mutation(api.fileStaging.generateUploadUrl, {
      vaultId: ids.vaultId,
    });

    expect(capability.operationName).toBe(`stage_uploaded_media:${ids.vaultId}`);
    const lease = await t.run(async (ctx) => await ctx.db.get(capability.leaseId));
    expect(lease).toMatchObject({
      operationId: capability.operationId,
      operationName: capability.operationName,
    });
    expect((lease?.expiresAt ?? 0) - (lease?.startedAt ?? 0)).toBe(65 * 60 * 1000);

    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    await expect(
      t.mutation(internal.fileStaging.assertMediaUploadCapability, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        leaseId: capability.leaseId,
        operationId: capability.operationId,
        operationName: capability.operationName,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.fileStaging.assertMediaUploadCapability, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        leaseId: capability.leaseId,
        operationId: "another-operation",
        operationName: capability.operationName,
      }),
    ).rejects.toThrow("Repository operation lease is not active");
    await expect(
      t.mutation(internal.fileStaging.assertMediaUploadCapability, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        leaseId: capability.leaseId,
        operationId: capability.operationId,
        operationName: "stage_uploaded_media:another-vault",
      }),
    ).rejects.toThrow("Media upload capability does not match its repository");
    await expect(
      t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
        mode: "frozen",
      }),
    ).rejects.toThrow("a repository operation lease is active");

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["not an image"], { type: "text/plain" })),
    );
    await expect(
      asUser.action(api.fileStagingActions.stageUploadedMedia, {
        repositoryFullName: "ada/editor-maintenance",
        vaultId: ids.vaultId,
        filePath: "notes.txt",
        storageId,
        branch: "main",
        replaceExisting: false,
        leaseId: capability.leaseId,
        operationId: capability.operationId,
        operationName: capability.operationName,
      }),
    ).rejects.toThrow("Only image uploads are supported right now");
    await expect(t.run(async (ctx) => await ctx.db.get(capability.leaseId))).resolves.toBeNull();
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "frozen",
    });
    const frozenLeaseId = await t.run(async (ctx) =>
      ctx.db.insert("repositoryOperationLeases", {
        operationId: capability.operationId,
        operationName: capability.operationName,
        startedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );
    await expect(
      t.mutation(internal.fileStaging.assertMediaUploadCapability, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        leaseId: frozenLeaseId,
        operationId: capability.operationId,
        operationName: capability.operationName,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance");
  });

  it("continues an admitted editor operation during draining and rejects new writes", async () => {
    const { t, ids } = await createConnectedRepositoryFixture();
    const operationId = "editor-operation";
    const operationName = "get_file_for_editing";
    const lease = await t.mutation(internal.repositoryMigration.maintenance.claimOperationLease, {
      operationId,
      operationName,
    });

    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });

    await expect(
      t.mutation(internal.fileStaging.saveToStaging, {
        vaultId: ids.vaultId,
        initialFilePath: "README.md",
        content: "initial",
        initialContent: "initial",
        parentCommitSha: "source-sha",
        branch: "main",
        userId: ids.userId,
        leaseId: lease.leaseId,
        operationId,
        operationName,
      }),
    ).resolves.toMatchObject({ content: "initial", version: 0 });

    await expect(
      t.mutation(internal.collaborative.pushContentUpdate, {
        vaultId: ids.vaultId,
        filePath: "README.md",
        branch: "main",
        expectedVersion: 0,
        newContent: "updated",
        userId: ids.userId,
        leaseId: lease.leaseId,
        operationId,
        operationName,
      }),
    ).resolves.toBeNull();

    await expect(
      t.mutation(internal.gitOperations.saveFileBlob, {
        vaultId: ids.vaultId,
        sha: "cached-sha",
        size: 7,
        text: "updated",
        ext: "md",
        mime: "text/markdown",
        leaseId: lease.leaseId,
        operationId,
        operationName,
      }),
    ).resolves.toBeDefined();

    const refreshClaim = await t.mutation(internal.vault.branches.claimTreeRefresh, {
      vaultId: ids.vaultId,
      leaseId: lease.leaseId,
      operationId,
      operationName,
    });
    expect(refreshClaim).toMatchObject({ claimed: true });
    if (!refreshClaim.claimed) {
      throw new Error("Expected the admitted branch refresh to claim its lock.");
    }
    await expect(
      t.mutation(internal.vault.branches.releaseTreeRefresh, {
        vaultId: ids.vaultId,
        startedAt: refreshClaim.startedAt,
        markRefreshed: true,
      }),
    ).resolves.toEqual({ released: true });

    await expect(
      t.mutation(internal.fileStaging.saveToStaging, {
        vaultId: ids.vaultId,
        initialFilePath: "new.md",
        content: "new",
        initialContent: "new",
        parentCommitSha: null,
        branch: "main",
        userId: ids.userId,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance");

    await expect(
      t.mutation(internal.fileStaging.saveToStaging, {
        vaultId: ids.vaultId,
        initialFilePath: "new.md",
        content: "new",
        initialContent: "new",
        parentCommitSha: null,
        branch: "main",
        userId: ids.userId,
        leaseId: lease.leaseId,
      }),
    ).rejects.toThrow("Repository operation lease identity is incomplete");

    await t.mutation(internal.repositoryMigration.maintenance.releaseOperationLease, {
      leaseId: lease.leaseId,
      operationId,
      operationName,
    });
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "frozen",
    });

    await expect(
      t.mutation(internal.collaborative.pruneOldUpdates, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "README.md",
        currentVersion: 1_000,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance");
  });
});
