import type { Infer } from "convex/values";
import type { stagedFilesCategoryCounts, StagedFile } from "./model.js";
export type StagedFileKind = "text" | "binary";

export type StagedFileStatus = "added" | "modified" | "renamed" | "deleted";

type StagedFileKindLike = {
  kind?: StagedFileKind;
};

type StagedFileBinaryStateLike = StagedFileKindLike & {
  parentCommitSha: string | null;
  stagedBlobSha?: string | null;
};

export type StagedFileChangeCandidate = StagedFileBinaryStateLike & {
  fileDeleted: boolean;
  filePath: string;
  initialFilePath: string;
  content: string;
  initialContent: string;
};

export function readStagedFileKind(kind?: StagedFileKind): StagedFileKind {
  return kind ?? "text";
}

export function hasStagedBinaryContentChange(file: StagedFileBinaryStateLike): boolean {
  return (
    readStagedFileKind(file.kind) === "binary" &&
    typeof file.stagedBlobSha === "string" &&
    file.stagedBlobSha !== file.parentCommitSha
  );
}

export function hasStagedFileContentChange(file: StagedFileChangeCandidate): boolean {
  if (readStagedFileKind(file.kind) === "binary") {
    return hasStagedBinaryContentChange(file);
  }

  return file.content !== file.initialContent;
}

export function hasStagedFileChanges(file: StagedFileChangeCandidate): boolean {
  if (file.parentCommitSha === null) {
    return !file.fileDeleted;
  }

  return (
    file.fileDeleted || file.filePath !== file.initialFilePath || hasStagedFileContentChange(file)
  );
}

export function getStagedFileStatus(file: StagedFileChangeCandidate): StagedFileStatus | null {
  if (file.fileDeleted) {
    return "deleted";
  }
  if (file.parentCommitSha === null) {
    return "added";
  }
  if (file.filePath !== file.initialFilePath) {
    return "renamed";
  }
  if (hasStagedFileContentChange(file)) {
    return "modified";
  }
  return null;
}

type StagedFileSummaryInput = StagedFileChangeCandidate & Pick<StagedFile, "branch">;
type StagedFilesCategoryCounts = Infer<typeof stagedFilesCategoryCounts>;
export function summarizeStagedFilesByBranch(files: StagedFileSummaryInput[]) {
  const countsByBranch = new Map<string, StagedFilesCategoryCounts>();
  for (const file of files) {
    if (!hasStagedFileChanges(file)) continue;
    const category = file.fileDeleted
      ? "deleted"
      : file.parentCommitSha === null
        ? "new"
        : file.filePath !== file.initialFilePath
          ? hasStagedFileContentChange(file)
            ? "renamedAndModified"
            : "renamed"
          : "modified";
    const counts = countsByBranch.get(file.branch) ?? {
      modified: 0,
      deleted: 0,
      new: 0,
      renamed: 0,
      renamedAndModified: 0,
      total: 0,
    };
    counts[category] += 1;
    counts.total += 1;
    countsByBranch.set(file.branch, counts);
  }
  return Array.from(countsByBranch, ([branch, counts]) => ({ branch, counts })).sort(
    (left, right) => left.branch.localeCompare(right.branch),
  );
}
