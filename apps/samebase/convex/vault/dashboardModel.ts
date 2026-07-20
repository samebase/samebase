import { defineTable } from "convex/server";
import { v } from "convex/values";

const { array, boolean, id, number, object, string } = v;

export const vaultDashboardTables = {
  /** Per-user choices controlling which pull-request branches appear for one vault. */
  ui_vaultPullRequests_filters: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    hiddenLabels: array(string()),
    includeDrafts: boolean(),
    includeNoLabel: boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_vault", ["vaultId"]),

  /**
   * One user's choice to keep the resource-links rail open for one vault.
   * New vault creation inserts an open row so the connection rail starts visible.
   * Missing rows still use the dashboard's collapsed fallback for legacy or directly seeded vaults.
   */
  ui_vaultResourceLinks_settings: defineTable({
    userId: id("users"),
    updatedAt: number(),
    resourceLinksOpen: boolean(),
    vaultId: id("vaults"),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_vault", ["vaultId"]),
};

const vaultResourceLinksStateRow =
  vaultDashboardTables.ui_vaultResourceLinks_settings.validator.fields;

export const vVaultResourceLinksState = object({
  resourceLinksOpen: vaultResourceLinksStateRow.resourceLinksOpen,
  vaultId: vaultResourceLinksStateRow.vaultId,
});
