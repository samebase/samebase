import { Infer, v } from "convex/values";
import { internalQuery } from "../_generated/server";

const {
  array,
  boolean,
  id,
  literal,
  null: nullValue,
  number,
  object,
  optional,
  string,
  union,
} = v;

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

const listVaultRemoteBranchesForUserArgsValidator = object({
  userId: id("users"),
  vaultId: id("vaults"),
});
type ListVaultRemoteBranchesForUserArgs = Infer<
  typeof listVaultRemoteBranchesForUserArgsValidator
>;

const vaultRemoteBranchResultValidator = object({
  name: string(),
  headCommitSha: string(),
  lastCommitAt: optional(number()),
  aheadBy: optional(number()),
  behindBy: optional(number()),
  pullRequestUrl: optional(string()),
  pullRequestNumber: optional(number()),
  isDefault: boolean(),
  isProtected: boolean(),
  remoteState: union(literal("active"), literal("deleted_upstream")),
  deletedUpstreamAt: optional(number()),
  lastSyncedAt: number(),
});
type VaultRemoteBranchResult = Infer<typeof vaultRemoteBranchResultValidator>;

const listVaultRemoteBranchesForUserResultValidator = array(
  vaultRemoteBranchResultValidator,
);
type ListVaultRemoteBranchesForUserResult = Infer<
  typeof listVaultRemoteBranchesForUserResultValidator
>;

const getVaultContextForUserArgsValidator = object({
  userId: id("users"),
  vaultId: string(),
});
type GetVaultContextForUserArgs = Infer<
  typeof getVaultContextForUserArgsValidator
>;

const vaultContextForUserResultValidator = union(
  object({
    _id: id("vaults"),
    userId: id("users"),
    ghRepoOwner: string(),
    ghRepoName: string(),
    state: union(literal("copying_files"), literal("ready")),
  }),
  nullValue(),
);
type VaultContextForUserResult = Infer<
  typeof vaultContextForUserResultValidator
>;

function compareRemoteBranchSortOrder(
  left: VaultRemoteBranchResult,
  right: VaultRemoteBranchResult,
): number {
  if (left.remoteState !== right.remoteState) {
    return left.remoteState === "active" ? -1 : 1;
  }
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  const leftCommitAt = left.lastCommitAt ?? 0;
  const rightCommitAt = right.lastCommitAt ?? 0;
  if (leftCommitAt !== rightCommitAt) {
    return rightCommitAt - leftCommitAt;
  }
  return left.name.localeCompare(right.name);
}

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

export const listVaultRemoteBranchesForUser = internalQuery({
  args: listVaultRemoteBranchesForUserArgsValidator,
  returns: listVaultRemoteBranchesForUserResultValidator,
  handler: async (
    ctx,
    args: ListVaultRemoteBranchesForUserArgs,
  ): Promise<ListVaultRemoteBranchesForUserResult> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      return [];
    }

    const branches = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return branches.sort(compareRemoteBranchSortOrder).map((branch) => ({
      name: branch.name,
      headCommitSha: branch.headCommitSha,
      lastCommitAt: branch.lastCommitAt,
      aheadBy: branch.aheadBy,
      behindBy: branch.behindBy,
      pullRequestUrl: branch.pullRequestUrl,
      pullRequestNumber: branch.pullRequestNumber,
      isDefault: branch.isDefault,
      isProtected: branch.isProtected,
      remoteState: branch.remoteState,
      deletedUpstreamAt: branch.deletedUpstreamAt,
      lastSyncedAt: branch.lastSyncedAt,
    }));
  },
});

export const getVaultContextForUser = internalQuery({
  args: getVaultContextForUserArgsValidator,
  returns: vaultContextForUserResultValidator,
  handler: async (
    ctx,
    args: GetVaultContextForUserArgs,
  ): Promise<VaultContextForUserResult> => {
    const vaults = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const vault = vaults.find((item) => item._id === args.vaultId);
    if (!vault) {
      return null;
    }
    return {
      _id: vault._id,
      userId: vault.userId,
      ghRepoOwner: vault.ghRepoOwner,
      ghRepoName: vault.ghRepoName,
      state: vault.state,
    };
  },
});
