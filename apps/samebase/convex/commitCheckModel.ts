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

export const githubCommitCheckTables = {
  /** Recomputable status summary derived from the current check rows for one GitHub commit. */
  derived_githubCommit_checkSummaries: defineTable({
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
  observations_githubCommit_checks: defineTable({
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

export const vGithubCommitCheckSummary =
  githubCommitCheckTables.derived_githubCommit_checkSummaries.validator;
export type GitHubCommitCheckSummary = Infer<typeof vGithubCommitCheckSummary>;

const commitCheckSummary = vGithubCommitCheckSummary.fields;

export const vVaultBranchCommitChecksSummary = object({
  state: commitCheckSummary.state,
  totalCount: commitCheckSummary.totalCount,
  checkRunCount: commitCheckSummary.checkRunCount,
  statusContextCount: commitCheckSummary.statusContextCount,
  successCount: commitCheckSummary.successCount,
  failureCount: commitCheckSummary.failureCount,
  runningCount: commitCheckSummary.runningCount,
  neutralCount: commitCheckSummary.neutralCount,
  unknownCount: commitCheckSummary.unknownCount,
  primaryTargetUrl: commitCheckSummary.primaryTargetUrl,
  primaryLogUrl: commitCheckSummary.primaryLogUrl,
  syncedAt: commitCheckSummary.syncedAt,
});
export type VaultBranchCommitChecksSummary = Infer<typeof vVaultBranchCommitChecksSummary>;
