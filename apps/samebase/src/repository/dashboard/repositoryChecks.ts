import type { RepositoryCheckSummary } from "../../../convex/repository/pullRequestModel";

export function formatRepositoryCheckSummary(checks: RepositoryCheckSummary): string {
  switch (checks.state) {
    case "none":
      return "No checks";
    case "success":
      return `${checks.successCount}/${checks.totalCount} passed`;
    case "failure":
      return `${checks.failureCount}/${checks.totalCount} failed`;
    case "running":
      return `${checks.runningCount}/${checks.totalCount} pending`;
    case "neutral":
      return `${checks.neutralCount}/${checks.totalCount} neutral`;
    case "unknown":
      return `${checks.unknownCount}/${checks.totalCount} unknown`;
    default:
      checks.state satisfies never;
      return "Checks unavailable";
  }
}
