import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function seedUser(t: ReturnType<typeof makeConvexTest>, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email, isApproved: true });
  });
}

async function seedOrganization(
  t: ReturnType<typeof makeConvexTest>,
  args: {
    owner: string;
    role?: "member" | "owner";
    userId?: Id<"users">;
  },
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: `installation-${args.owner}`,
      githubOwnerId: `owner-${args.owner}`,
      githubOwnerLogin: args.owner,
      githubOwnerLoginNormalized: args.owner.toLowerCase(),
      githubOwnerType: "organization",
    });
    if (args.userId) {
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        role: args.role ?? "member",
        userId: args.userId,
      });
    }

    return organizationId;
  });
}

async function seedVault(
  t: ReturnType<typeof makeConvexTest>,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaults", {
      deletion: { state: "not_deleting" },
      organizationId,
      state: "not_connected",
    });
  });
}

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

describe("organization-scoped vault folders", () => {
  it("returns an empty state for a viewer without organizations", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");

    await expect(asUser(t, userId).query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      assignments: [],
      folders: [],
    });
  });

  it("normalizes names and scopes name uniqueness and ordering to one organization", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstOrganizationId = await seedOrganization(t, { owner: "first", userId });
    const secondOrganizationId = await seedOrganization(t, { owner: "second", userId });
    const viewer = asUser(t, userId);

    const firstFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "  ＦＯＯ  ",
      organizationId: firstOrganizationId,
    });
    await expect(
      viewer.mutation(api.vault.folders.createVaultFolder, {
        name: "foo",
        organizationId: firstOrganizationId,
      }),
    ).rejects.toThrow("Folder name is already in use.");
    const secondFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "foo",
      organizationId: secondOrganizationId,
    });

    const state = await viewer.query(api.vault.folders.getVaultFolderState);
    expect(state.assignments).toEqual([]);
    expect(state.folders).toEqual(
      [
        {
          _id: firstFolderId,
          collapsed: false,
          name: "FOO",
          organizationId: firstOrganizationId,
          position: 0,
        },
        {
          _id: secondFolderId,
          collapsed: false,
          name: "foo",
          organizationId: secondOrganizationId,
          position: 0,
        },
      ].sort((left, right) => left.organizationId.localeCompare(right.organizationId)),
    );
  });

  it("requires organization membership to create and change folders", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const otherUserId = await seedUser(t, "grace@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const viewer = asUser(t, userId);
    const otherViewer = asUser(t, otherUserId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });

    await expect(
      otherViewer.mutation(api.vault.folders.createVaultFolder, {
        name: "Other",
        organizationId,
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      otherViewer.mutation(api.vault.folders.renameVaultFolder, {
        folderId,
        name: "Changed",
      }),
    ).rejects.toThrow("Folder not found");
  });

  it("keeps folder state personal for two current organization members", async () => {
    const t = makeConvexTest();
    const firstUserId = await seedUser(t, "ada@example.com");
    const secondUserId = await seedUser(t, "grace@example.com");
    const organizationId = await seedOrganization(t, {
      owner: "samebase",
      userId: firstUserId,
    });
    const vaultId = await seedVault(t, organizationId);
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        role: "member",
        userId: secondUserId,
      });
    });
    const firstViewer = asUser(t, firstUserId);
    const secondViewer = asUser(t, secondUserId);

    const firstFolderId = await firstViewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });
    const secondFolderId = await secondViewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });
    await firstViewer.mutation(api.vault.folders.setVaultFolderCollapsed, {
      collapsed: true,
      folderId: firstFolderId,
    });
    await firstViewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId: firstFolderId,
      vaultId,
    });
    await secondViewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId: secondFolderId,
      vaultId,
    });

    await expect(firstViewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      assignments: [{ folderId: firstFolderId, vaultId }],
      folders: [
        {
          _id: firstFolderId,
          collapsed: true,
          name: "Projects",
          organizationId,
          position: 0,
        },
      ],
    });
    await expect(secondViewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      assignments: [{ folderId: secondFolderId, vaultId }],
      folders: [
        {
          _id: secondFolderId,
          collapsed: false,
          name: "Projects",
          organizationId,
          position: 0,
        },
      ],
    });
  });

  it("groups only vaults from the folder organization", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstOrganizationId = await seedOrganization(t, { owner: "first", userId });
    const secondOrganizationId = await seedOrganization(t, { owner: "second", userId });
    const firstVaultId = await seedVault(t, firstOrganizationId);
    const secondVaultId = await seedVault(t, secondOrganizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId: firstOrganizationId,
    });

    await viewer.mutation(api.vault.folders.moveVaultToFolder, {
      folderId,
      vaultId: firstVaultId,
    });
    await expect(
      viewer.mutation(api.vault.folders.moveVaultToFolder, {
        folderId,
        vaultId: secondVaultId,
      }),
    ).rejects.toThrow("Folder and vault must belong to the same organization.");
    await expect(viewer.query(api.vault.folders.getVaultFolderState)).resolves.toMatchObject({
      assignments: [{ folderId, vaultId: firstVaultId }],
    });
  });

  it("keeps collapse and order independent for each organization", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstOrganizationId = await seedOrganization(t, { owner: "first", userId });
    const secondOrganizationId = await seedOrganization(t, { owner: "second", userId });
    const viewer = asUser(t, userId);
    const firstFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "First",
      organizationId: firstOrganizationId,
    });
    const secondFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Second",
      organizationId: firstOrganizationId,
    });
    const otherFolderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Other",
      organizationId: secondOrganizationId,
    });

    await viewer.mutation(api.vault.folders.setVaultFolderCollapsed, {
      collapsed: true,
      folderId: secondFolderId,
    });
    await viewer.mutation(api.vault.folders.moveVaultFolder, {
      direction: "up",
      folderId: secondFolderId,
    });

    const state = await viewer.query(api.vault.folders.getVaultFolderState);
    expect(state.folders).toEqual(
      [
        {
          _id: secondFolderId,
          collapsed: true,
          name: "Second",
          organizationId: firstOrganizationId,
          position: 0,
        },
        {
          _id: firstFolderId,
          collapsed: false,
          name: "First",
          organizationId: firstOrganizationId,
          position: 1,
        },
        {
          _id: otherFolderId,
          collapsed: false,
          name: "Other",
          organizationId: secondOrganizationId,
          position: 0,
        },
      ].sort(
        (left, right) =>
          left.organizationId.localeCompare(right.organizationId) || left.position - right.position,
      ),
    );
  });

  it("hides stored folders and assignments after organization access is lost", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const vaultId = await seedVault(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (!membership) {
        throw new Error("Membership not found");
      }
      await ctx.db.delete(membership._id);
    });

    await expect(viewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      assignments: [],
      folders: [],
    });
    await expect(
      viewer.mutation(api.vault.folders.setVaultFolderCollapsed, {
        collapsed: true,
        folderId,
      }),
    ).rejects.toThrow("Folder not found");
    await t.run(async (ctx) => {
      expect(await ctx.db.get(folderId)).not.toBeNull();
      expect(
        await ctx.db
          .query("ui_vaultFolderAssignments")
          .withIndex("by_userId_and_organizationId_and_vaultId", (query) =>
            query.eq("userId", userId).eq("organizationId", organizationId).eq("vaultId", vaultId),
          )
          .unique(),
      ).not.toBeNull();
    });
  });

  it("leaves deleted-folder assignments stale and presents their vaults as ungrouped", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const vaultId = await seedVault(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId });

    await viewer.mutation(api.vault.folders.deleteVaultFolder, { folderId });

    await expect(viewer.query(api.vault.folders.getVaultFolderState)).resolves.toEqual({
      assignments: [],
      folders: [],
    });
    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query("ui_vaultFolderAssignments")
          .withIndex("by_userId_and_organizationId_and_vaultId", (query) =>
            query.eq("userId", userId).eq("organizationId", organizationId).eq("vaultId", vaultId),
          )
          .unique(),
      ).not.toBeNull();
    });
  });

  it("fails closed on duplicate visible assignments", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const vaultId = await seedVault(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId });
    await t.run(async (ctx) => {
      await ctx.db.insert("ui_vaultFolderAssignments", {
        folderId,
        organizationId,
        userId,
        vaultId,
      });
    });

    await expect(viewer.query(api.vault.folders.getVaultFolderState)).rejects.toThrow(
      "Duplicate vault folder assignments.",
    );
  });

  it("removes a folder assignment during vault deletion", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const vaultId = await seedVault(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.vault.folders.createVaultFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.vault.folders.moveVaultToFolder, { folderId, vaultId });

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
      expect(
        await ctx.db
          .query("ui_vaultFolderAssignments")
          .withIndex("by_vaultId", (query) => query.eq("vaultId", vaultId))
          .first(),
      ).toBeNull();
    });
  });
});
