export type BranchComparePreviewReloadMode = "none" | "immediate" | "debounced";

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
    .map(
      (file) =>
        `${String(file._id)}:${file.version}:${file.filePath}:${file.initialFilePath}:${file.fileDeleted}:${file.parentCommitSha ?? "new"}`,
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
