import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { number, object, optional, string, literal, union } = v;

export const vCommitCheckSource = union(literal("check_run"), literal("commit_status"));

export const vCommitCheckState = union(
  literal("success"),
  literal("failure"),
  literal("running"),
  literal("neutral"),
  literal("unknown"),
);
export type CommitCheckState = Infer<typeof vCommitCheckState>;

export const commitCheckTables = {
  /** Current GitHub check/status summary for one commit in one repository. */
  observations_vaultCommitCheckSnapshots: defineTable({
    githubRepositoryId: string(),
    commitSha: string(),
    state: vCommitCheckState,
    totalCount: number(),
    checkRunCount: number(),
    statusContextCount: number(),
    successCount: number(),
    failureCount: number(),
    runningCount: number(),
    neutralCount: number(),
    unknownCount: number(),
    primaryTargetUrl: optional(string()),
    primaryLogUrl: optional(string()),
    syncedAt: number(),
  }).index("by_githubRepositoryId_and_commitSha", ["githubRepositoryId", "commitSha"]),

  /** One current GitHub check run or commit status for a commit in one repository. */
  observations_vaultCommitChecks: defineTable({
    githubRepositoryId: string(),
    commitSha: string(),
    source: vCommitCheckSource,
    sourceKey: string(),
    name: string(),
    providerName: optional(string()),
    state: vCommitCheckState,
    status: string(),
    conclusion: optional(string()),
    targetUrl: optional(string()),
    detailsUrl: optional(string()),
    githubUrl: optional(string()),
    previewUrl: optional(string()),
    previewAliasUrl: optional(string()),
    previewStatus: optional(string()),
    logUrl: optional(string()),
    startedAt: optional(number()),
    completedAt: optional(number()),
    updatedAt: optional(number()),
    syncedAt: number(),
  }).index("by_githubRepositoryId_and_commitSha", ["githubRepositoryId", "commitSha"]),
};

export const vGithubCommitCheckSnapshot =
  commitCheckTables.observations_vaultCommitCheckSnapshots.validator;
export type GitHubCommitCheckSnapshot = Infer<typeof vGithubCommitCheckSnapshot>;

const commitCheckSnapshot = vGithubCommitCheckSnapshot.fields;

export const vVaultBranchCommitChecksSummary = object({
  state: commitCheckSnapshot.state,
  totalCount: commitCheckSnapshot.totalCount,
  checkRunCount: commitCheckSnapshot.checkRunCount,
  statusContextCount: commitCheckSnapshot.statusContextCount,
  successCount: commitCheckSnapshot.successCount,
  failureCount: commitCheckSnapshot.failureCount,
  runningCount: commitCheckSnapshot.runningCount,
  neutralCount: commitCheckSnapshot.neutralCount,
  unknownCount: commitCheckSnapshot.unknownCount,
  primaryTargetUrl: commitCheckSnapshot.primaryTargetUrl,
  primaryLogUrl: commitCheckSnapshot.primaryLogUrl,
  syncedAt: commitCheckSnapshot.syncedAt,
});
export type VaultBranchCommitChecksSummary = Infer<typeof vVaultBranchCommitChecksSummary>;
