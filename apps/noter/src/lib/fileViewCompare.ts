export type BranchComparePreviewReloadMode = "none" | "immediate" | "debounced";

/**
 * Builds a deterministic, order-independent refresh key for staged file rows.
 * The key captures each row's `_id`, `version`, `filePath`,
 * `initialFilePath`, `fileDeleted`, and `parentCommitSha` (with `null`
 * preserved as `"new"`). `null`/`undefined` inputs produce an empty key, and
 * equivalent file sets produce the same key regardless of array order.
 */
export function buildStagingPreviewRefreshKey<
  T extends {
    _id: unknown;
    version: number;
    filePath: string;
    initialFilePath: string;
    fileDeleted: boolean;
    parentCommitSha: string | null;
  },
>(files: readonly T[] | null | undefined): string {
  return (files ?? [])
    .map((file) =>
      JSON.stringify({
        _id: String(file._id),
        version: file.version,
        filePath: file.filePath,
        initialFilePath: file.initialFilePath,
        fileDeleted: file.fileDeleted,
        parentCommitSha: file.parentCommitSha ?? "new",
      }),
    )
    .sort()
    .join("|");
}

/**
 * Compare target changes need an immediate hard reset so the sidebar cannot
 * navigate through stale rows from another branch/PR. Staging-only edits are
 * still compare-relevant, but they can reload after a short debounce so active
 * typing does not fan out GitHub compare requests.
 */
export function getBranchComparePreviewReloadMode(args: {
  previousTargetKey: string | null;
  previousStagingKey: string | null;
  nextTargetKey: string;
  nextStagingKey: string;
}): BranchComparePreviewReloadMode {
  if (args.previousTargetKey !== args.nextTargetKey) {
    return "immediate";
  }

  if (args.previousStagingKey !== args.nextStagingKey) {
    return "debounced";
  }

  return "none";
}
