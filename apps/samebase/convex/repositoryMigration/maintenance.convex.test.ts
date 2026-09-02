/// <reference types="vite/client" />

import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("repository migration maintenance", () => {
  it("uses normal mode until the operator changes it", async () => {
    const t = makeConvexTest();

    await expect(
      t.query(api.repositoryMigration.maintenance.getRepositoryMaintenanceMode, {}),
    ).resolves.toEqual({ mode: "normal", changedAt: null });
  });

  it("allows only the maintenance transition sequence", async () => {
    const t = makeConvexTest();

    await expect(
      t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
        mode: "frozen",
      }),
    ).rejects.toThrow("cannot transition from normal to frozen");

    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "frozen",
    });
    await expect(
      t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
        mode: "draining",
      }),
    ).rejects.toThrow("cannot transition from frozen to draining");
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "normal",
    });

    await expect(
      t.query(api.repositoryMigration.maintenance.getRepositoryMaintenanceMode, {}),
    ).resolves.toMatchObject({ mode: "normal" });
  });

  it("rejects a new operation during draining", async () => {
    const t = makeConvexTest();
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });

    await expect(
      t.mutation(internal.repositoryMigration.maintenance.claimOperationLease, {
        operationId: "new-operation",
        operationName: "test-operation",
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance");
  });

  it("lets an admitted operation finish draining and blocks freeze until release", async () => {
    const t = makeConvexTest();
    const operationId = "admitted-operation";
    const operationName = "test-operation";
    const lease = await t.mutation(internal.repositoryMigration.maintenance.claimOperationLease, {
      operationId,
      operationName,
    });

    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    await expect(
      t.mutation(internal.repositoryMigration.maintenance.claimOperationLease, {
        operationId,
        operationName,
      }),
    ).resolves.toEqual(lease);
    await expect(
      t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
        mode: "frozen",
      }),
    ).rejects.toThrow("a repository operation lease is active");

    await t.mutation(internal.repositoryMigration.maintenance.releaseOperationLease, {
      leaseId: lease.leaseId,
      operationId,
      operationName,
    });
    await expect(
      t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
        mode: "frozen",
      }),
    ).resolves.toMatchObject({ mode: "frozen" });
  });

  it("blocks freeze while a repository workflow is active", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "installation",
        githubOwnerId: "owner",
        githubOwnerLogin: "ada",
        githubOwnerLoginNormalized: "ada",
        githubOwnerType: "user",
      });
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
        createdAt: 1,
      });
      await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "ada/example",
        trigger: "connect_existing_repository",
        state: "queued",
        currentStep: "run_created",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    await expect(
      t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
        mode: "frozen",
      }),
    ).rejects.toThrow("a repository provisioning run is queued");
  });
});
