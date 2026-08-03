import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../functions";
import { hasPhaseOneUserOwnership, readPhaseOneOwnershipContext } from "../phaseOneOwnership";
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

async function assertOwnedVault(
  ctx: FolderMutationCtx,
  args: { userId: Id<"users">; vaultId: Id<"vaults"> },
): Promise<Doc<"vaults">> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault) {
    throw new Error("Vault not found");
  }
  const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
  if (!hasPhaseOneUserOwnership(ownership, vault)) {
    throw new Error("Vault not found");
  }
  return vault;
}

async function assertOwnedFolder(
  ctx: FolderMutationCtx,
  args: { folderId: Id<"ui_vaultFolders">; userId: Id<"users"> },
): Promise<Doc<"ui_vaultFolders">> {
  const folder = await ctx.db.get(args.folderId);
  if (!folder || folder.userId !== args.userId) {
    throw new Error("Folder not found");
  }
  return folder;
}

async function readFolderAssignments(ctx: FolderReadCtx, userId: Id<"users">) {
  return await ctx.db
    .query("ui_vaultFolderAssignments")
    .withIndex("by_userId_and_vaultId", (q) => q.eq("userId", userId))
    .collect();
}

async function upsertFolderAssignment(
  ctx: FolderMutationCtx,
  args: {
    folderId: Id<"ui_vaultFolders">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
) {
  const assignment = await ctx.db
    .query("ui_vaultFolderAssignments")
    .withIndex("by_userId_and_vaultId", (q) =>
      q.eq("userId", args.userId).eq("vaultId", args.vaultId),
    )
    .unique();

  if (assignment) {
    await ctx.db.patch(assignment._id, { folderId: args.folderId });
    return;
  }

  await ctx.db.insert("ui_vaultFolderAssignments", args);
}

async function readFolders(ctx: FolderReadCtx, userId: Id<"users">) {
  return await ctx.db
    .query("ui_vaultFolders")
    .withIndex("by_userId_and_position", (q) => q.eq("userId", userId))
    .collect();
}

export const getVaultFolderState = query({
  access: "access_dashboard",
  args: {},
  returns: vVaultFolderState,
  handler: async (ctx) => {
    const [folders, assignments] = await Promise.all([
      readFolders(ctx, ctx.viewer.userId),
      readFolderAssignments(ctx, ctx.viewer.userId),
    ]);

    return {
      folders: folders
        .sort((left, right) => left.position - right.position || left._id.localeCompare(right._id))
        .map((folder) => ({
          _id: folder._id,
          collapsed: folder.collapsed,
          name: folder.name,
          position: folder.position,
        })),
      assignments: assignments
        .sort((left, right) => left.vaultId.localeCompare(right.vaultId))
        .map((assignment) => ({ folderId: assignment.folderId, vaultId: assignment.vaultId })),
    };
  },
});

export const createVaultFolder = mutation({
  access: "access_dashboard",
  args: { name: string() },
  returns: id("ui_vaultFolders"),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const { name, nameKey } = normalizeFolderName(args.name);
    const existing = await ctx.db
      .query("ui_vaultFolders")
      .withIndex("by_userId_and_nameKey", (q) => q.eq("userId", userId).eq("nameKey", nameKey))
      .unique();
    if (existing) {
      throw new ConvexError("Folder name is already in use.");
    }

    const lastFolder = await ctx.db
      .query("ui_vaultFolders")
      .withIndex("by_userId_and_position", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const folderId = await ctx.db.insert("ui_vaultFolders", {
      userId,
      name,
      nameKey,
      position: (lastFolder?.position ?? -1) + 1,
      collapsed: false,
    });
    return folderId;
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
      .withIndex("by_userId_and_nameKey", (q) => q.eq("userId", userId).eq("nameKey", nameKey))
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
    await assertOwnedVault(ctx, { userId, vaultId: args.vaultId });
    const assignment = await ctx.db
      .query("ui_vaultFolderAssignments")
      .withIndex("by_userId_and_vaultId", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
      .unique();

    if (args.folderId === null) {
      if (assignment) {
        await ctx.db.delete(assignment._id);
      }
      return null;
    }

    await assertOwnedFolder(ctx, { folderId: args.folderId, userId });
    await upsertFolderAssignment(ctx, { folderId: args.folderId, userId, vaultId: args.vaultId });
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
    const folders = (await readFolders(ctx, userId)).sort(
      (left, right) => left.position - right.position || left._id.localeCompare(right._id),
    );
    const index = folders.findIndex((candidate) => candidate._id === folder._id);
    const adjacentIndex = args.direction === "up" ? index - 1 : index + 1;
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
