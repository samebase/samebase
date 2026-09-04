import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "../../lib/utils";

const EMPTY_RESULT_RETRY_DELAYS_MS = [
  2_000, 3_000, 5_000, 8_000, 13_000, 21_000, 34_000, 55_000, 89_000,
] as const;
const RUNNING_STATUS_POLL_INTERVAL_MS = 30_000;
const RATE_LIMIT_FALLBACK_RETRY_MS = 60_000;
const MIN_FETCH_GAP_MS = 5_000;

type CommitStatusResult = (typeof api.githubChecks.getCommitStatus)["_returnType"];

type CommitStatusQueryData = {
  emptyResultAttempt: number;
  fetchedAtMs: number;
  nextRefetchAtMs: number | null;
  result: CommitStatusResult;
};

function hasNoCommitStatuses(result: CommitStatusResult): boolean {
  return result.kind === "ok" && result.check_runs.length === 0 && result.statuses.length === 0;
}

interface GitHubCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

interface GitHubCommitStatus {
  id: number;
  state: string;
  context: string;
  description: string | null;
  target_url: string | null;
}

interface ChecksPausedState {
  message: string;
  untilMs: number | null;
}

interface CommitStatusProps {
  owner: string;
  repo: string;
  commitSha?: string;
  className?: string;
}

type StatusKind = "success" | "failure" | "running" | "neutral";

interface StatusSummary {
  total: number;
  success: number;
  failure: number;
  running: number;
  neutral: number;
  overall: StatusKind;
  title: string;
}

