import { defineTable } from "convex/server";
import { v } from "convex/values";

const { array, boolean, id, number, object, optional, string } = v;

export const vaultDashboardTables = {
  /** Per-user choices controlling which pull-request branches appear for one vault. */
  ui_vaultBranchFilters: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    hiddenLabels: array(string()),
    includeDrafts: boolean(),
    // Keep this optional so rows saved before unlabeled-branch support remain
    // readable until each user re-saves their filters.
    includeNoLabel: optional(boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_vault", ["vaultId"]),

  /**
   * New vault creation inserts an open row so the connection rail starts visible.
   * Missing rows still use the dashboard's collapsed fallback for legacy or directly seeded vaults.
   */
  ui_vaultResourceLinksState: defineTable({
    userId: id("users"),
    updatedAt: number(),
    resourceLinksOpen: boolean(),
    vaultId: id("vaults"),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_vault", ["vaultId"]),
};

const vaultResourceLinksStateRow = vaultDashboardTables.ui_vaultResourceLinksState.validator.fields;

export const vVaultResourceLinksState = object({
  resourceLinksOpen: vaultResourceLinksStateRow.resourceLinksOpen,
  vaultId: vaultResourceLinksStateRow.vaultId,
});
