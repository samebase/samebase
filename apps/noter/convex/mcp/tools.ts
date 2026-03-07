import { Infer, v } from "convex/values";
import { internalQuery } from "../_generated/server";

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
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();

    return vaults.map((vault) => ({
      vaultId: vault._id,
      repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      state: vault.state,
      isNoterManaged: vault.isNoterManaged ?? false,
      commitSha: vault.commitSHA,
      hostingProvider: vault.hostingProvider,
    }));
  },
});
