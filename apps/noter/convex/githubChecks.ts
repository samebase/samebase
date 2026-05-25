"use node";

import { action } from "./_generated/server";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { Octokit } from "@octokit/rest";
import { describeRepositoryTreeRefreshFailure } from "./github";
import { isObjectRecord as isRecord } from "./jsonUtils";

const { array, literal, number, object, string, union } = v;

const checkRunValidator = object({
  id: number(),
  name: string(),
  status: string(),
  conclusion: union(string(), v.null()),
  html_url: string(),
});

const commitStatusValidator = object({
  id: number(),
  state: string(),
  context: string(),
  description: union(string(), v.null()),
  target_url: union(string(), v.null()),
});

const commitStatusOkResultValidator = object({
  kind: literal("ok"),
  check_runs: array(checkRunValidator),
  statuses: array(commitStatusValidator),
});

const commitStatusRateLimitedResultValidator = object({
  kind: literal("rate_limited"),
  message: string(),
  resetAtMs: union(number(), v.null()),
  retryAfterMs: union(number(), v.null()),
});

const commitStatusCooldownResultValidator = object({
  kind: literal("cooldown"),
  message: string(),
  cooldownUntilMs: number(),
});

const commitStatusResultValidator = union(
  commitStatusOkResultValidator,
  commitStatusCooldownResultValidator,
  commitStatusRateLimitedResultValidator,
);

type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;

type CommitStatusResult = Infer<typeof commitStatusResultValidator>;
type CommitStatusOkResult = Infer<typeof commitStatusOkResultValidator>;
type CommitStatusCooldownResult = Infer<typeof commitStatusCooldownResultValidator>;
type CommitStatusRateLimitedResult = Infer<typeof commitStatusRateLimitedResultValidator>;

function readSharedCooldownMessage(vault: {
  treeRefreshFailureKind?: "failed" | "rate_limited";
  treeRefreshFailureMessage?: string;
}): string {
  if (
    typeof vault.treeRefreshFailureMessage === "string" &&
    vault.treeRefreshFailureMessage.length > 0
  ) {
    return vault.treeRefreshFailureMessage;
  }

  return vault.treeRefreshFailureKind === "rate_limited"
    ? "GitHub API rate limited. Auto-refresh paused."
    : "GitHub sync failed. Showing cached state.";
}

function toHeaderMap(value: unknown): HeaderMap | null {
  if (!isRecord(value)) {
    return null;
  }

  const headers: HeaderMap = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (
      typeof headerValue === "string" ||
      typeof headerValue === "number" ||
      headerValue === undefined
    ) {
      headers[key] = headerValue;
      continue;
    }

    if (Array.isArray(headerValue) && headerValue.every((item) => typeof item === "string")) {
      headers[key] = headerValue;
    }
  }

  return headers;
}

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const status = error.status;
  return typeof status === "number" ? status : null;
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) {
    return "GitHub API rate limit exceeded.";
  }
  const message = error.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  return "GitHub API rate limit exceeded.";
}

function getErrorHeaders(error: unknown): HeaderMap | null {
  if (!isRecord(error)) {
    return null;
  }
  const response = error.response;
  if (!isRecord(response)) {
    return null;
  }
  return toHeaderMap(response.headers);
}

function getHeaderValue(headers: HeaderMap | null, name: string): string | null {
  if (!headers) {
    return null;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    return null;
  }

  return null;
}

function parsePositiveInteger(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isRateLimitError(
  status: number | null,
  headers: HeaderMap | null,
  message: string,
): boolean {
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }

  const remaining = getHeaderValue(headers, "x-ratelimit-remaining");
  if (remaining === "0") {
    return true;
  }

  return message.toLowerCase().includes("rate limit");
}

export const getCommitStatus = action({
  args: {
    owner: string(),
    repo: string(),
    appRoot: string(),
    ref: string(), // commit SHA or branch name
  },
  returns: commitStatusResultValidator,
  handler: async (ctx, { owner, repo, appRoot, ref }): Promise<CommitStatusResult> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: `${owner}/${repo}`,
      appRoot,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }
    if (
      typeof vault.treeRefreshCooldownUntil === "number" &&
      vault.treeRefreshCooldownUntil > Date.now()
    ) {
      const cooldownResult: CommitStatusCooldownResult = {
        kind: "cooldown",
        message: readSharedCooldownMessage(vault),
        cooldownUntilMs: vault.treeRefreshCooldownUntil,
      };
      return cooldownResult;
    }

    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      const [checksResponse, combinedStatusResponse] = await Promise.all([
        octokit.checks.listForRef({
          owner,
          repo,
          ref,
        }),
        octokit.repos.getCombinedStatusForRef({
          owner,
          repo,
          ref,
        }),
      ]);

      const okResult: CommitStatusOkResult = {
        kind: "ok",
        check_runs: checksResponse.data.check_runs.map((run) => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion ?? null,
          html_url: run.html_url ?? "",
        })),
        statuses: combinedStatusResponse.data.statuses.map((status) => ({
          id: status.id,
          state: status.state,
          context: status.context,
          description: status.description ?? null,
          target_url: status.target_url ?? null,
        })),
      };
      return okResult;
    } catch (error) {
      const status = getErrorStatus(error);
      const message = getErrorMessage(error);
      const headers = getErrorHeaders(error);

      if (!isRateLimitError(status, headers, message)) {
        throw error;
      }

      const failure = describeRepositoryTreeRefreshFailure(error);
      await ctx.runMutation(internal.vault.branches.recordTreeRefreshFailure, {
        vaultId: vault._id,
        failureKind: failure.kind,
        failureMessage: failure.message,
        cooldownUntil: failure.cooldownUntil,
      });

      const resetAtSeconds = parsePositiveInteger(getHeaderValue(headers, "x-ratelimit-reset"));
      const retryAfterSeconds = parsePositiveInteger(getHeaderValue(headers, "retry-after"));

      const rateLimitedResult: CommitStatusRateLimitedResult = {
        kind: "rate_limited",
        message: failure.message,
        resetAtMs: resetAtSeconds === null ? null : resetAtSeconds * 1000,
        retryAfterMs: retryAfterSeconds === null ? null : retryAfterSeconds * 1000,
      };
      return rateLimitedResult;
    }
  },
});
