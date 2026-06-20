import { Infer, v } from "convex/values";

const { boolean, id, number, object } = v;

const vaultResourceLinksStateFields = {
  resourceLinksOpen: boolean(),
  vaultId: id("vaults"),
};

/**
 * New vault creation inserts an open row so the connection rail starts visible.
 * Missing rows still use the dashboard's collapsed fallback for legacy or directly seeded vaults.
 */
export const vVaultResourceLinksState = object(vaultResourceLinksStateFields);
export type VaultResourceLinksState = Infer<typeof vVaultResourceLinksState>;

export const vVaultResourceLinksStateRow = object({
  userId: id("users"),
  updatedAt: number(),
  ...vaultResourceLinksStateFields,
});
