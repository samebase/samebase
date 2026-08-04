import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { cleanupAccountLocalDataBatchForUser } from "../accountDeletion/cleanup";
import { deleteVaultLocalDataBatchForOrganization } from "./deletion/cleanup";

async function seedUser(t: ReturnType<typeof makeConvexTest>, email: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email, isApproved: true });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    return userId;
  });
}

async function seedVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .unique();
    if (!membership) {
      throw new Error("Organization membership not found");
    }
    return await ctx.db.insert("vaults", {
      organizationId: membership.organizationId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
  });
}

async function seedDashboardVault(
  t: ReturnType<typeof makeConvexTest>,
  args: { name: string; userId: Awaited<ReturnType<typeof seedUser>> },
) {
  return await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", args.userId))
      .unique();
    if (!membership) {
      throw new Error("Organization membership not found");
    }
    const vaultId = await ctx.db.insert("vaults", {
      organizationId: membership.organizationId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: args.userId,
      vaultId,
      repositoryFullName: `ada/${args.name}`,
      trigger: "connect_existing_repository",
      state: "failed",
      currentStep: "run_created",
      createdAt: 1,
      updatedAt: 2,
      lastError: "Test failure.",
    });
    await ctx.db.replace(vaultId, {
      organizationId: membership.organizationId,
      state: "failed",
      githubMode: "connect_existing_repository",
      runId,
      failedAt: 3,
      owner: "ada",
      name: args.name,
      deletion: { state: "not_deleting" },
    });
    return vaultId;
  });
}

