import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/utils";

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

interface CommitStatusProps {
  owner: string;
  repo: string;
  commitSha: string;
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
        "inline-flex items-center gap-1 rounded-sm text-[11px] leading-none transition",
        "hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        style.text,
      )}
      href={href}
      title={summary.title}
      aria-label={summary.title}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-[10px] text-muted-foreground">
        {summary.total}
      </span>
    </a>
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

  const getCommitStatus = useAction(api.githubChecks.getCommitStatus);

  useEffect(() => {
    if (!commitSha || !owner || !repo) {
      setCheckRuns(null);
      setCommitStatuses(null);
      return;
    }

    const fetchCheckRuns = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await getCommitStatus({
          owner,
          repo,
          ref: commitSha,
        });

        setCheckRuns(result.check_runs);
        setCommitStatuses(result.statuses);
      } catch (err) {
        console.error("Failed to fetch CI status:", err);
        setError(
          err instanceof Error ? err.message || "Unknown error" : String(err),
        );
        setCheckRuns(null);
        setCommitStatuses(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchCheckRuns();
  }, [commitSha, owner, repo, getCommitStatus]);

  // Don't render anything while loading or if there's an error
  if (loading || error) {
    return null;
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
    return null;
  }

  const commitUrl = `https://github.com/${owner}/${repo}/commit/${commitSha}`;
  const checksUrl = `${commitUrl}/checks`;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {checkSummary && (
        <StatusBadge
          label="Checks"
          summary={checkSummary}
          href={checksUrl}
        />
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
