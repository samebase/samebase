/*
The check state literals and the summary shape that the dashboard and repository:getStatus share.
The Convex validators in convex/repository/pullRequestModel.ts take their state literals from the
lists here, and summarizeRepositoryChecks there fills the summary.
*/

export const GITHUB_STATUS_STATES = ["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"] as const;
export const UNKNOWN_GITHUB_STATE = "UNKNOWN" as const;

export type RepositoryCheckState = "success" | "failure" | "running" | "neutral" | "unknown";

/** The counts of the newest run of each check of one commit. */
export type RepositoryCheckSummary = {
  state: "none" | RepositoryCheckState;
  totalCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  unknownCount: number;
};
