import { Infer, v } from "convex/values";

const { literal, null: vNull, number, object, string, union } = v;

const checkCountFields = {
  totalCount: number(),
  checkRunCount: number(),
  statusContextCount: number(),
  successCount: number(),
  failureCount: number(),
  runningCount: number(),
  neutralCount: number(),
  unknownCount: number(),
};

const vNoChecksSummary = object({
  state: literal("none"),
  totalCount: literal(0),
  checkRunCount: literal(0),
  statusContextCount: literal(0),
  successCount: literal(0),
  failureCount: literal(0),
  runningCount: literal(0),
  neutralCount: literal(0),
  unknownCount: literal(0),
});

const vPresentChecksSummary = object({
  state: union(
    literal("success"),
    literal("failure"),
    literal("running"),
    literal("neutral"),
    literal("unknown"),
  ),
  ...checkCountFields,
});

export const vCheckSummary = union(vNoChecksSummary, vPresentChecksSummary);
export type CheckSummary = Infer<typeof vCheckSummary>;

export type GitHubCheckStateCount = {
  state: string;
  count: number;
};

export type GitHubCheckCounts = {
  totalCount: number;
  checkRunCount: number;
  statusContextCount: number;
  checkRunCountsByState: readonly GitHubCheckStateCount[];
  statusContextCountsByState: readonly GitHubCheckStateCount[];
};

type CheckState = Exclude<CheckSummary["state"], "none">;
type CheckTotals = Pick<
  CheckSummary,
  "successCount" | "failureCount" | "runningCount" | "neutralCount" | "unknownCount"
>;

function addCheckCount(totals: CheckTotals, state: CheckState, count: number): void {
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
}

function checkRunState(state: string): CheckState {
  switch (state.toLowerCase()) {
    case "success":
      return "success";
    case "action_required":
    case "cancelled":
    case "failure":
    case "stale":
    case "startup_failure":
    case "timed_out":
      return "failure";
    case "in_progress":
    case "pending":
    case "queued":
    case "waiting":
      return "running";
    case "neutral":
    case "skipped":
      return "neutral";
    case "completed":
      return "unknown";
    default:
      throw new Error(`GitHub returned an unknown check run aggregate state: ${state}.`);
  }
}

function statusContextState(state: string): CheckState {
  switch (state.toLowerCase()) {
    case "success":
      return "success";
    case "error":
    case "failure":
      return "failure";
    case "expected":
    case "pending":
      return "running";
    default:
      throw new Error(`GitHub returned an unknown status aggregate state: ${state}.`);
  }
}

function addProviderCounts(args: {
  counts: readonly GitHubCheckStateCount[];
  expectedCount: number;
  classify: (state: string) => CheckState;
  totals: CheckTotals;
}): void {
  const seenStates = new Set<string>();
  let actualCount = 0;

  for (const entry of args.counts) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new Error("GitHub returned an invalid check aggregate count.");
    }

    const state = entry.state.toLowerCase();
    if (seenStates.has(state)) {
      throw new Error("GitHub returned a duplicate check aggregate state.");
    }
    seenStates.add(state);
    actualCount += entry.count;
    addCheckCount(args.totals, args.classify(state), entry.count);
  }

  if (actualCount !== args.expectedCount) {
    throw new Error("GitHub returned inconsistent check aggregate counts.");
  }
}

export function summarizeChecks(input: GitHubCheckCounts): CheckSummary {
  if (
    !Number.isSafeInteger(input.totalCount) ||
    input.totalCount < 0 ||
    !Number.isSafeInteger(input.checkRunCount) ||
    input.checkRunCount < 0 ||
    !Number.isSafeInteger(input.statusContextCount) ||
    input.statusContextCount < 0
  ) {
    throw new Error("GitHub returned invalid check counts.");
  }

  if (input.checkRunCount + input.statusContextCount !== input.totalCount) {
    throw new Error("GitHub returned inconsistent check counts.");
  }

  if (input.totalCount === 0) {
    if (input.checkRunCountsByState.length > 0 || input.statusContextCountsByState.length > 0) {
      throw new Error("GitHub returned aggregate states for an empty check rollup.");
    }

    return {
      state: "none",
      totalCount: 0,
      checkRunCount: 0,
      statusContextCount: 0,
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

  addProviderCounts({
    counts: input.checkRunCountsByState,
    expectedCount: input.checkRunCount,
    classify: checkRunState,
    totals,
  });
  addProviderCounts({
    counts: input.statusContextCountsByState,
    expectedCount: input.statusContextCount,
    classify: statusContextState,
    totals,
  });

  if (
    totals.successCount +
      totals.failureCount +
      totals.runningCount +
      totals.neutralCount +
      totals.unknownCount !==
    input.totalCount
  ) {
    throw new Error("GitHub check aggregate buckets are incomplete.");
  }

  const state = (() => {
    if (totals.failureCount > 0) return "failure";
    if (totals.runningCount > 0) return "running";
    if (totals.unknownCount > 0) return "unknown";
    if (totals.successCount > 0) return "success";
    return "neutral";
  })();

  return {
    state,
    totalCount: input.totalCount,
    checkRunCount: input.checkRunCount,
    statusContextCount: input.statusContextCount,
    ...totals,
  };
}

export const vPullRequestHeadIdentity = object({
  baseRepositoryNodeId: string(),
  pullRequestNodeId: string(),
  pullRequestNumber: number(),
  pullRequestUrl: string(),
  headRepositoryNodeId: union(string(), vNull()),
  headRefName: string(),
  headCommitNodeId: string(),
  headOid: string(),
});
export type PullRequestHeadIdentity = Infer<typeof vPullRequestHeadIdentity>;
