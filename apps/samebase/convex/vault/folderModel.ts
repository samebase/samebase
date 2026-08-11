import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, number, object, string } = v;

export const vaultFolderTables = {
  /** Per-user shallow vault folders inside one organization. */
  ui_vaultFolders: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    name: string(),
    nameKey: string(),
    position: number(),
    collapsed: boolean(),
  })
    .index("by_userId_and_organizationId_and_nameKey", ["userId", "organizationId", "nameKey"])
    .index("by_userId_and_organizationId_and_position", ["userId", "organizationId", "position"])
    .index("by_organization", ["organizationId"]),

  /** One current or stale folder assignment for one user's vault. */
  ui_vaultFolderAssignments: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    vaultId: id("vaults"),
    folderId: id("ui_vaultFolders"),
  })
    .index("by_userId_and_organizationId_and_vaultId", ["userId", "organizationId", "vaultId"])
    .index("by_vaultId", ["vaultId"])
    .index("by_organization", ["organizationId"]),
};

const vaultFolderFields = vaultFolderTables.ui_vaultFolders.validator.fields;
const vaultFolderAssignmentFields = vaultFolderTables.ui_vaultFolderAssignments.validator.fields;

export const vVaultFolder = object({
  _id: id("ui_vaultFolders"),
  collapsed: vaultFolderFields.collapsed,
  name: vaultFolderFields.name,
  organizationId: vaultFolderFields.organizationId,
  position: vaultFolderFields.position,
});

export const vVaultFolderAssignment = object({
  folderId: vaultFolderAssignmentFields.folderId,
  vaultId: vaultFolderAssignmentFields.vaultId,
});
