import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../functions";
import {
  findOrganizationAccessContext,
  listOrganizationIdsForUser,
  requireOrganizationAccessContext,
  requireVaultForUser,
} from "../organizationAccess";
import { vVaultFolder, vVaultFolderAssignment } from "./folderModel";

const { array, boolean, id, literal, null: vNull, object, string, union } = v;

const vVaultFolderState = object({
  assignments: array(vVaultFolderAssignment),
  folders: array(vVaultFolder),
});

function normalizeFolderName(name: string): { name: string; nameKey: string } {
  const normalizedName = name.trim().normalize("NFKC");
  if (normalizedName.length === 0) {
    throw new Error("Folder name is required.");
  }

  return { name: normalizedName, nameKey: normalizedName.toLowerCase() };
}

type FolderReadCtx = Pick<QueryCtx, "db">;
type FolderMutationCtx = Pick<MutationCtx, "db">;

async function assertOwnedFolder(
  ctx: FolderMutationCtx,
  args: { folderId: Id<"ui_vaultFolders">; userId: Id<"users"> },
): Promise<Doc<"ui_vaultFolders">> {
  const folder = await ctx.db.get(args.folderId);
  if (!folder || folder.userId !== args.userId) {
    throw new Error("Folder not found");
  }

  const access = await findOrganizationAccessContext(ctx.db, {
    organizationId: folder.organizationId,
    userId: args.userId,
  });
  if (access === null) {
    throw new Error("Folder not found");
  }

  return folder;
}

async function readFolderAssignments(
  ctx: FolderReadCtx,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
) {
  const assignments = [];
  for await (const assignment of ctx.db
    .query("ui_vaultFolderAssignments")
    .withIndex("by_userId_and_organizationId_and_vaultId", (q) =>
      q.eq("userId", args.userId).eq("organizationId", args.organizationId),
    )) {
    assignments.push(assignment);
  }

  return assignments;
}

async function readFoldersForOrganization(
  ctx: FolderReadCtx,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
) {
  const folders = [];
  for await (const folder of ctx.db
    .query("ui_vaultFolders")
    .withIndex("by_userId_and_organizationId_and_position", (q) =>
      q.eq("userId", args.userId).eq("organizationId", args.organizationId),
    )) {
    folders.push(folder);
  }

  return folders.sort(
    (left, right) => left.position - right.position || left._id.localeCompare(right._id),
  );
}

async function upsertFolderAssignment(
  ctx: FolderMutationCtx,
  args: {
    folderId: Id<"ui_vaultFolders">;
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
) {
  const assignment = await ctx.db
    .query("ui_vaultFolderAssignments")
    .withIndex("by_userId_and_organizationId_and_vaultId", (q) =>
      q
        .eq("userId", args.userId)
        .eq("organizationId", args.organizationId)
        .eq("vaultId", args.vaultId),
    )
    .unique();

  if (assignment) {
    await ctx.db.patch(assignment._id, { folderId: args.folderId });
    return;
  }

  await ctx.db.insert("ui_vaultFolderAssignments", args);
}

export const getVaultFolderState = query({
  access: "access_dashboard",
  args: {},
  returns: vVaultFolderState,
  handler: async (ctx) => {
    const organizationIds = await listOrganizationIdsForUser(ctx.db, ctx.viewer.userId);
    const folders = [];
    const visibleAssignments = [];
    const assignedVaultIds = new Set<Id<"vaults">>();

    for (const organizationId of organizationIds) {
      const organizationFolders = await readFoldersForOrganization(ctx, {
        organizationId,
        userId: ctx.viewer.userId,
      });
      const folderById = new Map(organizationFolders.map((folder) => [folder._id, folder]));
      const assignments = await readFolderAssignments(ctx, {
        organizationId,
        userId: ctx.viewer.userId,
      });

      folders.push(...organizationFolders);
      for (const assignment of assignments) {
        const folder = folderById.get(assignment.folderId);
        if (!folder || assignment.organizationId !== folder.organizationId) {
          continue;
        }
        if (assignedVaultIds.has(assignment.vaultId)) {
          throw new Error("Duplicate vault folder assignments.");
        }

        assignedVaultIds.add(assignment.vaultId);
        visibleAssignments.push(assignment);
      }
    }

    return {
      folders: folders.map((folder) => ({
        _id: folder._id,
        collapsed: folder.collapsed,
        name: folder.name,
        organizationId: folder.organizationId,
        position: folder.position,
      })),
      assignments: visibleAssignments
        .sort((left, right) => left.vaultId.localeCompare(right.vaultId))
        .map((assignment) => ({ folderId: assignment.folderId, vaultId: assignment.vaultId })),
    };
  },
});

export const createVaultFolder = mutation({
  access: "access_dashboard",
  args: { name: string(), organizationId: id("organizations") },
  returns: id("ui_vaultFolders"),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    await requireOrganizationAccessContext(ctx.db, {
      organizationId: args.organizationId,
      userId,
    });

    const { name, nameKey } = normalizeFolderName(args.name);
    const existing = await ctx.db
      .query("ui_vaultFolders")
      .withIndex("by_userId_and_organizationId_and_nameKey", (q) =>
        q.eq("userId", userId).eq("organizationId", args.organizationId).eq("nameKey", nameKey),
      )
      .unique();
    if (existing) {
      throw new ConvexError("Folder name is already in use.");
    }

    const lastFolder = await ctx.db
      .query("ui_vaultFolders")
      .withIndex("by_userId_and_organizationId_and_position", (q) =>
        q.eq("userId", userId).eq("organizationId", args.organizationId),
      )
      .order("desc")
      .first();

    return await ctx.db.insert("ui_vaultFolders", {
      collapsed: false,
      name,
      nameKey,
      organizationId: args.organizationId,
      position: (lastFolder?.position ?? -1) + 1,
      userId,
    });
  },
});

