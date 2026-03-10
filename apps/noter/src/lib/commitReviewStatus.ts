export type CommitReviewFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed";

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
