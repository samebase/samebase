import { Infer, v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { isLiveConnectedVault } from "../vaultState";

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

    return await Promise.all(
      vaults.filter(isLiveConnectedVault).map(async (vault) => {
        const defaultBranchTree = await ctx.db
          .query("vaultBranchTrees")
          .withIndex("by_vault_and_branch", (q) =>
            q.eq("vaultId", vault._id).eq("branch", vault.defaultBranch),
          )
          .first();
        return {
          vaultId: vault._id,
          repositoryFullName: `${vault.owner}/${vault.name}`,
          state: defaultBranchTree ? "ready" : "copying_files",
          isNoterManaged: vault.githubMode === "create_repository",
          commitSha: defaultBranchTree?.commitSHA,
        };
      }),
    );
  },
});
