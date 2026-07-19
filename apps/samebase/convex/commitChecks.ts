import { Infer, v } from "convex/values";

import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  vCommitCheckSource,
  vCommitCheckState,
  type CommitCheckState,
  type GitHubCommitCheckSummary,
  vGithubCommitCheckSummary,
} from "./commitCheckModel";

const { array, number, object, optional, string } = v;

const commitCheckItemInputValidator = object({
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
});

type CommitCheckItemInput = Infer<typeof commitCheckItemInputValidator>;

export type GitHubCheckRunSnapshotInput = {
  id: number;
  name: string;
  status: string;
  conclusion?: string | null;
  detailsUrl?: string;
  htmlUrl?: string;
  appName?: string;
  appSlug?: string;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
};

export type GitHubCommitStatusSnapshotInput = {
  id: number;
  state: string;
  context: string;
  description?: string | null;
  targetUrl?: string | null;
  updatedAt?: string;
};

export async function getGitHubCommitCheckSummariesByCommitSha(
  ctx: Pick<QueryCtx, "db">,
  args: {
    githubRepositoryId: string;
    commitShas: Iterable<string>;
  },
): Promise<Map<string, GitHubCommitCheckSummary>> {
  const summariesByCommitSha = new Map<string, GitHubCommitCheckSummary>();
  const summaries = await Promise.all(
    Array.from(new Set(args.commitShas)).map(async (commitSha) => {
      return await ctx.db
        .query("derived_githubCommit_checkSummaries")
        .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
          q.eq("githubRepositoryId", args.githubRepositoryId).eq("commitSha", commitSha),
        )
        .first();
    }),
  );

  for (const summary of summaries) {
    if (summary) {
      summariesByCommitSha.set(summary.commitSha, summary);
    }
  }

  return summariesByCommitSha;
}

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

function isCloudflareWorkersAndPagesCheckRun(input: GitHubCheckRunSnapshotInput): boolean {
  const appSlug = input.appSlug?.toLowerCase();
  if (appSlug === "cloudflare-workers-and-pages") {
    return true;
  }

  const appName = input.appName?.toLowerCase();
  if (typeof appName === "string" && appName.includes("cloudflare")) {
    return true;
  }

  return input.name.toLowerCase().startsWith("workers builds:");
}

function readCloudflarePreviewStatus(input: GitHubCheckRunSnapshotInput): string {
  if (input.status === "queued") {
    return "Build queued";
  }
  if (input.status === "in_progress") {
    return "Build in progress";
  }
  if (input.status !== "completed") {
    return "Build pending";
  }

  switch (input.conclusion) {
    case "success":
      return "Build successful";
    case "failure":
    case "cancelled":
    case "timed_out":
    case "action_required":
    case "stale":
    case "startup_failure":
      return "Build failed";
    case "neutral":
    case "skipped":
      return "Build skipped";
    case undefined:
    case null:
      return "Build completed";
    default:
      return `Build ${input.conclusion.replace(/_/g, " ")}`;
  }
}

function classifyCheckRun(input: GitHubCheckRunSnapshotInput): CommitCheckState {
  if (input.status === "queued" || input.status === "in_progress") {
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
      return "running";
    default:
      return "unknown";
  }
}

