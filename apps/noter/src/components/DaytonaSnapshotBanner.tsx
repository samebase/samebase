import { cn } from "@/lib/utils";

interface DaytonaSnapshotBannerProps {
  branch: string;
  commitSha?: string | null;
  snapshotName?: string | null;
  snapshotStatus?: string | null;
  lastError?: string | null;
  className?: string;
}

const shortenCommitSha = (commitSha: string) =>
  commitSha.length <= 7 ? commitSha : commitSha.slice(0, 7);

export function DaytonaSnapshotBanner({
  branch,
  commitSha,
  snapshotName,
  snapshotStatus,
  lastError,
  className,
}: DaytonaSnapshotBannerProps) {
  const normalizedBranch = branch.trim().toLowerCase();
  const normalizedStatus = snapshotStatus?.trim().toLowerCase() ?? "";
  if (
    normalizedBranch !== "main" ||
    !commitSha ||
    normalizedStatus.length === 0 ||
    normalizedStatus === "active"
  ) {
    return null;
  }

  const shortCommitSha = shortenCommitSha(commitSha);
  const isFailure = normalizedStatus === "failed";
  const message = isFailure
    ? `Latest Daytona snapshot for ${shortCommitSha} failed. Launch is blocked while automatic retries continue.`
    : `Latest Daytona snapshot for ${shortCommitSha} is ${normalizedStatus}. Launch is blocked until it becomes active.`;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        isFailure
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-300 bg-amber-50/80 text-amber-900",
        className,
      )}
    >
      <div className="font-medium">{message}</div>
      {snapshotName ? (
        <div className="mt-1 font-mono text-[11px] opacity-80">
          {snapshotName}
        </div>
      ) : null}
      {isFailure && lastError ? (
        <div className="mt-1 text-[11px] opacity-90">{lastError}</div>
      ) : null}
    </div>
  );
}
