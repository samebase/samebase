import { ConvexError, v } from "convex/values";

import { mutation, query } from "../functions";
import { vVaultFolder, vVaultFolderAssignment } from "./folderModel";

const { array, boolean, id, literal, null: vNull, object, string, union } = v;

const vVaultFolderState = object({
  assignments: array(vVaultFolderAssignment),
  folders: array(vVaultFolder),
});

const VAULT_FOLDERS_REMOVED_ERROR = "Vault folders are no longer available.";

function vaultFoldersRemoved(): never {
  throw new ConvexError(VAULT_FOLDERS_REMOVED_ERROR);
}

/** Compatibility read after personal folder controls were removed from the vault inventory. */
export const getVaultFolderState = query({
  access: "access_dashboard",
  args: {},
  returns: vVaultFolderState,
  handler: async () => ({ assignments: [], folders: [] }),
});

export const createVaultFolder = mutation({
  access: "access_dashboard",
  args: { name: string() },
  returns: id("ui_vaultFolders"),
  handler: async () => vaultFoldersRemoved(),
});

export const renameVaultFolder = mutation({
  access: "access_dashboard",
  args: { folderId: id("ui_vaultFolders"), name: string() },
  returns: v.null(),
  handler: async () => vaultFoldersRemoved(),
});

export const setVaultFolderCollapsed = mutation({
  access: "access_dashboard",
  args: { collapsed: boolean(), folderId: id("ui_vaultFolders") },
  returns: v.null(),
  handler: async () => vaultFoldersRemoved(),
});

export const moveVaultToFolder = mutation({
  access: "access_dashboard",
  args: { folderId: union(id("ui_vaultFolders"), vNull()), vaultId: id("vaults") },
  returns: v.null(),
  handler: async () => vaultFoldersRemoved(),
});

export const moveVaultFolder = mutation({
  access: "access_dashboard",
  args: {
    direction: union(literal("up"), literal("down")),
    folderId: id("ui_vaultFolders"),
  },
  returns: v.null(),
  handler: async () => vaultFoldersRemoved(),
});

export const deleteVaultFolder = mutation({
  access: "access_dashboard",
  args: { folderId: id("ui_vaultFolders") },
  returns: v.null(),
  handler: async () => vaultFoldersRemoved(),
});