export const renameVaultFolder = mutation({
  access: "access_dashboard",
  args: { folderId: id("ui_vaultFolders"), name: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const folder = await assertOwnedFolder(ctx, { folderId: args.folderId, userId });
    const { name, nameKey } = normalizeFolderName(args.name);
    const existing = await ctx.db
      .query("ui_vaultFolders")
      .withIndex("by_userId_and_organizationId_and_nameKey", (q) =>
        q.eq("userId", userId).eq("organizationId", folder.organizationId).eq("nameKey", nameKey),
      )
      .unique();
    if (existing && existing._id !== folder._id) {
      throw new ConvexError("Folder name is already in use.");
    }

    await ctx.db.patch(folder._id, { name, nameKey });
    return null;
  },
});

export const setVaultFolderCollapsed = mutation({
  access: "access_dashboard",
  args: { collapsed: boolean(), folderId: id("ui_vaultFolders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await assertOwnedFolder(ctx, {
      folderId: args.folderId,
      userId: ctx.viewer.userId,
    });

    await ctx.db.patch(folder._id, { collapsed: args.collapsed });
    return null;
  },
});

export const moveVaultToFolder = mutation({
  access: "access_dashboard",
  args: { folderId: union(id("ui_vaultFolders"), vNull()), vaultId: id("vaults") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await requireVaultForUser(ctx.db, { userId, vaultId: args.vaultId });
    const assignment = await ctx.db
      .query("ui_vaultFolderAssignments")
      .withIndex("by_userId_and_organizationId_and_vaultId", (q) =>
        q
          .eq("userId", userId)
          .eq("organizationId", vault.organizationId)
          .eq("vaultId", args.vaultId),
      )
      .unique();

    if (args.folderId === null) {
      if (assignment) {
        await ctx.db.delete(assignment._id);
      }
      return null;
    }

    const folder = await assertOwnedFolder(ctx, { folderId: args.folderId, userId });
    if (folder.organizationId !== vault.organizationId) {
      throw new ConvexError("Folder and vault must belong to the same organization.");
    }

    await upsertFolderAssignment(ctx, {
      folderId: folder._id,
      organizationId: folder.organizationId,
      userId,
      vaultId: vault._id,
    });
    return null;
  },
});

export const moveVaultFolder = mutation({
  access: "access_dashboard",
  args: {
    direction: union(literal("up"), literal("down")),
    folderId: id("ui_vaultFolders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const folder = await assertOwnedFolder(ctx, { folderId: args.folderId, userId });
    const folders = await readFoldersForOrganization(ctx, {
      organizationId: folder.organizationId,
      userId,
    });
    const index = folders.findIndex((candidate) => candidate._id === folder._id);
    const adjacentIndex = args.direction === "up" ? index - 1 : index + 1;
    if (adjacentIndex < 0 || adjacentIndex >= folders.length) {
      return null;
    }

    const adjacent = folders.at(adjacentIndex);
    if (!adjacent) {
      return null;
    }

    await ctx.db.patch(folder._id, { position: adjacent.position });
    await ctx.db.patch(adjacent._id, { position: folder.position });
    return null;
  },
});

export const deleteVaultFolder = mutation({
  access: "access_dashboard",
  args: { folderId: id("ui_vaultFolders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await assertOwnedFolder(ctx, {
      folderId: args.folderId,
      userId: ctx.viewer.userId,
    });
    await ctx.db.delete(folder._id);
    return null;
  },
});
