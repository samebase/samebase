import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function seedFolderData(t: ReturnType<typeof makeConvexTest>, assignmentCount = 1) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "ada@example.com", isApproved: true });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "installation-ada",
      githubOwnerId: "owner-ada",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      role: "owner",
      userId,
    });
    const vaultId = await ctx.db.insert("vaults", {
      deletion: { state: "not_deleting" },
      organizationId,
      state: "not_connected",
    });
    const folderId = await ctx.db.insert("ui_vaultFolders", {
      collapsed: false,
      name: "Old folder",
      nameKey: "old folder",
      position: 0,
      userId,
    });
    for (let index = 0; index < assignmentCount; index += 1) {
      await ctx.db.insert("ui_vaultFolderAssignments", { folderId, userId, vaultId });
    }
    return { folderId, userId, vaultId };
  });
}

function asUser(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedFolderData>>["userId"],
) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

describe("removed vault folder compatibility", () => {
  it("returns an empty state without reading stored folder data", async () => {
    const t = makeConvexTest();
    const { userId } = await seedFolderData(t);

    await expect(asUser(t, userId).query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      assignments: [],
      folders: [],
    });
  });

  it("fails every old folder write with the removal error", async () => {
    const t = makeConvexTest();
    const { folderId, userId, vaultId } = await seedFolderData(t);
    const viewer = asUser(t, userId);
    const error = "Vault folders are no longer available.";

    await expect(
      viewer.mutation(api.vault.folders.createVaultFolder, { name: "New" }),
    ).rejects.toThrow(error);
    await expect(
      viewer.mutation(api.vault.folders.renameVaultFolder, { folderId, name: "Renamed" }),
    ).rejects.toThrow(error);
    await expect(
      viewer.mutation(api.vault.folders.setVaultFolderCollapsed, { collapsed: true, folderId }),
    ).rejects.toThrow(error);
    await expect(
      viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId }),
    ).rejects.toThrow(error);
    await expect(
      viewer.mutation(api.vault.folders.moveVaultFolder, { direction: "up", folderId }),
    ).rejects.toThrow(error);
    await expect(
      viewer.mutation(api.vault.folders.deleteVaultFolder, { folderId }),
    ).rejects.toThrow(error);
  });
});

describe("vault folder data cleanup", () => {
  it("refuses folder deletion while an assignment remains", async () => {
    const t = makeConvexTest();
    const { folderId } = await seedFolderData(t);

    await expect(t.query(internal.vault.folderCleanup.getRemovalStatus, {})).resolves.toEqual({
      assignmentsEmpty: false,
      foldersEmpty: false,
      phase: "assignments",
    });
    await expect(t.mutation(internal.vault.folderCleanup.deleteFolderBatch, {})).rejects.toThrow(
      "Vault folder assignments must be empty before vault folders can be removed.",
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.get(folderId)).not.toBeNull();
    });
  });

  it("deletes bounded assignment batches before folders and proves completion", async () => {
    const t = makeConvexTest();
    await seedFolderData(t, 101);

    await expect(
      t.mutation(internal.vault.folderCleanup.deleteAssignmentBatch, {}),
    ).resolves.toEqual({
      rowsDeleted: 100,
      status: { assignmentsEmpty: false, foldersEmpty: false, phase: "assignments" },
    });
    await expect(
      t.mutation(internal.vault.folderCleanup.deleteAssignmentBatch, {}),
    ).resolves.toEqual({
      rowsDeleted: 1,
      status: { assignmentsEmpty: true, foldersEmpty: false, phase: "folders" },
    });
    await expect(t.mutation(internal.vault.folderCleanup.deleteFolderBatch, {})).resolves.toEqual({
      rowsDeleted: 1,
      status: { assignmentsEmpty: true, foldersEmpty: true, phase: "complete" },
    });
    await expect(t.query(internal.vault.folderCleanup.getRemovalStatus, {})).resolves.toEqual({
      assignmentsEmpty: true,
      foldersEmpty: true,
      phase: "complete",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("ui_vaultFolderAssignments").first()).toBeNull();
      expect(await ctx.db.query("ui_vaultFolders").first()).toBeNull();
    });
  });

  it("keeps folder rows through the vault deletion cleanup flow", async () => {
    const t = makeConvexTest();
    const { folderId, userId, vaultId } = await seedFolderData(t);

    for (const step of [
      "cleanup_editor_state",
      "cleanup_source_caches",
      "cleanup_runtime_state",
      "cleanup_provisioning_history",
    ] as const) {
      await expect(
        t.mutation(internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch, {
          step,
          userId,
          vaultId,
        }),
      ).resolves.toEqual({ state: "done" });
    }
    await t.mutation(internal.vault.deletion.cleanup.deleteVaultRow, { userId, vaultId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).toBeNull();
      expect(await ctx.db.get(folderId)).not.toBeNull();
      expect(await ctx.db.query("ui_vaultFolderAssignments").first()).not.toBeNull();
    });
  });
});