function asUser(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

describe("vault folders Convex contract", () => {
  it("normalizes folder names and creates an empty expanded folder", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const viewer = asUser(t, userId);

    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "  ＦＯＯ  ",
    });

    await expect(
      viewer.mutation(api.vault.folders.createVaultFolder, { name: "foo" }),
    ).rejects.toThrow("Folder name is already in use.");
    await t.run(async (ctx) => {
      const folder = await ctx.db.get(folderId);
      const assignment = await ctx.db
        .query("ui_vaultFolderAssignments")
        .withIndex("by_userId_and_vaultId", (q) => q.eq("userId", userId))
        .first();

      expect(folder).toMatchObject({ collapsed: false, name: "FOO", nameKey: "foo", userId });
      expect(assignment).toBeNull();
    });
  });

  it("fails closed on duplicate folder rows during creation", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Fixtures",
    });

    await t.run(async (ctx) => {
      const folder = await ctx.db.get(folderId);
      if (!folder) {
        throw new Error("Folder not found");
      }
      await ctx.db.insert("ui_vaultFolders", {
        collapsed: false,
        name: folder.name,
        nameKey: folder.nameKey,
        position: folder.position + 1,
        userId,
      });
    });

    await expect(
      viewer.mutation(api.vault.folders.createVaultFolder, { name: "fixtures" }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate normalized folder name during rename", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Current",
    });
    await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Fixtures",
    });

    await expect(
      viewer.mutation(api.vault.folders.renameVaultFolder, { folderId, name: "Fixtures" }),
    ).rejects.toThrow("Folder name is already in use.");
  });

  it("fails closed on duplicate target folder rows during rename", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Current",
    });
    const targetFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Fixtures",
    });

    await t.run(async (ctx) => {
      const folder = await ctx.db.get(targetFolderId);
      if (!folder) {
        throw new Error("Folder not found");
      }
      await ctx.db.insert("ui_vaultFolders", {
        collapsed: false,
        name: folder.name,
        nameKey: folder.nameKey,
        position: folder.position + 1,
        userId,
      });
    });

    await expect(
      viewer.mutation(api.vault.folders.renameVaultFolder, { folderId, name: "Fixtures" }),
    ).rejects.toThrow();
  });

  it("denies folder changes for another user's vault and folder", async () => {
    const t = makeConvexTest();
    const ownerId = await seedUser(t, "owner@example.com");
    const otherId = await seedUser(t, "other@example.com");
    const otherVaultId = await seedVault(t, otherId);
    const owner = asUser(t, ownerId);
    const other = asUser(t, otherId);
    const folderId = await owner.mutation(api.vault.folders.createVaultFolder, {
      name: "Owner folder",
    });

    await expect(
      other.mutation(api.vault.folders.renameVaultFolder, { folderId, name: "Changed" }),
    ).rejects.toThrow("Folder not found");
    await expect(
      other.mutation(api.vault.folders.moveVaultToFolder, {
        folderId,
        vaultId: otherVaultId,
      }),
    ).rejects.toThrow("Folder not found");
  });

  it("moves vaults, persists collapse, and orders folders", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstVaultId = await seedDashboardVault(t, { name: "first", userId });
    const secondVaultId = await seedDashboardVault(t, { name: "second", userId });
    const viewer = asUser(t, userId);
    const firstFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "First",
    });
    const secondFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Second",
    });

    await viewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId: secondFolderId,
      vaultId: secondVaultId,
    });
    await viewer.mutation(api.vault.folders.setVaultFolderCollapsed, {
      collapsed: true,
      folderId: firstFolderId,
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId: secondFolderId,
      vaultId: firstVaultId,
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId: null,
      vaultId: firstVaultId,
    });
    await viewer.mutation(api.vault.folders.moveVaultFolder, {
      direction: "up",
      folderId: secondFolderId,
    });

    await expect(viewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      folders: [
        { _id: secondFolderId, collapsed: false, name: "Second", position: 0 },
        { _id: firstFolderId, collapsed: true, name: "First", position: 1 },
      ],
      assignments: [{ folderId: secondFolderId, vaultId: secondVaultId }],
    });
  });

  it("rejects duplicate assignments during vault moves", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const secondVaultId = await seedVault(t, userId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Fixtures",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("ui_vaultFolderAssignments", {
        folderId,
        userId,
        vaultId: secondVaultId,
      });
      await ctx.db.insert("ui_vaultFolderAssignments", {
        folderId,
        userId,
        vaultId: secondVaultId,
      });
    });

    await expect(
      viewer.mutation(api.vault.folders.moveVaultToFolder, {
        folderId,
        vaultId: secondVaultId,
      }),
    ).rejects.toThrow();
  });

  it("keeps deleted-folder assignments stale until a later move", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const vaultId = await seedVault(t, userId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Fixtures",
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId });

    await viewer.mutation(api.vault.folders.deleteVaultFolder, { folderId });
    await expect(viewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      folders: [],
      assignments: [{ folderId, vaultId }],
    });

    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId: null, vaultId });
    await expect(viewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      folders: [],
      assignments: [],
    });
  });

  it("removes a vault assignment during vault deletion", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const vaultId = await seedVault(t, userId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Fixtures",
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId });

    const organizationId = await t.run(async (ctx) => {
      const vault = await ctx.db.get(vaultId);
      if (vault === null) {
        throw new Error("Expected vault.");
      }
      return vault.organizationId;
    });
    await expect(
      t.run(async (ctx) => {
        return await deleteVaultLocalDataBatchForOrganization(ctx, { organizationId, vaultId });
      }),
    ).resolves.toEqual({
      rowsChanged: 1,
      state: "needs_more",
      table: "ui_vaultFolderAssignments",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).not.toBeNull();
      expect(
        await ctx.db
          .query("ui_vaultFolderAssignments")
          .withIndex("by_vaultId", (q) => q.eq("vaultId", vaultId))
          .first(),
      ).toBeNull();
    });
  });

  it("removes folder data during account deletion and leaves MCP vault output complete", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstVaultId = await seedDashboardVault(t, { name: "first", userId });
    const secondVaultId = await seedDashboardVault(t, { name: "second", userId });
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Current",
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId,
      vaultId: firstVaultId,
    });
    const organizationId = await t.run(async (ctx) => {
      const vault = await ctx.db.get(firstVaultId);
      if (vault === null) {
        throw new Error("Vault not found");
      }
      return vault.organizationId;
    });

    await expect(
      t.query(internal.vault.dashboard.getOrganizationVaultsForUser, {
        organizationId,
        userId,
      }),
    ).resolves.toHaveLength(2);

    let cleanup = await t.run(async (ctx) => {
      return await cleanupAccountLocalDataBatchForUser(ctx, { userId });
    });
    while (cleanup.state !== "done") {
      cleanup = await t.run(async (ctx) => {
        return await cleanupAccountLocalDataBatchForUser(ctx, { userId });
      });
    }

    await t.run(async (ctx) => {
      expect(await ctx.db.get(firstVaultId)).toBeNull();
      expect(await ctx.db.get(secondVaultId)).toBeNull();
      expect(
        await ctx.db
          .query("ui_vaultFolders")
          .withIndex("by_userId_and_position", (q) => q.eq("userId", userId))
          .first(),
      ).toBeNull();
      expect(
        await ctx.db
          .query("ui_vaultFolderAssignments")
          .withIndex("by_userId_and_vaultId", (q) => q.eq("userId", userId))
          .first(),
      ).toBeNull();
    });
  });
});
