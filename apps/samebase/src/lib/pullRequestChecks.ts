import type { RepositoryPullRequest } from "../../convex/repositoryPullRequests";

type CheckState = "success" | "failure" | "running" | "neutral" | "unknown";

export type PullRequestCheckSummary = {
  state: "none" | CheckState;
  totalCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  unknownCount: number;
};

function checkRunState(state: string): CheckState {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "ACTION_REQUIRED":
    case "CANCELLED":
    case "FAILURE":
    case "STALE":
    case "STARTUP_FAILURE":
    case "TIMED_OUT":
      return "failure";
    case "IN_PROGRESS":
    case "PENDING":
    case "QUEUED":
    case "WAITING":
      return "running";
    case "NEUTRAL":
    case "SKIPPED":
      return "neutral";
    case "COMPLETED":
      return "unknown";
    default:
      throw new Error(`Unknown GitHub check state: ${state}.`);
  }
}

function statusContextState(state: string): CheckState {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "ERROR":
    case "FAILURE":
      return "failure";
    case "EXPECTED":
    case "PENDING":
      return "running";
    default:
      throw new Error(`Unknown GitHub status state: ${state}.`);
  }
}

export function summarizePullRequestChecks(
  rollup: RepositoryPullRequest["statusCheckRollup"],
): PullRequestCheckSummary {
  if (rollup === null || rollup.contexts.totalCount === 0) {
    return {
      state: "none",
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    };
  }

  const totals = {
    successCount: 0,
    failureCount: 0,
    runningCount: 0,
    neutralCount: 0,
    unknownCount: 0,
  };
  const add = (state: CheckState, count: number) => {
    switch (state) {
      case "success":
        totals.successCount += count;
        break;
      case "failure":
        totals.failureCount += count;
        break;
      case "running":
        totals.runningCount += count;
        break;
      case "neutral":
        totals.neutralCount += count;
        break;
      case "unknown":
        totals.unknownCount += count;
        break;
      default:
        state satisfies never;
    }
  };
  for (const count of rollup.contexts.checkRunCountsByState) {
    add(checkRunState(count.state), count.count);
  }
  for (const count of rollup.contexts.statusContextCountsByState) {
    add(statusContextState(count.state), count.count);
  }

  const counted = Object.values(totals).reduce((total, count) => total + count, 0);
  if (
    rollup.contexts.checkRunCount + rollup.contexts.statusContextCount !==
      rollup.contexts.totalCount ||
    counted !== rollup.contexts.totalCount
  ) {
    throw new Error("GitHub returned inconsistent check counts.");
  }

  return {
    state:
      totals.failureCount > 0
        ? "failure"
        : totals.runningCount > 0
          ? "running"
          : totals.unknownCount > 0
            ? "unknown"
            : totals.successCount > 0
              ? "success"
              : "neutral",
    totalCount: rollup.contexts.totalCount,
    ...totals,
  };
}
