import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, object } = v;

export const vaultOrganizationTreeTables = {
  /** One user's saved organization disclosure choice in the shared vault tree. */
  ui_vaultOrganizationTree_settings: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    collapsed: boolean(),
  }).index("by_userId_and_organizationId", ["userId", "organizationId"]),
};

const vaultOrganizationTreeSettingFields =
  vaultOrganizationTreeTables.ui_vaultOrganizationTree_settings.validator.fields;

export const vVaultOrganizationTreeSetting = object({
  collapsed: vaultOrganizationTreeSettingFields.collapsed,
  organizationId: vaultOrganizationTreeSettingFields.organizationId,
});
