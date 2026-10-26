import { v, type Infer } from "convex/values";
import type { Octokit } from "@octokit/rest";
import { createTwoFilesPatch, diffLines } from "diff";
import { guessMime, INLINE_TEXT_MAX, isTextBuffer } from "./fileContent.js";
import {
  isBinaryStagedFile,
  type StagedFileForCommit,
  type StagedFileRebaseConflict,
} from "./github.js";
const { boolean, number, object, optional, string } = v;
const commitPreviewFileStatus = v.union(
  v.literal("added"),
  v.literal("modified"),
  v.literal("deleted"),
  v.literal("renamed"),
);

const commitPreviewFile = v.object({
  status: commitPreviewFileStatus,
  path: v.string(),
  previousPath: v.optional(v.string()),
  isBinary: v.boolean(),
  mimeType: v.optional(v.string()),
  additions: v.number(),
  deletions: v.number(),
  oldLineCount: v.number(),
  newLineCount: v.number(),
  isMarkdown: v.boolean(),
  richOldContent: v.optional(v.string()),
  richNewContent: v.optional(v.string()),
  richContentTruncated: v.optional(v.boolean()),
  patchTruncated: v.boolean(),
  patch: v.optional(v.string()),
});

const commitPreviewTotals = v.object({
  files: v.number(),
  added: v.number(),
  modified: v.number(),
  deleted: v.number(),
  renamed: v.number(),
  additions: v.number(),
  deletions: v.number(),
});

const commitPreviewSafety = v.object({
  destructiveFileCount: v.number(),
  truncatedPatchFileCount: v.number(),
  includesTruncatedPatches: v.boolean(),
});

export const commitPreviewResult = v.object({
  branch: v.string(),
  hasDestructiveChanges: v.boolean(),
  files: v.array(commitPreviewFile),
  totals: commitPreviewTotals,
  safety: commitPreviewSafety,
});

export const branchComparePreviewResult = v.object({
  branch: v.string(),
  baseBranch: v.string(),
  source: v.union(v.literal("pull_request"), v.literal("branch_compare")),
  pullRequestNumber: v.optional(v.number()),
  pullRequestUrl: v.optional(v.string()),
  sourceFileListTruncated: v.boolean(),
  hasDestructiveChanges: v.boolean(),
  files: v.array(commitPreviewFile),
  totals: commitPreviewTotals,
  safety: commitPreviewSafety,
});

export const draftPullRequestResult = object({
  url: string(),
  number: number(),
  existing: boolean(),
});
export const stagedMediaUploadResult = object({
  filePath: string(),
  branch: string(),
  parentCommitSha: optional(string()),
  replacedExisting: boolean(),
});
export const defaultBranchDraftPullRequestResult = object({
  branch: string(),
  url: string(),
  number: number(),
});

const rebaseConflictPreviewFile = v.object({
  path: v.string(),
  previousPath: v.optional(v.string()),
  upstreamPath: v.optional(v.string()),
  isBinary: v.boolean(),
  mimeType: v.optional(v.string()),
  isMarkdown: v.boolean(),
  baseBlobSha: v.optional(v.string()),
  upstreamBlobSha: v.string(),
  baseToStagedPatchTruncated: v.boolean(),
  baseToStagedPatch: v.optional(v.string()),
  baseToUpstreamPatchTruncated: v.boolean(),
  baseToUpstreamPatch: v.optional(v.string()),
});

export const rebaseConflictPreviewResult = v.object({
  branch: v.string(),
  files: v.array(rebaseConflictPreviewFile),
});

type CommitPreviewFile = Infer<typeof commitPreviewFile>;
type CommitPreviewTotals = Infer<typeof commitPreviewTotals>;
type CommitPreviewSafety = Infer<typeof commitPreviewSafety>;
export type CommitPreviewResult = Infer<typeof commitPreviewResult>;
export type BranchComparePreviewResult = Infer<typeof branchComparePreviewResult>;
export type DraftPullRequestResult = Infer<typeof draftPullRequestResult>;
export type StagedMediaUploadResult = Infer<typeof stagedMediaUploadResult>;
export type DefaultBranchDraftPullRequestResult = Infer<typeof defaultBranchDraftPullRequestResult>;
type RebaseConflictPreviewFile = Infer<typeof rebaseConflictPreviewFile>;
export type RebaseConflictPreviewResult = Infer<typeof rebaseConflictPreviewResult>;

type GitHubCompareFileCandidate = {
  filename?: string | null;
  previous_filename?: string | null;
  status?: string | null;
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
};

const MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE = 25_000;
const MAX_COMMIT_PREVIEW_PATCH_CHARS_TOTAL = 150_000;
const MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD = 40_000;
const MAX_CONFLICT_PREVIEW_PATCH_CHARS_PER_PATCH = 25_000;

function buildBoundedPatch(args: {
  oldPath: string;
  newPath: string;
  oldContent: string;
  newContent: string;
  maxChars: number;
}): {
  patch: string;
  truncated: boolean;
} {
  const fullPatch = createTwoFilesPatch(
    args.oldPath,
    args.newPath,
    args.oldContent,
    args.newContent,
    "",
    "",
    { context: 3 },
  );

  if (fullPatch.length <= args.maxChars) {
    return {
      patch: fullPatch,
      truncated: false,
    };
  }

  return {
    patch: `${fullPatch.slice(0, args.maxChars)}\n... [patch truncated]`,
    truncated: true,
  };
}

function buildConflictPatchPair(file: StagedFileRebaseConflict): {
  baseToStagedPatch: {
    patch: string;
    truncated: boolean;
  };
  baseToUpstreamPatch: {
    patch: string;
    truncated: boolean;
  };
} {
  if (file.upstreamContent === undefined) {
    throw new Error("Cannot build text patches for a binary conflict.");
  }

  return {
    baseToStagedPatch: buildBoundedPatch({
      oldPath: file.initialFilePath,
      newPath: file.filePath,
      oldContent: file.initialContent,
      newContent: file.content,
      maxChars: MAX_CONFLICT_PREVIEW_PATCH_CHARS_PER_PATCH,
    }),
    baseToUpstreamPatch: buildBoundedPatch({
      oldPath: file.initialFilePath,
      newPath: file.upstreamPath ?? file.initialFilePath,
      oldContent: file.initialContent,
      newContent: file.upstreamContent,
      maxChars: MAX_CONFLICT_PREVIEW_PATCH_CHARS_PER_PATCH,
    }),
  };
}

export function buildRebaseConflictPreviewFromStagedFiles(args: {
  conflicts: StagedFileRebaseConflict[];
  branch: string;
}): RebaseConflictPreviewResult {
  const files: RebaseConflictPreviewFile[] = args.conflicts.map((file) => {
    const isBinary = isBinaryStagedFile(file);
    const patchPair = isBinary ? null : buildConflictPatchPair(file);
    const renamed = file.filePath !== file.initialFilePath;

    return {
      path: file.filePath,
      previousPath: renamed ? file.initialFilePath : undefined,
      upstreamPath:
        file.upstreamPath !== undefined && file.upstreamPath !== file.filePath
          ? file.upstreamPath
          : undefined,
      isBinary,
      mimeType: isBinary ? file.mime : undefined,
      isMarkdown: !isBinary && isMarkdownPath(file.filePath),
      baseBlobSha: file.parentCommitSha ?? undefined,
      upstreamBlobSha: file.upstreamSha,
      baseToStagedPatchTruncated: patchPair?.baseToStagedPatch.truncated ?? false,
      baseToStagedPatch: patchPair?.baseToStagedPatch.patch,
      baseToUpstreamPatchTruncated: patchPair?.baseToUpstreamPatch.truncated ?? false,
      baseToUpstreamPatch: patchPair?.baseToUpstreamPatch.patch,
    };
  });

  return {
    branch: args.branch,
    files,
  };
}

export function buildRebaseConflictBundleMarkdown(args: {
  githubRepositoryFullName: string;
  branch: string;
  conflicts: StagedFileRebaseConflict[];
}): string {
  const sections = args.conflicts.flatMap((file) => {
    if (isBinaryStagedFile(file)) {
      const fileLines = [
        `## ${file.filePath}`,
        ...(file.filePath !== file.initialFilePath
          ? [`- Previous path: ${file.initialFilePath}`]
          : []),
        ...(file.parentCommitSha ? [`- Base blob SHA: ${file.parentCommitSha}`] : []),
        `- Upstream blob SHA: ${file.upstreamSha}`,
        `- Binary media conflict${file.mime ? ` (${file.mime})` : ""}`,
      ];

      return [
        fileLines.join("\n"),
        "### Resolution",
        "Binary conflict requires a replace or retry after reloading.",
      ];
    }

    const { baseToStagedPatch, baseToUpstreamPatch } = buildConflictPatchPair(file);
    const fileLines = [
      `## ${file.filePath}`,
      ...(file.filePath !== file.initialFilePath
        ? [`- Previous path: ${file.initialFilePath}`]
        : []),
      ...(file.parentCommitSha ? [`- Base blob SHA: ${file.parentCommitSha}`] : []),
      `- Upstream blob SHA: ${file.upstreamSha}`,
    ];

    return [
      fileLines.join("\n"),
      "### Base",
      "````text",
      file.initialContent,
      "````",
      "### Ours",
      "````text",
      file.content,
      "````",
      "### Upstream",
      "````text",
      file.upstreamContent,
      "````",
      "### Base -> Ours patch",
      "````diff",
      baseToStagedPatch.patch,
      "````",
      "### Base -> Upstream patch",
      "````diff",
      baseToUpstreamPatch.patch,
      "````",
    ];
  });

  return [
    "# Samebase rebase conflict bundle",
    `- Repository: ${args.githubRepositoryFullName}`,
    `- Branch: ${args.branch}`,
    "",
    ...sections,
  ].join("\n");
}

