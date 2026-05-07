import { Infer, v } from "convex/values";
import { internalQuery } from "../_generated/server";
import {
  getConnectedVaultHostingProvider,
  isConnectedVault,
  isNoterManagedVault,
} from "../vaultState";

const { array, boolean, id, literal, object, optional, string, union } = v;

const listVaultsForUserArgsValidator = object({
  userId: id("users"),
});
type ListVaultsForUserArgs = Infer<typeof listVaultsForUserArgsValidator>;

const listVaultsForUserResultValidator = array(
  object({
    vaultId: id("vaults"),
    repositoryFullName: string(),
    state: union(literal("copying_files"), literal("ready")),
    isNoterManaged: boolean(),
    commitSha: optional(string()),
    hostingProvider: optional(string()),
  }),
);
type ListVaultsForUserResult = Infer<typeof listVaultsForUserResultValidator>;

export const listVaultsForUser = internalQuery({
  args: listVaultsForUserArgsValidator,
  returns: listVaultsForUserResultValidator,
  handler: async (
    ctx,
    args: ListVaultsForUserArgs,
  ): Promise<ListVaultsForUserResult> => {
    const vaults = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return vaults.filter(isConnectedVault).map((vault) => ({
      vaultId: vault._id,
      repositoryFullName: `${vault.owner}/${vault.name}`,
      state: "ready",
      isNoterManaged: isNoterManagedVault(vault),
      commitSha: vault.commitSHA,
      hostingProvider: getConnectedVaultHostingProvider(vault),
    }));
  },
});