const STATUS_STYLES: Record<StatusKind, { text: string; dot: string }> = {
  success: { text: "text-emerald-600", dot: "bg-emerald-500" },
  failure: { text: "text-red-600", dot: "bg-red-500" },
  running: { text: "text-amber-600", dot: "bg-amber-500" },
  neutral: { text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function formatNameList(names: string[], maxNames = 3): string {
  if (names.length <= maxNames) {
    return names.join(", ");
  }
  return `${names.slice(0, maxNames).join(", ")} +${names.length - maxNames} more`;
}

function summarizeStatuses<T>(
  label: string,
  items: T[],
  classify: (item: T) => StatusKind,
  getName: (item: T) => string,
): StatusSummary | null {
  if (items.length === 0) {
    return null;
  }

  const buckets: Record<StatusKind, string[]> = {
    success: [],
    failure: [],
    running: [],
    neutral: [],
  };

  for (const item of items) {
    const kind = classify(item);
    buckets[kind].push(getName(item));
  }

  const success = buckets.success.length;
  const failure = buckets.failure.length;
  const running = buckets.running.length;
  const neutral = buckets.neutral.length;
  const total = items.length;

  let overall: StatusKind = "neutral";
  if (running > 0) {
    overall = "running";
  } else if (failure > 0) {
    overall = "failure";
  } else if (success === total) {
    overall = "success";
  }

  const parts = [`${label}: ${total} total`];
  if (success > 0) {
    parts.push(`${success} passed`);
  }
  if (failure > 0) {
    parts.push(`${failure} failed`);
  }
  if (running > 0) {
    parts.push(`${running} running`);
  }
  if (neutral > 0) {
    parts.push(`${neutral} neutral`);
  }
  if (failure > 0) {
    parts.push(`Failing: ${formatNameList(buckets.failure)}`);
  }
  if (running > 0) {
    parts.push(`Running: ${formatNameList(buckets.running)}`);
  }

  return {
    total,
    success,
    failure,
    running,
    neutral,
    overall,
    title: parts.join(" • "),
  };
}

function classifyCheckRun(run: GitHubCheckRun): StatusKind {
  if (run.status === "queued" || run.status === "in_progress") {
    return "running";
  }

  if (run.status === "completed") {
    switch (run.conclusion) {
      case "success":
        return "success";
      case "failure":
      case "cancelled":
      case "timed_out":
      case "action_required":
      case "stale":
        return "failure";
      case "neutral":
      case "skipped":
        return "neutral";
      default:
        return "neutral";
    }
  }

  return "neutral";
}

function classifyCommitStatus(status: GitHubCommitStatus): StatusKind {
  switch (status.state) {
    case "success":
      return "success";
    case "error":
    case "failure":
      return "failure";
    case "pending":
      return "running";
    default:
      return "neutral";
  }
}

function hasRunningStatuses(
  checkRuns: GitHubCheckRun[],
  commitStatuses: GitHubCommitStatus[],
): boolean {
  return (
    checkRuns.some((run) => classifyCheckRun(run) === "running") ||
    commitStatuses.some((status) => classifyCommitStatus(status) === "running")
  );
}

function buildCommitStatusQueryData(args: {
  fetchStartedAtMs: number;
  fetchedAtMs: number;
  previous: CommitStatusQueryData | undefined;
  result: CommitStatusResult;
}): CommitStatusQueryData {
  const { fetchStartedAtMs, fetchedAtMs, previous, result } = args;
  const isEmpty = hasNoCommitStatuses(result);
  const previousWasEmpty = previous !== undefined && hasNoCommitStatuses(previous.result);
  const emptyResultAttempt = isEmpty ? (previousWasEmpty ? previous.emptyResultAttempt + 1 : 0) : 0;
  let nextRefetchAtMs: number | null = null;

  if (result.kind === "cooldown") {
    nextRefetchAtMs = Math.max(result.cooldownUntilMs, fetchedAtMs + MIN_FETCH_GAP_MS);
  } else if (result.kind === "rate_limited") {
    const retryCandidates: number[] = [];
    if (result.retryAfterMs !== null && result.retryAfterMs > 0) {
      retryCandidates.push(fetchedAtMs + result.retryAfterMs);
    }
    if (result.resetAtMs !== null && result.resetAtMs > fetchedAtMs) {
      retryCandidates.push(result.resetAtMs);
    }
    const retryAtMs =
      retryCandidates.length > 0
        ? Math.min(...retryCandidates)
        : fetchedAtMs + RATE_LIMIT_FALLBACK_RETRY_MS;
    nextRefetchAtMs = Math.max(retryAtMs, fetchedAtMs + MIN_FETCH_GAP_MS);
  } else if (isEmpty) {
    const emptyResultRetryDelayMs =
      EMPTY_RESULT_RETRY_DELAYS_MS[
        Math.min(emptyResultAttempt, EMPTY_RESULT_RETRY_DELAYS_MS.length - 1)
      ];
    nextRefetchAtMs = Math.max(
      fetchedAtMs + emptyResultRetryDelayMs,
      fetchStartedAtMs + MIN_FETCH_GAP_MS,
    );
  } else if (hasRunningStatuses(result.check_runs, result.statuses)) {
    nextRefetchAtMs = fetchedAtMs + RUNNING_STATUS_POLL_INTERVAL_MS;
  }

  return { emptyResultAttempt, fetchedAtMs, nextRefetchAtMs, result };
}

function formatChecksPausedTitle(paused: ChecksPausedState): string {
  if (paused.untilMs === null) {
    return paused.message;
  }

  return `${paused.message} • Until ${new Date(paused.untilMs).toLocaleString()}`;
}

function StatusBadge({
  label,
  summary,
  href,
}: {
  label: string;
  summary: StatusSummary;
  href: string;
}) {
  const style = STATUS_STYLES[summary.overall];

  return (
    <a
      className={cn(
        "inline-flex items-center gap-1 corner-notch-1 text-[11px] leading-none transition",
        "hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        style.text,
      )}
      href={href}
      title={summary.title}
      aria-label={summary.title}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className={cn("h-2 w-2 rounded-ui", style.dot)} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-[10px] text-muted-foreground">{summary.total}</span>
    </a>
  );
}

function InlineState({
  label,
  className,
  title,
}: {
  label: string;
  className?: string;
  title?: string;
}) {
  const accessibleText = title ?? label;
  return (
    <span
      className={cn("inline-flex items-center text-[11px] leading-none", className)}
      title={accessibleText}
      aria-label={accessibleText}
    >
      {label}
    </span>
  );
}

export function CommitStatus({ owner, repo, commitSha, className = "" }: CommitStatusProps) {
  const getCommitStatus = useAction(api.githubChecks.getCommitStatus);
  const queryClient = useQueryClient();
  const queryEnabled = Boolean(commitSha && owner && repo);
  const queryKey = ["github-commit-status", owner, repo, commitSha ?? null] as const;
  const statusQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!commitSha || !owner || !repo) {
        throw new Error("A repository and commit SHA are required to load checks.");
      }
      const fetchStartedAtMs = Date.now();
      try {
        const result = await getCommitStatus({
          owner,
          repo,
          ref: commitSha,
        });
        return buildCommitStatusQueryData({
          fetchStartedAtMs,
          fetchedAtMs: Date.now(),
          previous: queryClient.getQueryData<CommitStatusQueryData>(queryKey),
          result,
        });
      } catch (err) {
        console.error("Failed to fetch CI status:", err);
        throw err;
      }
    },
    enabled: queryEnabled,
    refetchInterval: (query) => {
      if (query.state.error || query.state.data?.nextRefetchAtMs === null) {
        return false;
      }
      const nextRefetchAtMs = query.state.data?.nextRefetchAtMs;
      return nextRefetchAtMs === undefined ? false : Math.max(nextRefetchAtMs - Date.now(), 1);
    },
    refetchIntervalInBackground: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: MIN_FETCH_GAP_MS,
  });
  const result = statusQuery.data?.result;
  const checkRuns = result?.kind === "ok" ? result.check_runs : null;
  const commitStatuses = result?.kind === "ok" ? result.statuses : null;
  const loading = queryEnabled && statusQuery.isPending;
  const error = statusQuery.isError
    ? statusQuery.error instanceof Error
      ? statusQuery.error.message || "Unknown error"
      : String(statusQuery.error)
    : null;
  const checksPaused: ChecksPausedState | null = statusQuery.isError
    ? null
    : result?.kind === "cooldown"
      ? { message: result.message, untilMs: result.cooldownUntilMs }
      : result?.kind === "rate_limited"
        ? {
            message: result.message,
            untilMs:
              result.resetAtMs ??
              (result.retryAfterMs === null || statusQuery.data === undefined
                ? null
                : statusQuery.data.fetchedAtMs + result.retryAfterMs),
          }
        : null;

  if (!commitSha) {
    return <InlineState label="Missing commit SHA" className={cn("text-red-600", className)} />;
  }

  if (loading) {
    return (
      <InlineState label="Loading checks..." className={cn("text-muted-foreground", className)} />
    );
  }

  if (checksPaused) {
    return (
      <InlineState
        label="Checks paused"
        className={cn("text-amber-600", className)}
        title={formatChecksPausedTitle(checksPaused)}
      />
    );
  }

  if (error) {
    const errorMessage = `Checks error: ${error}`;
    return (
      <InlineState
        label="Checks error"
        className={cn("text-red-600", className)}
        title={errorMessage}
      />
    );
  }

  const checkSummary = checkRuns
    ? summarizeStatuses("Checks", checkRuns, classifyCheckRun, (run) => run.name)
    : null;
  const statusSummary = commitStatuses
    ? summarizeStatuses(
        "Statuses",
        commitStatuses,
        classifyCommitStatus,
        (status) => status.context,
      )
    : null;

  if (!checkSummary && !statusSummary) {
    return (
      <InlineState label="No checks/statuses" className={cn("text-muted-foreground", className)} />
    );
  }

  const commitUrl = `https://github.com/${owner}/${repo}/commit/${commitSha}`;
  const checksUrl = `${commitUrl}/checks`;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {checkSummary && <StatusBadge label="Checks" summary={checkSummary} href={checksUrl} />}
      {statusSummary && <StatusBadge label="Statuses" summary={statusSummary} href={checksUrl} />}
    </span>
  );
}
