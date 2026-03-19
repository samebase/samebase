import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/utils";

const EMPTY_RESULT_RETRY_DELAYS_MS = [
  2_000, 3_000, 5_000, 8_000, 13_000, 21_000, 34_000, 55_000, 89_000,
] as const;
const RUNNING_STATUS_POLL_INTERVAL_MS = 30_000;
const RATE_LIMIT_FALLBACK_RETRY_MS = 60_000;
const MIN_FETCH_GAP_MS = 5_000;

function getDelayForAttempt(
  delaysMs: readonly number[],
  attempt: number,
): number {
  if (delaysMs.length === 0) {
    return 0;
  }

  return delaysMs[Math.min(attempt, delaysMs.length - 1)];
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

interface RateLimitedState {
  message: string;
  resetAtMs: number | null;
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

function formatRateLimitedTitle(rateLimited: RateLimitedState): string {
  if (rateLimited.resetAtMs === null) {
    return rateLimited.message;
  }

  return `${rateLimited.message} • Resets at ${new Date(rateLimited.resetAtMs).toLocaleString()}`;
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
      <span className="tabular-nums text-[10px] text-muted-foreground">
        {summary.total}
      </span>
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
      className={cn(
        "inline-flex items-center text-[11px] leading-none",
        className,
      )}
      title={accessibleText}
      aria-label={accessibleText}
    >
      {label}
    </span>
  );
}

export function CommitStatus({
  owner,
  repo,
  commitSha,
  className = "",
}: CommitStatusProps) {
  const [checkRuns, setCheckRuns] = useState<GitHubCheckRun[] | null>(null);
  const [commitStatuses, setCommitStatuses] = useState<
    GitHubCommitStatus[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimitedState | null>(null);

  const getCommitStatus = useAction(api.githubChecks.getCommitStatus);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTokenRef = useRef(0);
  const emptyAttemptRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef<number | null>(null);

  useEffect(() => {
    requestTokenRef.current += 1;
    const requestToken = requestTokenRef.current;

    const clearScheduledFetch = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    clearScheduledFetch();
    emptyAttemptRef.current = 0;
    inFlightRef.current = false;
    lastFetchAtRef.current = null;

    if (!commitSha || !owner || !repo) {
      setCheckRuns(null);
      setCommitStatuses(null);
      setLoading(false);
      setError(null);
      setRateLimited(null);
      return () => {
        requestTokenRef.current += 1;
        clearScheduledFetch();
      };
    }

    const scheduleFetch = (delayMs: number) => {
      clearScheduledFetch();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void fetchCommitStatus(false);
      }, delayMs);
    };

    const fetchCommitStatus = async (isInitialLoad: boolean) => {
      if (requestTokenRef.current !== requestToken) {
        return;
      }
      if (inFlightRef.current) {
        return;
      }

      const now = Date.now();
      const lastFetchAt = lastFetchAtRef.current;
      if (!isInitialLoad && lastFetchAt !== null) {
        const elapsedMs = now - lastFetchAt;
        if (elapsedMs < MIN_FETCH_GAP_MS) {
          scheduleFetch(MIN_FETCH_GAP_MS - elapsedMs);
          return;
        }
      }

      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await getCommitStatus({
          owner,
          repo,
          ref: commitSha,
        });

        if (requestTokenRef.current !== requestToken) {
          return;
        }

        if (result.kind === "rate_limited") {
          setRateLimited({
            message: result.message,
            resetAtMs: result.resetAtMs,
          });
          setError(null);

          const cooldownCandidates: number[] = [];
          if (result.retryAfterMs !== null && result.retryAfterMs > 0) {
            cooldownCandidates.push(result.retryAfterMs);
          }
          if (result.resetAtMs !== null) {
            const resetDelayMs = result.resetAtMs - Date.now();
            if (resetDelayMs > 0) {
              cooldownCandidates.push(resetDelayMs);
            }
          }

          const retryDelayMs =
            cooldownCandidates.length > 0
              ? Math.min(...cooldownCandidates)
              : RATE_LIMIT_FALLBACK_RETRY_MS;

          scheduleFetch(Math.max(retryDelayMs, MIN_FETCH_GAP_MS));
          return;
        }

        setRateLimited(null);
        setCheckRuns(result.check_runs);
        setCommitStatuses(result.statuses);

        if (result.check_runs.length === 0 && result.statuses.length === 0) {
          const delayMs = getDelayForAttempt(
            EMPTY_RESULT_RETRY_DELAYS_MS,
            emptyAttemptRef.current,
          );
          emptyAttemptRef.current += 1;
          scheduleFetch(delayMs);
          return;
        }

        emptyAttemptRef.current = 0;

        if (hasRunningStatuses(result.check_runs, result.statuses)) {
          scheduleFetch(RUNNING_STATUS_POLL_INTERVAL_MS);
        } else {
          clearScheduledFetch();
        }
      } catch (err) {
        if (requestTokenRef.current !== requestToken) {
          return;
        }

        console.error("Failed to fetch CI status:", err);
        setRateLimited(null);
        setError(
          err instanceof Error ? err.message || "Unknown error" : String(err),
        );
        setCheckRuns(null);
        setCommitStatuses(null);
      } finally {
        if (requestTokenRef.current === requestToken) {
          inFlightRef.current = false;
          if (isInitialLoad) {
            setLoading(false);
          }
        }
      }
    };

    setRateLimited(null);
    setError(null);
    void fetchCommitStatus(true);

    return () => {
      requestTokenRef.current += 1;
      clearScheduledFetch();
      inFlightRef.current = false;
      emptyAttemptRef.current = 0;
      lastFetchAtRef.current = null;
    };
  }, [commitSha, owner, repo, getCommitStatus]);

  if (!commitSha) {
    return (
      <InlineState
        label="Missing commit SHA"
        className={cn("text-red-600", className)}
      />
    );
  }

  if (loading) {
    return (
      <InlineState
        label="Loading checks..."
        className={cn("text-muted-foreground", className)}
      />
    );
  }

  if (rateLimited) {
    return (
      <InlineState
        label="GitHub rate limited"
        className={cn("text-amber-600", className)}
        title={formatRateLimitedTitle(rateLimited)}
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
    ? summarizeStatuses(
        "Checks",
        checkRuns,
        classifyCheckRun,
        (run) => run.name,
      )
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
      <InlineState
        label="No checks/statuses"
        className={cn("text-muted-foreground", className)}
      />
    );
  }

  const commitUrl = `https://github.com/${owner}/${repo}/commit/${commitSha}`;
  const checksUrl = `${commitUrl}/checks`;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {checkSummary && (
        <StatusBadge label="Checks" summary={checkSummary} href={checksUrl} />
      )}
      {statusSummary && (
        <StatusBadge
          label="Statuses"
          summary={statusSummary}
          href={checksUrl}
        />
      )}
    </span>
  );
}
