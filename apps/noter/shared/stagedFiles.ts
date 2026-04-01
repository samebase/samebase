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

export function hasStagedBinaryContentChange(
  file: StagedFileBinaryStateLike,
): boolean {
  return (
    readStagedFileKind(file.kind) === "binary" &&
    typeof file.stagedBlobSha === "string" &&
    file.stagedBlobSha !== file.parentCommitSha
  );
}

export function hasStagedFileContentChange(
  file: StagedFileChangeCandidate,
): boolean {
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
    file.fileDeleted ||
    file.filePath !== file.initialFilePath ||
    hasStagedFileContentChange(file)
  );
}

export function getStagedFileStatus(
  file: StagedFileChangeCandidate,
): StagedFileStatus | null {
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
