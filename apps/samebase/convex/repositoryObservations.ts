import { Infer, v } from "convex/values";

const { array, literal, null: vNull, number, object, string, union } = v;

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
  headRepositoryNodeId: union(string(), vNull()),
  headRefName: string(),
  headCommitNodeId: string(),
  headOid: string(),
});
export type PullRequestHeadIdentity = Infer<typeof vPullRequestHeadIdentity>;

export const vCloudflareBuildBranch = union(
  object({ state: literal("known"), name: string() }),
  object({ state: literal("unknown") }),
  object({
    state: literal("conflicting_evidence"),
    suiteBranch: union(string(), vNull()),
  }),
);
export type CloudflareBuildBranch = Infer<typeof vCloudflareBuildBranch>;

const vCloudflarePreviewPending = object({ state: literal("pending") });
const vCloudflarePreviewReady = object({
  state: literal("ready"),
  versionUrl: string(),
  branchAlias: union(
    object({ state: literal("not_provided") }),
    object({ state: literal("ready"), branchName: string(), url: string() }),
    object({
      state: literal("provider_unknown"),
      reason: union(literal("branch_unavailable"), literal("conflicting_branch_evidence")),
      providerUrl: string(),
    }),
  ),
});
const vCloudflarePreviewUnavailable = object({ state: literal("unavailable") });
const vCloudflarePreviewDisabled = object({ state: literal("disabled") });
const vCloudflarePreviewProviderUnknown = object({
  state: literal("provider_unknown"),
  reason: union(
    literal("configuration_unavailable"),
    literal("invalid_provider_output"),
    literal("unrecognized_build_state"),
  ),
});

export const vCloudflareBuildPreview = union(
  vCloudflarePreviewPending,
  vCloudflarePreviewReady,
  vCloudflarePreviewUnavailable,
  vCloudflarePreviewDisabled,
  vCloudflarePreviewProviderUnknown,
);
export type CloudflareBuildPreview = Infer<typeof vCloudflareBuildPreview>;

const cloudflareBuildFields = {
  source: union(
    object({ state: literal("github_check_run"), checkRunId: string() }),
    object({
      state: literal("cloudflare_build"),
      checkRunId: string(),
      buildId: string(),
    }),
  ),
  checkName: string(),
  workerName: string(),
  rootDirectory: union(
    object({ state: literal("known"), value: string() }),
    object({ state: literal("unknown") }),
  ),
  branch: vCloudflareBuildBranch,
  providerStatus: string(),
  providerConclusion: union(
    object({ state: literal("provided"), value: string() }),
    object({ state: literal("not_provided") }),
  ),
};

