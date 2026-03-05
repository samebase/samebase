export const COMMIT_CONFLICT_REASONS = [
  "missing_upstream_path",
  "new_file_path_taken",
  "content_conflict",
  "rename_target_exists",
] as const;

export type CommitConflictReason = (typeof COMMIT_CONFLICT_REASONS)[number];
