import type { RepositoryStatusCheckCounts } from "../../../convex/repository/pullRequestModel";

type CheckState = "success" | "failure" | "running" | "neutral" | "unknown";
type StatusCheckCounts = NonNullable<RepositoryStatusCheckCounts>;
type CheckRunProviderState =
  StatusCheckCounts["contexts"]["checkRunCountsByState"][number]["state"];
type StatusContextProviderState =
  StatusCheckCounts["contexts"]["statusContextCountsByState"][number]["state"];

export type RepositoryCheckSummary = {
  state: "none" | CheckState;
  totalCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  unknownCount: number;
};

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

function checkRunState(state: CheckRunProviderState): CheckState {
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
    case "UNKNOWN":
      return "unknown";
    default:
      state satisfies never;
      return "unknown";
  }
}

function statusContextState(state: StatusContextProviderState): CheckState {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "ERROR":
    case "FAILURE":
      return "failure";
    case "EXPECTED":
    case "PENDING":
      return "running";
    case "UNKNOWN":
      return "unknown";
    default:
      state satisfies never;
      return "unknown";
  }
}

export function summarizeRepositoryChecks(
  rollup: RepositoryStatusCheckCounts,
): RepositoryCheckSummary {
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
