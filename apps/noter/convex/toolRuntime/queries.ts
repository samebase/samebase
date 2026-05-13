import { Infer, v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { vPullRequestLabel } from "../schema";
import { isLiveConnectedVault } from "../vault/state";

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
  pullRequestLabels: optional(array(vPullRequestLabel)),
  pullRequestTitle: optional(string()),
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
    owner: string(),
    name: string(),
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

/**
 * A connected GitHub vault is ready only after its default branch tree is cached.
 */
function getDefaultBranchTree(
  ctx: Pick<QueryCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    defaultBranch: string;
  },
) {
  return ctx.db
    .query("vaultBranchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", args.vaultId).eq("branch", args.defaultBranch),
    )
    .first();
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
    return await Promise.all(
      vaults.filter(isLiveConnectedVault).map(async (vault) => {
        const defaultBranchTree = await getDefaultBranchTree(ctx, {
          vaultId: vault._id,
          defaultBranch: vault.defaultBranch,
        });
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

export const listVaultRemoteBranchesForUser = internalQuery({
  args: listVaultRemoteBranchesForUserArgsValidator,
  returns: listVaultRemoteBranchesForUserResultValidator,
  handler: async (
    ctx,
    args: ListVaultRemoteBranchesForUserArgs,
  ): Promise<ListVaultRemoteBranchesForUserResult> => {
    const vault = await ctx.db.get(args.vaultId);
    if (
      !vault ||
      vault.userId !== args.userId ||
      !isLiveConnectedVault(vault)
    ) {
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
      pullRequestLabels: branch.pullRequestLabels,
      pullRequestTitle: branch.pullRequestTitle,
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
    const vaultId = ctx.db.normalizeId("vaults", args.vaultId);
    if (!vaultId) {
      return null;
    }
    const vault = await ctx.db.get(vaultId);
    if (
      !vault ||
      vault.userId !== args.userId ||
      !isLiveConnectedVault(vault)
    ) {
      return null;
    }
    const defaultBranchTree = await getDefaultBranchTree(ctx, {
      vaultId: vault._id,
      defaultBranch: vault.defaultBranch,
    });
    return {
      _id: vault._id,
      userId: vault.userId,
      owner: vault.owner,
      name: vault.name,
      state: defaultBranchTree ? "ready" : "copying_files",
    };
  },
});
