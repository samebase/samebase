export type CommitReviewFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed";

export function getCommitStatusToken(
  status: CommitReviewFileStatus,
): "A" | "M" | "D" | "R" {
  if (status === "added") return "A";
  if (status === "modified") return "M";
  if (status === "deleted") return "D";
  return "R";
}

export function getCommitStatusLabel(status: CommitReviewFileStatus): string {
  if (status === "added") return "Added";
  if (status === "modified") return "Modified";
  if (status === "deleted") return "Deleted";
  return "Renamed";
}

export function getCommitStatusBadgeClassName(
  status: CommitReviewFileStatus,
): string {
  if (status === "added") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
  }
  if (status === "modified") {
    return "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300";
  }
  if (status === "deleted") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
}

export function getCommitStatusTextClassName(
  status: CommitReviewFileStatus,
): string {
  if (status === "added") {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (status === "modified") {
    return "text-sky-700 dark:text-sky-300";
  }
  if (status === "deleted") {
    return "text-rose-700 dark:text-rose-300";
  }
  return "text-amber-700 dark:text-amber-300";
}
