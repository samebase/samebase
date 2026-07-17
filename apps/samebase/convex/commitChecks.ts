import { Infer, v } from "convex/values";

import type {
  RepositoryInventoryCheckSummary,
  RepositoryInventoryCloudflareBuild,
  RepositoryInventoryCloudflareBuildState,
} from "./repositoryInventoryModel";

const { literal, number, object, optional, string, union } = v;

const vCommitCheckSource = union(literal("check_run"), literal("commit_status"));
const vCommitCheckState = union(
  literal("success"),
  literal("failure"),
  literal("running"),
  literal("neutral"),
  literal("unknown"),
);
type CommitCheckState = Infer<typeof vCommitCheckState>;

type RepositoryInventoryCheckTotals = Pick<
  RepositoryInventoryCheckSummary,
  "successCount" | "failureCount" | "runningCount" | "neutralCount" | "unknownCount"
>;

const commitCheckItemInputValidator = object({
  source: vCommitCheckSource,
  sourceKey: string(),
  name: string(),
  providerName: optional(string()),
  state: vCommitCheckState,
  status: string(),
  conclusion: optional(string()),
  targetUrl: optional(string()),
  githubUrl: optional(string()),
  startedAt: optional(number()),
  completedAt: optional(number()),
  updatedAt: optional(number()),
});

export type CommitCheckItemInput = Infer<typeof commitCheckItemInputValidator>;

export type GitHubCheckRunSnapshotInput = {
  id: string | number;
  name: string;
  status: string;
  conclusion?: string | null;
  detailsUrl?: string;
  htmlUrl?: string;
  appName?: string;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
};

export type GitHubCommitStatusSnapshotInput = {
  id: string | number;
  state: string;
  context: string;
  description?: string | null;
  targetUrl?: string | null;
  updatedAt?: string;
};

export type GitHubCheckStateCountInput = {
  state: string;
  count: number;
};

export type GitHubCheckCountsSnapshotInput = {
  totalCount: number;
  checkRunCount: number;
  statusContextCount: number;
  checkRunCountsByState: GitHubCheckStateCountInput[];
  statusContextCountsByState: GitHubCheckStateCountInput[];
};

export type GitHubCloudflareBuildSnapshotInput = GitHubCheckRunSnapshotInput & {
  branch:
    | { state: "known"; name: string }
    | { state: "unknown" }
    | { state: "conflicting_evidence"; suiteBranch: string | null };
  rootDirectory?: string;
};

function parseGitTimestamp(value: string | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return timestamp;
}

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

function readHttpsUrl(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const markdownLink = value.match(/\[[^\]]+\]\((https:\/\/[^)\s]+)\)/i);
  if (typeof markdownLink?.[1] === "string") {
    return normalizeHttpsUrl(markdownLink[1]);
  }

  const plainUrl = value.match(/https:\/\/[^\s<>)\]]+/i);
  if (typeof plainUrl?.[0] === "string") {
    return normalizeHttpsUrl(plainUrl[0].replace(/[.,;]+$/, ""));
  }

  return undefined;
}

