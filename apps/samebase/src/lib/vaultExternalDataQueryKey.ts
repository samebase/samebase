import type { Id } from "../../convex/_generated/dataModel";

export function vaultExternalDataQueryKey(vaultId: Id<"vaults"> | undefined) {
  return ["vault-external-data", vaultId] as const;
}