function toOptionalString(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readCheckRunPreviewFields(
  input: GitHubCheckRunSnapshotInput,
): Pick<CommitCheckItemInput, "previewUrl" | "previewAliasUrl" | "previewStatus" | "logUrl"> {
  if (!isCloudflareWorkersAndPagesCheckRun(input)) {
    return {};
  }

  return {
    previewUrl: readHttpsUrl(readSummaryField(input.outputSummary, "Preview URL")),
    previewAliasUrl: readHttpsUrl(readSummaryField(input.outputSummary, "Preview Alias URL")),
    previewStatus: readCloudflarePreviewStatus(input),
    logUrl: readHttpsUrl(input.detailsUrl) ?? readHttpsUrl(input.htmlUrl),
  };
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
    detailsUrl,
    githubUrl,
    ...readCheckRunPreviewFields(input),
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

export function normalizeCommitCheckSnapshot(args: {
  checkRuns: GitHubCheckRunSnapshotInput[];
  statuses: GitHubCommitStatusSnapshotInput[];
}): CommitCheckItemInput[] {
  return [
    ...args.checkRuns.map(normalizeCommitCheckRun),
    ...args.statuses.map(normalizeCommitStatus),
  ].sort(compareCommitCheckItems);
}

function compareStatePriority(left: CommitCheckState, right: CommitCheckState): number {
  const priorities: Record<CommitCheckState, number> = {
    failure: 0,
    running: 1,
    unknown: 2,
    neutral: 3,
    success: 4,
  };
  return priorities[left] - priorities[right];
}

function compareCommitCheckItems(left: CommitCheckItemInput, right: CommitCheckItemInput): number {
  const statePriority = compareStatePriority(left.state, right.state);
  if (statePriority !== 0) {
    return statePriority;
  }

  const providerNameCompare = (left.providerName ?? "").localeCompare(right.providerName ?? "");
  if (providerNameCompare !== 0) {
    return providerNameCompare;
  }

  const nameCompare = left.name.localeCompare(right.name);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.sourceKey.localeCompare(right.sourceKey);
}

function selectPrimaryTargetUrl(items: CommitCheckItemInput[]): string | undefined {
  return items.find((item) => item.targetUrl)?.targetUrl;
}

function selectPrimaryLogUrl(items: CommitCheckItemInput[]): string | undefined {
  const item = items.find(
    (candidate) => candidate.logUrl ?? candidate.detailsUrl ?? candidate.targetUrl,
  );
  return item?.logUrl ?? item?.detailsUrl ?? item?.targetUrl;
}

export function selectBranchPreviewAliasUrlFromCommitCheckItems(
  items: readonly Pick<CommitCheckItemInput, "previewAliasUrl">[],
): string | undefined {
  return items.find((candidate) => candidate.previewAliasUrl)?.previewAliasUrl;
}

export function buildGitHubCommitCheckSummary(args: {
  githubRepositoryId: string;
  commitSha: string;
  items: CommitCheckItemInput[];
  syncedAt: number;
}): GitHubCommitCheckSummary {
  let checkRunCount = 0;
  let statusContextCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let runningCount = 0;
  let neutralCount = 0;
  let unknownCount = 0;

  for (const item of args.items) {
    if (item.source === "check_run") {
      checkRunCount += 1;
    } else {
      statusContextCount += 1;
    }

    switch (item.state) {
      case "success":
        successCount += 1;
        break;
      case "failure":
        failureCount += 1;
        break;
      case "running":
        runningCount += 1;
        break;
      case "neutral":
        neutralCount += 1;
        break;
      case "unknown":
        unknownCount += 1;
        break;
      default: {
        item.state satisfies never;
      }
    }
  }

  const totalCount = args.items.length;
  const state = (() => {
    if (failureCount > 0) {
      return "failure";
    }
    if (runningCount > 0) {
      return "running";
    }
    if (unknownCount > 0) {
      return "unknown";
    }
    if (successCount > 0) {
      return "success";
    }
    if (neutralCount > 0) {
      return "neutral";
    }
    return "unknown";
  })();

  return {
    githubRepositoryId: args.githubRepositoryId,
    commitSha: args.commitSha,
    state,
    totalCount,
    checkRunCount,
    statusContextCount,
    successCount,
    failureCount,
    runningCount,
    neutralCount,
    unknownCount,
    primaryTargetUrl: selectPrimaryTargetUrl(args.items),
    primaryLogUrl: selectPrimaryLogUrl(args.items),
    syncedAt: args.syncedAt,
  };
}

async function deleteGitHubCommitCheckItems(
  ctx: MutationCtx,
  args: {
    githubRepositoryId: string;
    commitSha: string;
  },
): Promise<void> {
  const existingItems = await ctx.db
    .query("observations_githubCommit_checks")
    .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
      q.eq("githubRepositoryId", args.githubRepositoryId).eq("commitSha", args.commitSha),
    )
    .collect();

  for (const item of existingItems) {
    await ctx.db.delete(item._id);
  }
}

async function deleteGitHubCommitCheckSummaries(
  ctx: MutationCtx,
  args: {
    githubRepositoryId: string;
    commitSha: string;
  },
): Promise<void> {
  const existingSummaries = await ctx.db
    .query("derived_githubCommit_checkSummaries")
    .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
      q.eq("githubRepositoryId", args.githubRepositoryId).eq("commitSha", args.commitSha),
    )
    .collect();

  for (const summary of existingSummaries) {
    await ctx.db.delete(summary._id);
  }
}

export async function deleteGitHubCommitChecksUnreferencedByBranches(
  ctx: MutationCtx,
  args: {
    githubRepositoryId: string;
    activeCommitShas: ReadonlySet<string>;
  },
): Promise<void> {
  const existingSummaries = await ctx.db
    .query("derived_githubCommit_checkSummaries")
    .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
      q.eq("githubRepositoryId", args.githubRepositoryId),
    )
    .collect();

  for (const summary of existingSummaries) {
    if (args.activeCommitShas.has(summary.commitSha)) {
      continue;
    }
    await deleteGitHubCommitCheckItems(ctx, {
      githubRepositoryId: args.githubRepositoryId,
      commitSha: summary.commitSha,
    });
    await ctx.db.delete(summary._id);
  }
}

export const replaceGitHubCommitChecks = internalMutation({
  args: {
    githubRepositoryId: string(),
    commitSha: string(),
    syncedAt: number(),
    items: array(commitCheckItemInputValidator),
  },
  returns: vGithubCommitCheckSummary,
  handler: async (ctx, args) => {
    const summary = buildGitHubCommitCheckSummary(args);

    await deleteGitHubCommitCheckItems(ctx, args);
    await deleteGitHubCommitCheckSummaries(ctx, args);
    for (const item of args.items) {
      await ctx.db.insert("observations_githubCommit_checks", {
        githubRepositoryId: args.githubRepositoryId,
        commitSha: args.commitSha,
        ...item,
        syncedAt: args.syncedAt,
      });
    }

    await ctx.db.insert("derived_githubCommit_checkSummaries", summary);

    return summary;
  },
});