export const vCloudflareBuild = union(
  object({
    state: literal("queued"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewPending,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
  object({
    state: literal("running"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewPending,
      vCloudflarePreviewReady,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
  object({
    state: literal("success"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewReady,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
  object({
    state: literal("failure"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewUnavailable,
      vCloudflarePreviewReady,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
  object({
    state: literal("cancelled"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewUnavailable,
      vCloudflarePreviewReady,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
  object({
    state: literal("skipped"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewUnavailable,
      vCloudflarePreviewReady,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
  object({
    state: literal("provider_unknown"),
    ...cloudflareBuildFields,
    preview: union(
      vCloudflarePreviewReady,
      vCloudflarePreviewDisabled,
      vCloudflarePreviewProviderUnknown,
    ),
  }),
);
export type CloudflareBuild = Infer<typeof vCloudflareBuild>;

export type GitHubCloudflareBuildCheckRun = {
  id: string;
  name: string;
  status: string;
  conclusion?: string | null;
  outputSummary?: string;
  branch: CloudflareBuildBranch;
  rootDirectory?: string;
};

function normalizeHttpsUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.host.length === 0) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function readHttpsUrl(value: string): string | undefined {
  const markdownLink = value.match(/\[[^\]]+\]\((https:\/\/[^)\s]+)\)/i);
  if (markdownLink?.[1]) {
    return normalizeHttpsUrl(markdownLink[1]);
  }

  const plainUrl = value.match(/https:\/\/[^\s<>)\]]+/i);
  if (plainUrl?.[0]) {
    return normalizeHttpsUrl(plainUrl[0].replace(/[.,;]+$/, ""));
  }

  return undefined;
}

function readSummaryField(summary: string | undefined, label: string): string | undefined {
  if (summary === undefined) {
    return undefined;
  }

  const labelPrefix = `${label}:`.toLowerCase();
  for (const rawLine of summary.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s+/, "");
    if (!line.toLowerCase().startsWith(labelPrefix)) {
      continue;
    }

    const value = line.slice(labelPrefix.length).trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function readMarkdownLinkLabel(value: string | undefined): string | undefined {
  const match = value?.match(/^\[([^\]]+)\]\(https:\/\/[^)]+\)$/i);
  const label = match?.[1]?.trim();
  return label ? label : undefined;
}

function readCloudflareSummaryIdentifier(
  summary: string | undefined,
  label: string,
): string | undefined {
  const value = readSummaryField(summary, label);
  const identifier = readMarkdownLinkLabel(value) ?? value?.trim();
  return identifier ? identifier : undefined;
}

function classifyCloudflareBuildState(
  input: GitHubCloudflareBuildCheckRun,
): CloudflareBuild["state"] {
  switch (input.status.toLowerCase()) {
    case "queued":
    case "pending":
    case "requested":
    case "waiting":
      return "queued";
    case "in_progress":
      return "running";
    case "completed":
      break;
    default:
      return "provider_unknown";
  }

  switch (input.conclusion?.toLowerCase()) {
    case "success":
      return "success";
    case "cancelled":
      return "cancelled";
    case "neutral":
    case "skipped":
      return "skipped";
    case "failure":
    case "timed_out":
    case "action_required":
    case "stale":
    case "startup_failure":
      return "failure";
    default:
      return "provider_unknown";
  }
}

type CloudflarePreviewEvidence =
  | { state: "absent" }
  | { state: "invalid" }
  | {
      state: "ready";
      preview: Extract<CloudflareBuildPreview, { state: "ready" }>;
    };

function readCloudflarePreviewEvidence(
  input: GitHubCloudflareBuildCheckRun,
): CloudflarePreviewEvidence {
  const rawVersionUrl = readSummaryField(input.outputSummary, "Preview URL");
  const rawBranchUrl = readSummaryField(input.outputSummary, "Preview Alias URL");
  if (rawVersionUrl === undefined) {
    return rawBranchUrl === undefined ? { state: "absent" } : { state: "invalid" };
  }

  const versionUrl = readHttpsUrl(rawVersionUrl);
  const branchUrl = rawBranchUrl === undefined ? undefined : readHttpsUrl(rawBranchUrl);
  if (versionUrl === undefined || (rawBranchUrl !== undefined && branchUrl === undefined)) {
    return { state: "invalid" };
  }

  return {
    state: "ready",
    preview: {
      state: "ready",
      versionUrl,
      branchAlias: branchUrl
        ? input.branch.state === "known"
          ? { state: "ready", branchName: input.branch.name, url: branchUrl }
          : {
              state: "provider_unknown",
              reason:
                input.branch.state === "conflicting_evidence"
                  ? "conflicting_branch_evidence"
                  : "branch_unavailable",
              providerUrl: branchUrl,
            }
        : { state: "not_provided" },
    },
  };
}

function readCloudflareWorkerName(input: GitHubCloudflareBuildCheckRun): string {
  const summaryName = readCloudflareSummaryIdentifier(input.outputSummary, "Script");
  if (summaryName) {
    return summaryName;
  }

  const prefix = "workers builds:";
  if (input.name.toLowerCase().startsWith(prefix)) {
    const suffix = input.name.slice(prefix.length).trim();
    if (suffix) {
      return suffix;
    }
  }

  return input.name;
}

export function normalizeCloudflareBuild(input: GitHubCloudflareBuildCheckRun): CloudflareBuild {
  if (input.id.length === 0 || input.name.length === 0) {
    throw new Error("GitHub returned a Cloudflare check run without an identity.");
  }

  const state = classifyCloudflareBuildState(input);
  const buildId = readCloudflareSummaryIdentifier(input.outputSummary, "Build ID");
  const common = {
    source: buildId
      ? { state: "cloudflare_build", checkRunId: input.id, buildId }
      : { state: "github_check_run", checkRunId: input.id },
    checkName: input.name,
    workerName: readCloudflareWorkerName(input),
    rootDirectory:
      input.rootDirectory === undefined || input.rootDirectory.length === 0
        ? { state: "unknown" }
        : { state: "known", value: input.rootDirectory },
    branch: input.branch,
    providerStatus: input.status,
    providerConclusion:
      input.conclusion && input.conclusion.length > 0
        ? { state: "provided", value: input.conclusion }
        : { state: "not_provided" },
  } satisfies Omit<CloudflareBuild, "state" | "preview">;
  const previewEvidence = readCloudflarePreviewEvidence(input);

  switch (state) {
    case "queued":
      return {
        state,
        ...common,
        preview:
          previewEvidence.state === "absent"
            ? { state: "pending" }
            : { state: "provider_unknown", reason: "invalid_provider_output" },
      };
    case "running":
      return {
        state,
        ...common,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : previewEvidence.state === "invalid"
              ? { state: "provider_unknown", reason: "invalid_provider_output" }
              : { state: "pending" },
      };
    case "success":
      return {
        state,
        ...common,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : {
                state: "provider_unknown",
                reason:
                  previewEvidence.state === "invalid"
                    ? "invalid_provider_output"
                    : "configuration_unavailable",
              },
      };
    case "failure":
    case "cancelled":
    case "skipped":
      return {
        state,
        ...common,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : previewEvidence.state === "invalid"
              ? { state: "provider_unknown", reason: "invalid_provider_output" }
              : { state: "unavailable" },
      };
    case "provider_unknown":
      return {
        state,
        ...common,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : {
                state: "provider_unknown",
                reason:
                  previewEvidence.state === "invalid"
                    ? "invalid_provider_output"
                    : "unrecognized_build_state",
              },
      };
    default: {
      state satisfies never;
      throw new Error("Cloudflare build state was not classified.");
    }
  }
}

const vNonEmptyCloudflareBuildList = object({
  first: vCloudflareBuild,
  rest: array(vCloudflareBuild),
});

const vLastKnownCloudflareBuildObservation = union(
  object({ state: literal("ready"), builds: vNonEmptyCloudflareBuildList }),
  object({ state: literal("fresh_absence") }),
);

const vObservationBudgetReason = union(literal("rate_limit"), literal("request_budget"));
const vObservationUnavailableReason = union(
  literal("github_connection_unavailable"),
  literal("repository_unavailable"),
  literal("head_unavailable"),
  literal("head_changed"),
  literal("pagination_guardrail"),
);
const vObservationFailureReason = union(
  literal("request_failed"),
  literal("invalid_response"),
  literal("incomplete_response"),
);

const vObservationRefreshProblem = union(
  object({
    state: literal("budget_deferred"),
    reason: vObservationBudgetReason,
    retryAt: number(),
  }),
  object({
    state: literal("provider_unavailable"),
    reason: vObservationUnavailableReason,
  }),
  object({
    state: literal("provider_failure"),
    reason: vObservationFailureReason,
  }),
);

const vObservationRefreshState = union(
  object({ state: literal("not_requested") }),
  object({ state: literal("loading") }),
  vObservationRefreshProblem,
);

export const vCloudflareBuildObservationResult = union(
  object({
    state: literal("ready"),
    head: vPullRequestHeadIdentity,
    observedAt: number(),
    builds: vNonEmptyCloudflareBuildList,
  }),
  object({
    state: literal("fresh_absence"),
    head: vPullRequestHeadIdentity,
    observedAt: number(),
  }),
  object({
    state: literal("stale"),
    head: vPullRequestHeadIdentity,
    observedAt: number(),
    lastKnown: vLastKnownCloudflareBuildObservation,
    refresh: vObservationRefreshState,
  }),
  object({
    state: literal("budget_deferred"),
    head: vPullRequestHeadIdentity,
    reason: vObservationBudgetReason,
    retryAt: number(),
  }),
  object({
    state: literal("provider_unavailable"),
    head: vPullRequestHeadIdentity,
    reason: vObservationUnavailableReason,
  }),
  object({
    state: literal("provider_failure"),
    head: vPullRequestHeadIdentity,
    reason: vObservationFailureReason,
  }),
);
export type CloudflareBuildObservationResult = Infer<typeof vCloudflareBuildObservationResult>;
