import { Infer, v } from "convex/values";

const { boolean, id, number, object } = v;

const vaultResourceLinksStateFields = {
  resourceLinksOpen: boolean(),
  vaultId: id("vaults"),
};

/**
 * No row means the vault header uses its default collapsed resource links.
 * Saved rows always store the user's explicit open or closed choice.
 */
export const vVaultResourceLinksState = object(vaultResourceLinksStateFields);
export type VaultResourceLinksState = Infer<typeof vVaultResourceLinksState>;

export const vVaultResourceLinksStateRow = object({
  userId: id("users"),
  updatedAt: number(),
  ...vaultResourceLinksStateFields,
});
