export type StagedFileChangeCandidate = {
  fileDeleted: boolean;
  parentCommitSha: string | null;
  filePath: string;
  initialFilePath: string;
  content: string;
  initialContent: string;
};

export function hasStagedFileChanges(file: StagedFileChangeCandidate): boolean {
  if (file.parentCommitSha === null) {
    return !file.fileDeleted;
  }

  return (
    file.content !== file.initialContent ||
    file.fileDeleted ||
    file.filePath !== file.initialFilePath
  );
}