function readSummaryField(summary: string | undefined, label: string): string | undefined {
  if (typeof summary !== "string") {
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

function classifyCheckRun(input: GitHubCheckRunSnapshotInput): CommitCheckState {
  if (
    input.status === "queued" ||
    input.status === "in_progress" ||
    input.status === "pending" ||
    input.status === "requested" ||
    input.status === "waiting"
  ) {
    return "running";
  }

  if (input.status === "completed") {
    switch (input.conclusion) {
      case "success":
        return "success";
      case "failure":
      case "cancelled":
      case "timed_out":
      case "action_required":
      case "stale":
      case "startup_failure":
        return "failure";
      case "neutral":
      case "skipped":
        return "neutral";
      case undefined:
      case null:
        return "unknown";
      default:
        return "unknown";
    }
  }

  return "unknown";
}

function classifyCommitStatus(input: GitHubCommitStatusSnapshotInput): CommitCheckState {
  switch (input.state) {
    case "success":
      return "success";
    case "error":
    case "failure":
      return "failure";
    case "pending":
    case "expected":
      return "running";
    default:
      return "unknown";
  }
}

function classifyCloudflareBuildState(
  input: GitHubCheckRunSnapshotInput,
): RepositoryInventoryCloudflareBuildState {
  switch (input.status) {
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

  switch (input.conclusion) {
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
    case undefined:
    case null:
      return "provider_unknown";
    default:
      return "provider_unknown";
  }
}

type CloudflarePreviewEvidence =
  | { state: "absent" }
  | { state: "invalid" }
  | {
      state: "ready";
      preview: Extract<RepositoryInventoryCloudflareBuild["preview"], { state: "ready" }>;
    };

function readCloudflarePreviewEvidence(
  input: GitHubCloudflareBuildSnapshotInput,
): CloudflarePreviewEvidence {
  const rawVersionUrl = readSummaryField(input.outputSummary, "Preview URL");
  if (rawVersionUrl === undefined) {
    return { state: "absent" };
  }
  const versionUrl = readHttpsUrl(rawVersionUrl);
  if (versionUrl === undefined) {
    return { state: "invalid" };
  }
  const rawBranchUrl = readSummaryField(input.outputSummary, "Preview Alias URL");
  const branchUrl = rawBranchUrl === undefined ? undefined : readHttpsUrl(rawBranchUrl);
  if (rawBranchUrl !== undefined && branchUrl === undefined) {
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

function readCloudflareWorkerName(input: GitHubCheckRunSnapshotInput): string {
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

export function normalizeCloudflareBuildCheckRun(
  input: GitHubCloudflareBuildSnapshotInput,
): RepositoryInventoryCloudflareBuild {
  const state = classifyCloudflareBuildState(input);
  const providerBuildId = readCloudflareSummaryIdentifier(input.outputSummary, "Build ID");
  const common: Pick<
    RepositoryInventoryCloudflareBuild,
    | "sourceKey"
    | "checkName"
    | "workerName"
    | "rootDirectory"
    | "branch"
    | "providerStatus"
    | "providerConclusion"
    | "providerBuildId"
    | "detailsUrl"
    | "githubUrl"
    | "startedAt"
    | "completedAt"
  > = {
    sourceKey:
      providerBuildId === undefined
        ? `github-check-run:${String(input.id)}`
        : `cloudflare-build:${providerBuildId}`,
    checkName: input.name,
    workerName: readCloudflareWorkerName(input),
    rootDirectory:
      input.rootDirectory === undefined
        ? { state: "unknown" }
        : { state: "known", value: input.rootDirectory },
    branch: input.branch,
    providerStatus: input.status,
    providerConclusion: toOptionalString(input.conclusion),
    providerBuildId,
    detailsUrl: readHttpsUrl(input.detailsUrl),
    githubUrl: readHttpsUrl(input.htmlUrl),
    startedAt: parseGitTimestamp(input.startedAt),
    completedAt: parseGitTimestamp(input.completedAt),
  };
  const previewEvidence = readCloudflarePreviewEvidence(input);
  switch (state) {
    case "queued":
      return {
        ...common,
        state,
        preview:
          previewEvidence.state !== "absent"
            ? { state: "provider_unknown", reason: "invalid_provider_output" }
            : { state: "pending" },
      };
    case "running":
      return {
        ...common,
        state,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : previewEvidence.state === "invalid"
              ? { state: "provider_unknown", reason: "invalid_provider_output" }
              : { state: "pending" },
      };
    case "success":
      return {
        ...common,
        state,
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
      return {
        ...common,
        state,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : previewEvidence.state === "invalid"
              ? { state: "provider_unknown", reason: "invalid_provider_output" }
              : { state: "unavailable" },
      };
    case "cancelled":
      return {
        ...common,
        state,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : previewEvidence.state === "invalid"
              ? { state: "provider_unknown", reason: "invalid_provider_output" }
              : { state: "unavailable" },
      };
    case "skipped":
      return {
        ...common,
        state,
        preview:
          previewEvidence.state === "ready"
            ? previewEvidence.preview
            : previewEvidence.state === "invalid"
              ? { state: "provider_unknown", reason: "invalid_provider_output" }
              : { state: "unavailable" },
      };
    case "provider_unknown":
      return {
        ...common,
        state,
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

function addCheckCount(
  totals: RepositoryInventoryCheckTotals,
  state: CommitCheckState,
  count: number,
): void {
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
    default: {
      state satisfies never;
    }
  }
}

function checkRunState(state: string): CommitCheckState {
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

function statusContextState(state: string): CommitCheckState {
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
  counts: readonly GitHubCheckStateCountInput[];
  expectedCount: number;
  classify: (state: string) => CommitCheckState;
  totals: RepositoryInventoryCheckTotals;
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

export function buildRepositoryInventoryCheckSummaryFromCounts(
  input: GitHubCheckCountsSnapshotInput,
): RepositoryInventoryCheckSummary {
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
    if (totals.neutralCount > 0) return "neutral";
    return "unknown";
  })();
  return {
    state,
    totalCount: input.totalCount,
    checkRunCount: input.checkRunCount,
    statusContextCount: input.statusContextCount,
    ...totals,
  };
}

function toOptionalString(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeCommitCheckRun(input: GitHubCheckRunSnapshotInput): CommitCheckItemInput {
  const startedAt = parseGitTimestamp(input.startedAt);
  const completedAt = parseGitTimestamp(input.completedAt);
  const detailsUrl = readHttpsUrl(input.detailsUrl);
  const githubUrl = readHttpsUrl(input.htmlUrl);

  return {
    source: "check_run",
    sourceKey: String(input.id),
    name: input.name,
    providerName: input.appName,
    state: classifyCheckRun(input),
    status: input.status,
    conclusion: toOptionalString(input.conclusion),
    targetUrl: detailsUrl ?? githubUrl,
    githubUrl,
    startedAt,
    completedAt,
    updatedAt: completedAt ?? startedAt,
  };
}

export function normalizeCommitStatus(
  input: GitHubCommitStatusSnapshotInput,
): CommitCheckItemInput {
  const targetUrl = readHttpsUrl(input.targetUrl ?? undefined);

  return {
    source: "commit_status",
    sourceKey: String(input.id),
    name: input.context,
    state: classifyCommitStatus(input),
    status: input.state,
    conclusion: toOptionalString(input.description),
    targetUrl,
    updatedAt: parseGitTimestamp(input.updatedAt),
  };
}
