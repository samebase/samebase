import { api } from "../../../convex/_generated/api";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import type { GithubTree } from "../../../convex/schema";
import type { ProsemarkMergeEditorOptions } from "#src/components/ProsemarkMergeEditor.tsx";
import { type CommitReviewFileStatus as CommitPreviewFileStatus } from "#src/lib/commitReviewStatus.ts";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "#src/lib/fileViewSidebarLayout.ts";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "#src/lib/workspacePaneSizes.ts";
import { getStagedFileStatus as getSharedStagedFileStatus } from "../../../shared/stagedFiles";

/**
 * Keep FileView-specific helpers and derived types together so the main route
 * file can focus on state flow and rendered structure.
 */
export const FILE_VIEW_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: FILE_VIEW_TREE_SIDEBAR_SIDE === "left",
  leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;

export function isFileTreeNodeType(type: string): type is "tree" | "blob" {
  return type === "tree" || type === "blob";
}

export function findBestInitialFile(files: GithubTree[]) {
  const fileList = files.filter((item) => item.type === "blob");

  if (fileList.length === 0) {
    return null;
  }

  const readmeFile = fileList.find((file) =>
    /^readme(\.(md|txt|rst|org))?$/i.test(file.path),
  );
  if (readmeFile) {
    return readmeFile.path;
  }

  const markdownFile = fileList.find((file) =>
    /\.(md|markdown)$/i.test(file.path),
  );
  if (markdownFile) {
    return markdownFile.path;
  }

  const sortedFiles = fileList.sort((a, b) => a.path.localeCompare(b.path));
  return sortedFiles[0]?.path ?? null;
}

export type CommitPreviewFile = {
  status: CommitPreviewFileStatus;
  path: string;
  previousPath?: string;
  isBinary: boolean;
  mimeType?: string;
  additions: number;
  deletions: number;
  oldLineCount: number;
  newLineCount: number;
  isMarkdown: boolean;
  richOldContent?: string;
  richNewContent?: string;
  richContentTruncated?: boolean;
  patchTruncated: boolean;
  patch?: string;
};

export type CommitPreview = {
  branch: string;
  hasDestructiveChanges: boolean;
  files: CommitPreviewFile[];
  totals: {
    files: number;
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    additions: number;
    deletions: number;
  };
  safety: {
    destructiveFileCount: number;
    truncatedPatchFileCount: number;
    includesTruncatedPatches: boolean;
  };
};

export type BranchComparePreview =
  (typeof api.fileStagingActions.getBranchComparePreview)["_returnType"];

export type RebaseConflictPreview = {
  branch: string;
  files: {
    path: string;
    previousPath?: string;
    upstreamPath?: string;
    isBinary: boolean;
    mimeType?: string;
    isMarkdown: boolean;
    baseBlobSha?: string;
    upstreamBlobSha: string;
    baseToStagedPatchTruncated: boolean;
    baseToStagedPatch?: string;
    baseToUpstreamPatchTruncated: boolean;
    baseToUpstreamPatch?: string;
  }[];
};

export type CommitReviewMode = "editor" | "review";
export type SidebarMode = "simple" | "all";
export type EffectiveSidebarMode = SidebarMode | "compare";
export type StagedFileRecord = NonNullable<
  (typeof api.fileStaging.listStagedFiles)["_returnType"]
>[number];
export type InlinePreviewSaveSnapshot = {
  stagingId: StagedFileRecord["_id"];
  content: string;
  baseVersion: number;
};
export type PendingMediaUpload = {
  file: File;
  preferredFolderPath: string;
};

export const BRANCH_COMPARE_PREVIEW_STAGING_DEBOUNCE_MS = 1000;

export function isStorageBackedFileError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes("in storage")
  );
}

export function readGraphViewMode(
  storageKey: string,
): "editor" | "graph" | null {
  try {
    const storedMode = localStorage.getItem(storageKey);
    if (storedMode === "editor" || storedMode === "graph") {
      return storedMode;
    }
  } catch (error) {
    console.warn("Failed to read graph view preference", error);
  }
  return null;
}

export function getPatchLineClassName(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (line.startsWith("@@")) {
    return "text-muted-foreground";
  }
  return "";
}

export function matchesInlinePreviewSaveSnapshot(
  left: InlinePreviewSaveSnapshot | null,
  right: InlinePreviewSaveSnapshot,
): boolean {
  return (
    left?.stagingId === right.stagingId &&
    left.content === right.content &&
    left.baseVersion === right.baseVersion
  );
}

export function buildInlinePreviewAutosaveContextKey(
  reviewMode: CommitReviewMode,
  activeStagingId: StagedFileRecord["_id"] | null,
  draftStagingId: StagedFileRecord["_id"] | null,
): string {
  return `${reviewMode}:${activeStagingId ?? "none"}:${draftStagingId ?? "none"}`;
}

export const DEFAULT_INLINE_PREVIEW_OPTIONS = {
  allowInlineDiffs: false,
  syntaxHighlightDeletions: true,
} satisfies ProsemarkMergeEditorOptions;

export const DEFAULT_SHOW_INLINE_PREVIEW_PATCH = false;
export const DEFAULT_SHOW_INLINE_PREVIEW_SIDE_BY_SIDE = false;

const UPSTREAM_CONFLICT_ERROR_PREFIX =
  "Commit conflicts with upstream changes. Resolve and retry: ";

export function parseUpstreamConflictPaths(message: string | null): string[] {
  if (!message || !message.startsWith(UPSTREAM_CONFLICT_ERROR_PREFIX)) {
    return [];
  }

  return message
    .slice(UPSTREAM_CONFLICT_ERROR_PREFIX.length)
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export function getStagedFileStatus(
  file: StagedFileRecord,
): CommitPreviewFileStatus | null {
  return getSharedStagedFileStatus(file);
}

export function getDefaultUploadFolderPath(filePath: string): string {
  const pathSegments = filePath.split("/");
  pathSegments.pop();
  return pathSegments.join("/");
}

export function normalizeFolderPath(folderPath: string): string {
  return folderPath.trim().replace(/^\/+|\/+$/g, "");
}
