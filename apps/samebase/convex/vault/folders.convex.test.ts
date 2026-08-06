import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function seedFolderData(t: ReturnType<typeof makeConvexTest>) {
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
    await ctx.db.insert("ui_vaultFolderAssignments", { folderId, userId, vaultId });
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

describe("retired vault folder data", () => {
  it("removes a vault assignment during vault deletion", async () => {
    const t = makeConvexTest();
    const { folderId, userId, vaultId } = await seedFolderData(t);

    await expect(
      t.mutation(internal.vault.deletion.cleanup.deleteVaultLocalDataBatch, { userId, vaultId }),
    ).resolves.toEqual({
      rowsChanged: 1,
      state: "needs_more",
      table: "ui_vaultFolderAssignments",
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).not.toBeNull();
      expect(await ctx.db.get(folderId)).not.toBeNull();
      expect(await ctx.db.query("ui_vaultFolderAssignments").first()).toBeNull();
    });
  });
});
