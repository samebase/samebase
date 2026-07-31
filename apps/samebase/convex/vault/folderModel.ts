import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, number, object, string } = v;

export const vaultFolderTables = {
  /** Per-user shallow vault folders for dashboard organization. */
  ui_vaultFolders: defineTable({
    userId: id("users"),
    name: string(),
    nameKey: string(),
    position: number(),
    collapsed: boolean(),
  })
    .index("by_userId_and_nameKey", ["userId", "nameKey"])
    .index("by_userId_and_position", ["userId", "position"]),

  /** One current or stale folder assignment for one user's vault. */
  ui_vaultFolderAssignments: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    folderId: id("ui_vaultFolders"),
  })
    .index("by_userId_and_vaultId", ["userId", "vaultId"])
    .index("by_vaultId", ["vaultId"]),
};

const vaultFolderFields = vaultFolderTables.ui_vaultFolders.validator.fields;
const vaultFolderAssignmentFields = vaultFolderTables.ui_vaultFolderAssignments.validator.fields;

export const vVaultFolder = object({
  _id: id("ui_vaultFolders"),
  collapsed: vaultFolderFields.collapsed,
  name: vaultFolderFields.name,
  position: vaultFolderFields.position,
});

export const vVaultFolderAssignment = object({
  folderId: vaultFolderAssignmentFields.folderId,
  vaultId: vaultFolderAssignmentFields.vaultId,
});
