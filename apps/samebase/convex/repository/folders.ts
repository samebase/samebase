import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../functions";
import {
  findOrganizationAccessContext,
  listOrganizationIdsForUser,
  requireOrganizationAccessContext,
  requireRepositoryForUser,
} from "../organizationAccess";
import { vRepositoryFolder, vRepositoryFolderAssignment } from "./folderModel";

const { array, boolean, id, literal, object, string, union } = v;

const vRepositoryFolderState = object({
  assignments: array(vRepositoryFolderAssignment),
  folders: array(vRepositoryFolder),
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
  args: { folderId: Id<"ui_repositoryTree_folders">; userId: Id<"users"> },
): Promise<Doc<"ui_repositoryTree_folders">> {
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
    .query("ui_repositoryTree_folderAssignments")
    .withIndex("by_userId_and_organizationId_and_repositoryId", (q) =>
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
    .query("ui_repositoryTree_folders")
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
    folderId: Id<"ui_repositoryTree_folders">;
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
) {
  const assignment = await ctx.db
    .query("ui_repositoryTree_folderAssignments")
    .withIndex("by_userId_and_organizationId_and_repositoryId", (q) =>
      q
        .eq("userId", args.userId)
        .eq("organizationId", args.organizationId)
        .eq("repositoryId", args.repositoryId),
    )
    .unique();

  if (assignment) {
    await ctx.db.patch(assignment._id, { folderId: args.folderId });
    return;
  }

  await ctx.db.insert("ui_repositoryTree_folderAssignments", args);
}

export const getRepositoryFolderState = query({
  access: "access_dashboard",
  args: {},
  returns: vRepositoryFolderState,
  handler: async (ctx) => {
    const organizationIds = await listOrganizationIdsForUser(ctx.db, ctx.viewer.userId);
    const folders = [];
    const visibleAssignments = [];
    const assignedRepositoryIds = new Set<Id<"repositories">>();

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
        if (assignedRepositoryIds.has(assignment.repositoryId)) {
          throw new Error("Duplicate repository folder assignments.");
        }

        assignedRepositoryIds.add(assignment.repositoryId);
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
        .sort((left, right) => left.repositoryId.localeCompare(right.repositoryId))
        .map((assignment) => ({
          folderId: assignment.folderId,
          repositoryId: assignment.repositoryId,
        })),
    };
  },
});

export const createRepositoryFolder = mutation({
  access: "access_dashboard",
  args: { name: string(), organizationId: id("organizations") },
  returns: id("ui_repositoryTree_folders"),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    await requireOrganizationAccessContext(ctx.db, {
      organizationId: args.organizationId,
      userId,
    });

    const { name, nameKey } = normalizeFolderName(args.name);
    const existing = await ctx.db
      .query("ui_repositoryTree_folders")
      .withIndex("by_userId_and_organizationId_and_nameKey", (q) =>
        q.eq("userId", userId).eq("organizationId", args.organizationId).eq("nameKey", nameKey),
      )
      .unique();
    if (existing) {
      throw new ConvexError("Folder name is already in use.");
    }

    const lastFolder = await ctx.db
      .query("ui_repositoryTree_folders")
      .withIndex("by_userId_and_organizationId_and_position", (q) =>
        q.eq("userId", userId).eq("organizationId", args.organizationId),
      )
      .order("desc")
      .first();
    return await ctx.db.insert("ui_repositoryTree_folders", {
      collapsed: false,
      name,
      nameKey,
      organizationId: args.organizationId,
      position: (lastFolder?.position ?? -1) + 1,
      userId,
    });
  },
});

export const renameRepositoryFolder = mutation({
  access: "access_dashboard",
  args: { folderId: id("ui_repositoryTree_folders"), name: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const folder = await assertOwnedFolder(ctx, { folderId: args.folderId, userId });
    const { name, nameKey } = normalizeFolderName(args.name);
    const existing = await ctx.db
      .query("ui_repositoryTree_folders")
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

export const setRepositoryFolderCollapsed = mutation({
  access: "access_dashboard",
  args: { collapsed: boolean(), folderId: id("ui_repositoryTree_folders") },
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

export const moveRepositoryToFolder = mutation({
  access: "access_dashboard",
  args: {
    folderId: union(id("ui_repositoryTree_folders"), v.null()),
    repositoryId: id("repositories"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const repository = await requireRepositoryForUser(ctx.db, {
      userId,
      repositoryId: args.repositoryId,
    });
    const assignment = await ctx.db
      .query("ui_repositoryTree_folderAssignments")
      .withIndex("by_userId_and_organizationId_and_repositoryId", (q) =>
        q
          .eq("userId", userId)
          .eq("organizationId", repository.organizationId)
          .eq("repositoryId", args.repositoryId),
      )
      .unique();
    if (args.folderId === null) {
      if (assignment) {
        await ctx.db.delete(assignment._id);
      }
      return null;
    }

    const folder = await assertOwnedFolder(ctx, { folderId: args.folderId, userId });
    if (folder.organizationId !== repository.organizationId) {
      throw new ConvexError("Folder and repository must belong to the same organization.");
    }

    await upsertFolderAssignment(ctx, {
      folderId: folder._id,
      organizationId: folder.organizationId,
      userId,
      repositoryId: repository._id,
    });
    return null;
  },
});

export const moveRepositoryFolder = mutation({
  access: "access_dashboard",
  args: {
    direction: union(literal("up"), literal("down")),
    folderId: id("ui_repositoryTree_folders"),
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

export const deleteRepositoryFolder = mutation({
  access: "access_dashboard",
  args: { folderId: id("ui_repositoryTree_folders") },
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
