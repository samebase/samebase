import type { RepositorySummaryCheckState } from "./repositorySummaryModel";

export const GITHUB_STATUS_CHECK_ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;

export type GitHubStatusCheckRollupState = (typeof GITHUB_STATUS_CHECK_ROLLUP_STATES)[number];

export function repositorySummaryCheckStateFromGitHubRollup(
  state: GitHubStatusCheckRollupState | null,
): RepositorySummaryCheckState {
  switch (state) {
    case null:
      return "none";
    case "SUCCESS":
      return "success";
    case "ERROR":
    case "FAILURE":
      return "failure";
    case "EXPECTED":
    case "PENDING":
      return "running";
    default:
      return state satisfies never;
  }
}
