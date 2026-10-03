/*
The summary of every check of one commit, from GitHub's aggregate counts by state. The dashboard and
repository:getStatus share it. The Convex validators of the counts in
convex/repository/pullRequestModel.ts take their state literals from the lists here.
*/

export const GITHUB_CHECK_RUN_STATES = [
  "ACTION_REQUIRED",
  "CANCELLED",
  "COMPLETED",
  "FAILURE",
  "IN_PROGRESS",
  "NEUTRAL",
  "PENDING",
  "QUEUED",
  "SKIPPED",
  "STALE",
  "STARTUP_FAILURE",
  "SUCCESS",
  "TIMED_OUT",
  "WAITING",
] as const;
export const GITHUB_STATUS_STATES = ["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"] as const;
export const UNKNOWN_GITHUB_STATE = "UNKNOWN" as const;

type CheckRunProviderState = (typeof GITHUB_CHECK_RUN_STATES)[number] | typeof UNKNOWN_GITHUB_STATE;
type StatusContextProviderState =
  | (typeof GITHUB_STATUS_STATES)[number]
  | typeof UNKNOWN_GITHUB_STATE;

export type RepositoryCheckState = "success" | "failure" | "running" | "neutral" | "unknown";

/** The counts of every check of one commit, from GitHub's aggregate counts by state. */
export type RepositoryCheckSummary = {
  state: "none" | RepositoryCheckState;
  totalCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  unknownCount: number;
};

/** The parts of a commit's check rollup that the summary reads; null when GitHub has none. */
type RepositoryCheckCounts = {
  contexts: {
    totalCount: number;
    checkRunCountsByState: ReadonlyArray<{ state: CheckRunProviderState; count: number }>;
    statusContextCountsByState: ReadonlyArray<{ state: StatusContextProviderState; count: number }>;
  };
} | null;

function classifyCheckRunCount(state: CheckRunProviderState): RepositoryCheckState {
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

function classifyStatusContextCount(state: StatusContextProviderState): RepositoryCheckState {
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

/**
Summarizes every check of one commit from GitHub's aggregate counts. A rollup lists only its first
100 check nodes, so the counts never come from the nodes.
*/
export function summarizeRepositoryChecks(rollup: RepositoryCheckCounts): RepositoryCheckSummary {
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
  const add = (state: RepositoryCheckState, count: number) => {
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
    add(classifyCheckRunCount(count.state), count.count);
  }
  for (const count of rollup.contexts.statusContextCountsByState) {
    add(classifyStatusContextCount(count.state), count.count);
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
