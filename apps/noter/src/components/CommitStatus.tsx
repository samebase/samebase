import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";

interface GitHubCheckRun {
  id: number;
  name: string;
  status: "completed" | "in_progress" | "queued";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped" | null;
  html_url: string;
}

interface CommitStatusProps {
  owner: string;
  repo: string;
  commitSha: string;
  className?: string;
}

function getStatusColor(status: string, conclusion: string | null): string {
  if (status === "in_progress" || status === "queued") {
    return "text-yellow-500"; // Yellow for running/pending
  }
  
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "text-green-500"; // Green for success
      case "failure":
        return "text-red-500"; // Red for failure
      case "cancelled":
      case "timed_out":
        return "text-gray-500"; // Gray for cancelled/timeout
      case "neutral":
      case "skipped":
        return "text-blue-500"; // Blue for neutral/skipped
      default:
        return "text-gray-400"; // Default gray
    }
  }
  
  return "text-gray-400"; // Default
}

function getStatusIcon(status: string, conclusion: string | null): string {
  if (status === "in_progress" || status === "queued") {
    return "●"; // Solid dot for running
  }
  
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "●"; // Solid dot for success
      case "failure":
        return "●"; // Solid dot for failure
      default:
        return "●"; // Solid dot for others
    }
  }
  
  return "●"; // Default solid dot
}

function getStatusTitle(status: string, conclusion: string | null, checkCount: number): string {
  const checkText = checkCount === 1 ? "check" : "checks";
  
  if (status === "in_progress") {
    return `${checkCount} CI ${checkText} running`;
  }
  if (status === "queued") {
    return `${checkCount} CI ${checkText} queued`;
  }
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return `All ${checkCount} CI ${checkText} passed`;
      case "failure":
        return `Some CI ${checkText} failed`;
      case "cancelled":
        return `CI ${checkText} cancelled`;
      case "timed_out":
        return `CI ${checkText} timed out`;
      case "neutral":
        return `CI ${checkText} completed (neutral)`;
      case "skipped":
        return `CI ${checkText} skipped`;
      default:
        return `${checkCount} CI ${checkText} completed`;
    }
  }
  return "CI status unknown";
}

export function CommitStatus({ owner, repo, commitSha, className = "" }: CommitStatusProps) {
  const [checkRuns, setCheckRuns] = useState<GitHubCheckRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const getCommitStatus = useAction(api.githubChecks.getCommitStatus);

  useEffect(() => {
    if (!commitSha || !owner || !repo) return;

    const fetchCheckRuns = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await getCommitStatus({
          owner,
          repo,
          ref: commitSha,
        });
        
        if ('error' in result) {
          setError(result.error);
          setCheckRuns(null);
        } else {
          setCheckRuns(result.check_runs);
        }
      } catch (err) {
        console.error("Failed to fetch CI status:", err);
        setError(err instanceof Error ? (err.message ?? "Unknown error") : String(err));
        setCheckRuns(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchCheckRuns();
  }, [commitSha, owner, repo, getCommitStatus]);

  // Don't render anything while loading or if there's an error
  if (loading || error || !checkRuns || checkRuns.length === 0) {
    return null;
  }

  // Determine overall status from all check runs
  const hasFailure = checkRuns.some(run => run.status === "completed" && run.conclusion === "failure");
  const hasRunning = checkRuns.some(run => run.status === "in_progress" || run.status === "queued");
  const allCompleted = checkRuns.every(run => run.status === "completed");
  const allSuccess = allCompleted && checkRuns.every(run => run.conclusion === "success");

  let overallStatus: string;
  let overallConclusion: string | null;

  if (hasRunning) {
    overallStatus = "in_progress";
    overallConclusion = null;
  } else if (hasFailure) {
    overallStatus = "completed";
    overallConclusion = "failure";
  } else if (allSuccess) {
    overallStatus = "completed";
    overallConclusion = "success";
  } else {
    overallStatus = "completed";
    overallConclusion = "neutral";
  }

  const colorClass = getStatusColor(overallStatus, overallConclusion);
  const icon = getStatusIcon(overallStatus, overallConclusion);
  const title = getStatusTitle(overallStatus, overallConclusion, checkRuns.length);

  return (
    <span 
      className={`${colorClass} ${className} cursor-help`}
      title={title}
    >
      {icon}
    </span>
  );
}