function truncateInlineDiffContent(content: string): {
  content: string;
  truncated: boolean;
} {
  if (content.length <= MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD) {
    return { content, truncated: false };
  }

  const suffix = "\n\n... [content truncated for rich preview]";
  const sliceLength = Math.max(0, MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD - suffix.length);

  return {
    content: `${content.slice(0, sliceLength)}${suffix}`,
    truncated: true,
  };
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

function computeLineStats(
  oldContent: string,
  newContent: string,
): {
  additions: number;
  deletions: number;
} {
  const parts = diffLines(oldContent, newContent);
  let additions = 0;
  let deletions = 0;

  for (const part of parts) {
    const value = part.value;
    const lineCount =
      typeof part.count === "number"
        ? part.count
        : value.length === 0
          ? 0
          : value.split("\n").length;

    if (part.added) additions += lineCount;
    if (part.removed) deletions += lineCount;
  }

  return { additions, deletions };
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

export function canHydrateInlineDiffText(path: string, buffer: Uint8Array): boolean {
  const mime = guessMime(path);
  const hasKnownTextMime = mime.includes("charset=utf-8") || mime === "image/svg+xml";

  if (!hasKnownTextMime && mime !== "application/octet-stream") {
    return false;
  }

  return buffer.byteLength <= INLINE_TEXT_MAX && isTextBuffer(buffer);
}

function buildCommitPreviewFileFromContents(args: {
  status: CommitPreviewFile["status"];
  path: string;
  previousPath?: string;
  isBinary?: boolean;
  mimeType?: string;
  oldContent: string;
  newContent: string;
  includePatch: boolean;
  hydrateRichContent?: boolean;
}): CommitPreviewFile {
  const isBinary = args.isBinary ?? false;
  const isMarkdown = !isBinary && isMarkdownPath(args.path);
  const lineStats = isBinary
    ? { additions: 0, deletions: 0 }
    : computeLineStats(args.oldContent, args.newContent);

  let richOldContent: string | undefined;
  let richNewContent: string | undefined;
  let richContentTruncated: boolean | undefined;
  if (!isBinary && (args.hydrateRichContent ?? isMarkdown)) {
    const truncatedOld = truncateInlineDiffContent(args.oldContent);
    const truncatedNew = truncateInlineDiffContent(args.newContent);
    richOldContent = truncatedOld.content;
    richNewContent = truncatedNew.content;
    richContentTruncated = truncatedOld.truncated || truncatedNew.truncated;
  }

  let patch: string | undefined;
  if (
    !isBinary &&
    args.includePatch &&
    !(args.status === "renamed" && args.oldContent === args.newContent)
  ) {
    patch = createTwoFilesPatch(
      args.previousPath ?? args.path,
      args.path,
      args.oldContent,
      args.newContent,
      "",
      "",
      { context: 3 },
    );
  }

  return {
    status: args.status,
    path: args.path,
    previousPath: args.previousPath,
    isBinary,
    mimeType: isBinary ? args.mimeType : undefined,
    additions: lineStats.additions,
    deletions: lineStats.deletions,
    oldLineCount: isBinary ? 0 : countLines(args.oldContent),
    newLineCount: isBinary ? 0 : countLines(args.newContent),
    isMarkdown,
    richOldContent,
    richNewContent,
    richContentTruncated,
    patchTruncated: false,
    patch,
  };
}

function clampCommitPreviewPatches(files: CommitPreviewFile[]): CommitPreviewFile[] {
  let totalPatchChars = 0;

  return files.map((file) => {
    if (typeof file.patch !== "string") {
      return file;
    }

    let boundedPatch = file.patch;
    let patchTruncated = file.patchTruncated;

    if (boundedPatch.length > MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE) {
      boundedPatch = `${boundedPatch.slice(0, MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE)}\n... [patch truncated]`;
      patchTruncated = true;
    }

    const remainingBudget = Math.max(0, MAX_COMMIT_PREVIEW_PATCH_CHARS_TOTAL - totalPatchChars);
    if (boundedPatch.length > remainingBudget) {
      if (remainingBudget > 0) {
        boundedPatch = `${boundedPatch.slice(0, remainingBudget)}\n... [patch truncated]`;
      } else {
        boundedPatch = "... [patch truncated]";
      }
      patchTruncated = true;
    }

    totalPatchChars += boundedPatch.length;

    return {
      ...file,
      patch: boundedPatch,
      patchTruncated,
    };
  });
}

export function buildCommitPreviewTotals(files: CommitPreviewFile[]): CommitPreviewTotals {
  return files.reduce<CommitPreviewTotals>(
    (acc, file) => {
      acc.files += 1;
      acc.additions += file.additions;
      acc.deletions += file.deletions;

      if (file.status === "added") acc.added += 1;
      if (file.status === "modified") acc.modified += 1;
      if (file.status === "deleted") acc.deleted += 1;
      if (file.status === "renamed") acc.renamed += 1;

      return acc;
    },
    {
      files: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      additions: 0,
      deletions: 0,
    },
  );
}

export function buildCommitPreviewSafety(files: CommitPreviewFile[]): CommitPreviewSafety {
  const destructiveFileCount = files.filter((file) => file.status === "deleted").length;
  const truncatedPatchFileCount = files.filter((file) => file.patchTruncated).length;

  return {
    destructiveFileCount,
    truncatedPatchFileCount,
    includesTruncatedPatches: truncatedPatchFileCount > 0,
  };
}

export function finalizeCommitPreviewFiles(files: CommitPreviewFile[]): CommitPreviewFile[] {
  const sortedFiles = [...files].sort((left, right) => left.path.localeCompare(right.path));
  return clampCommitPreviewPatches(sortedFiles);
}

export function buildCommitPreviewFromStagedFiles({
  stagedFiles,
  branch,
  includePatch,
}: {
  stagedFiles: StagedFileForCommit[];
  branch: string;
  includePatch: boolean;
}): CommitPreviewResult {
  const files = finalizeCommitPreviewFiles(
    stagedFiles.map((file) => {
      const isBinary = isBinaryStagedFile(file);
      const renamed = file.filePath !== file.initialFilePath;
      const status = file.fileDeleted
        ? ("deleted" as const)
        : file.parentCommitSha === null
          ? ("added" as const)
          : renamed
            ? ("renamed" as const)
            : ("modified" as const);

      return buildCommitPreviewFileFromContents({
        status,
        path: file.fileDeleted ? file.initialFilePath : file.filePath,
        previousPath: renamed && !file.fileDeleted ? file.initialFilePath : undefined,
        isBinary,
        mimeType: isBinary ? file.mime : undefined,
        oldContent: isBinary ? "" : file.initialContent,
        newContent: file.fileDeleted || isBinary ? "" : file.content,
        includePatch,
        hydrateRichContent: true,
      });
    }),
  );
  const totals = buildCommitPreviewTotals(files);
  const safety = buildCommitPreviewSafety(files);

  return {
    branch,
    hasDestructiveChanges: totals.deleted > 0,
    files,
    totals,
    safety,
  };
}

function readCommitPreviewFileStatus(
  status: string | null | undefined,
): CommitPreviewFile["status"] {
  if (status === "added") {
    return "added";
  }
  if (status === "removed") {
    return "deleted";
  }
  if (status === "renamed") {
    return "renamed";
  }
  return "modified";
}

function buildRemoteComparePreviewFileFromMetadata(
  file: GitHubCompareFileCandidate,
): CommitPreviewFile | null {
  if (typeof file.filename !== "string" || file.filename.length === 0) {
    return null;
  }

  return {
    status: readCommitPreviewFileStatus(file.status),
    path: file.filename,
    previousPath:
      typeof file.previous_filename === "string" && file.previous_filename.length > 0
        ? file.previous_filename
        : undefined,
    isBinary: false,
    mimeType: undefined,
    additions: typeof file.additions === "number" ? file.additions : 0,
    deletions: typeof file.deletions === "number" ? file.deletions : 0,
    oldLineCount: 0,
    newLineCount: 0,
    isMarkdown: isMarkdownPath(file.filename),
    patchTruncated: false,
    patch: typeof file.patch === "string" && file.patch.length > 0 ? file.patch : undefined,
  };
}

/**
 * GitHub compare metadata only includes patch text, but compare mode needs full
 * old/new text content whenever we want to reuse the inline merge view instead
 * of falling back to a raw patch.
 */
export async function buildRemoteComparePreviewFile(args: {
  file: GitHubCompareFileCandidate;
  baseShaByPath: Map<string, string>;
  headShaByPath: Map<string, string>;
  getBlobBufferBySha: (sha: string) => Promise<Uint8Array>;
  includePatch: boolean;
}): Promise<CommitPreviewFile | null> {
  const metadataFile = buildRemoteComparePreviewFileFromMetadata(args.file);
  if (!metadataFile) {
    return null;
  }
  const metadataFileWithoutPatch = args.includePatch
    ? metadataFile
    : {
        ...metadataFile,
        patch: undefined,
      };

  const basePath =
    metadataFile.status === "renamed" && typeof metadataFile.previousPath === "string"
      ? metadataFile.previousPath
      : metadataFile.path;
  const oldSha =
    metadataFile.status === "added" ? null : (args.baseShaByPath.get(basePath) ?? null);
  const newSha =
    metadataFile.status === "deleted" ? null : (args.headShaByPath.get(metadataFile.path) ?? null);

  if (
    (metadataFile.status !== "added" && !oldSha) ||
    (metadataFile.status !== "deleted" && !newSha)
  ) {
    return metadataFileWithoutPatch;
  }

  const oldBuffer = oldSha ? await args.getBlobBufferBySha(oldSha) : null;
  const newBuffer = newSha ? await args.getBlobBufferBySha(newSha) : null;
  const oldContent =
    oldBuffer && canHydrateInlineDiffText(metadataFile.path, oldBuffer)
      ? new TextDecoder("utf-8", { fatal: false }).decode(oldBuffer)
      : null;
  const newContent =
    newBuffer && canHydrateInlineDiffText(metadataFile.path, newBuffer)
      ? new TextDecoder("utf-8", { fatal: false }).decode(newBuffer)
      : null;

  if (
    (metadataFile.status !== "added" && oldContent === null) ||
    (metadataFile.status !== "deleted" && newContent === null)
  ) {
    return metadataFileWithoutPatch;
  }

  return buildCommitPreviewFileFromContents({
    status: metadataFile.status,
    path: metadataFile.path,
    previousPath: metadataFile.previousPath,
    oldContent: oldContent ?? "",
    newContent: newContent ?? "",
    includePatch: args.includePatch,
    hydrateRichContent: true,
  });
}

function findMatchingRemoteCompareFile(args: {
  stagedFile: StagedFileForCommit;
  remoteFilesByPath: Map<string, CommitPreviewFile>;
  remoteFilesByPreviousPath: Map<string, CommitPreviewFile>;
}): CommitPreviewFile | null {
  const candidates = [
    args.remoteFilesByPath.get(args.stagedFile.initialFilePath),
    args.remoteFilesByPath.get(args.stagedFile.filePath),
    args.remoteFilesByPreviousPath.get(args.stagedFile.initialFilePath),
    args.remoteFilesByPreviousPath.get(args.stagedFile.filePath),
  ];

  for (const candidate of candidates) {
    if (candidate && args.remoteFilesByPath.has(candidate.path)) {
      return candidate;
    }
  }

  return null;
}

function resolveComparedStagedFileBasePath(args: {
  stagedFile: StagedFileForCommit;
  matchedRemoteFile: Pick<CommitPreviewFile, "status" | "path" | "previousPath"> | null;
  baseTreePaths: Set<string>;
}): string | null {
  if (args.matchedRemoteFile) {
    if (args.matchedRemoteFile.status === "added") {
      return null;
    }

    if (
      args.matchedRemoteFile.status === "renamed" &&
      typeof args.matchedRemoteFile.previousPath === "string"
    ) {
      return args.matchedRemoteFile.previousPath;
    }

    return args.matchedRemoteFile.path;
  }

  if (args.baseTreePaths.has(args.stagedFile.initialFilePath)) {
    return args.stagedFile.initialFilePath;
  }

  if (args.baseTreePaths.has(args.stagedFile.filePath)) {
    return args.stagedFile.filePath;
  }

  return null;
}

/**
 * Compare mode needs to reinterpret staged rows against the PR/base side rather
 * than against the current branch head, otherwise remote PR changes and local
 * staged edits produce incorrect statuses like added->renamed or deleted->added.
 * These rows are editor-backed text files, so they should keep the same rich
 * merge surface for code/text diffs that markdown already uses.
 */
export function buildComparedCommitPreviewFileFromStagedFile(args: {
  stagedFile: StagedFileForCommit;
  matchedRemoteFile: Pick<CommitPreviewFile, "status" | "path" | "previousPath"> | null;
  basePath: string | null;
  baseContent: string;
  includePatch: boolean;
}): CommitPreviewFile | null {
  if (args.stagedFile.fileDeleted) {
    if (args.basePath === null) {
      return null;
    }

    return buildCommitPreviewFileFromContents({
      status: "deleted",
      path: args.basePath,
      oldContent: args.baseContent,
      newContent: "",
      includePatch: args.includePatch,
      hydrateRichContent: true,
    });
  }

  if (args.basePath === null) {
    return buildCommitPreviewFileFromContents({
      status: "added",
      path: args.stagedFile.filePath,
      oldContent: "",
      newContent: args.stagedFile.content,
      includePatch: args.includePatch,
      hydrateRichContent: true,
    });
  }

  const previousPath =
    args.matchedRemoteFile?.status === "renamed" &&
    typeof args.matchedRemoteFile.previousPath === "string"
      ? args.matchedRemoteFile.previousPath
      : args.basePath !== args.stagedFile.filePath
        ? args.basePath
        : undefined;

  if (!previousPath && args.stagedFile.content === args.baseContent) {
    return null;
  }

  return buildCommitPreviewFileFromContents({
    status: previousPath ? "renamed" : "modified",
    path: args.stagedFile.filePath,
    previousPath,
    oldContent: args.baseContent,
    newContent: args.stagedFile.content,
    includePatch: args.includePatch,
    hydrateRichContent: true,
  });
}

export async function buildBranchComparePreviewFiles(args: {
  remoteFiles: CommitPreviewFile[];
  stagedFiles: StagedFileForCommit[];
  baseShaByPath: Map<string, string>;
  getBlobTextBySha: (sha: string) => Promise<string>;
  includePatch: boolean;
}): Promise<CommitPreviewFile[]> {
  const remoteFilesByPath = new Map(args.remoteFiles.map((file) => [file.path, file]));
  const remoteFilesByPreviousPath = new Map(
    args.remoteFiles.flatMap((file) =>
      typeof file.previousPath === "string" ? ([[file.previousPath, file]] as const) : [],
    ),
  );
  const baseTreePaths = new Set(args.baseShaByPath.keys());
  const overlayFiles: CommitPreviewFile[] = [];

  for (const stagedFile of args.stagedFiles) {
    const matchedRemoteFile = findMatchingRemoteCompareFile({
      stagedFile,
      remoteFilesByPath,
      remoteFilesByPreviousPath,
    });
    if (matchedRemoteFile) {
      remoteFilesByPath.delete(matchedRemoteFile.path);
      if (typeof matchedRemoteFile.previousPath === "string") {
        remoteFilesByPreviousPath.delete(matchedRemoteFile.previousPath);
      }
    }

    const basePath = resolveComparedStagedFileBasePath({
      stagedFile,
      matchedRemoteFile,
      baseTreePaths,
    });
    const baseSha = typeof basePath === "string" ? args.baseShaByPath.get(basePath) : undefined;
    const baseContent = typeof baseSha === "string" ? await args.getBlobTextBySha(baseSha) : "";

    const overlayFile = buildComparedCommitPreviewFileFromStagedFile({
      stagedFile,
      matchedRemoteFile,
      basePath,
      baseContent,
      includePatch: args.includePatch,
    });
    if (overlayFile) {
      overlayFiles.push(overlayFile);
    }
  }

  return finalizeCommitPreviewFiles([...remoteFilesByPath.values(), ...overlayFiles]);
}

export async function getPullRequestCompareFiles(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullRequestNumber: number;
}): Promise<GitHubCompareFileCandidate[]> {
  const files: GitHubCompareFileCandidate[] = [];

  for (let page = 1; page <= 50; page += 1) {
    const response = await args.octokit.rest.pulls.listFiles({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullRequestNumber,
      per_page: 100,
      page,
    });
    files.push(...response.data);

    if (response.data.length < 100) {
      break;
    }
  }

  return files;
}
