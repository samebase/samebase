import { v, type Infer } from "convex/values";

const { array, boolean, literal, number, object, optional, string, union } = v;

export const stagedFileFields = {
  repositoryId: string(),
  fileDeleted: boolean(),
  kind: optional(union(literal("text"), literal("binary"))),
  filePath: string(),
  initialFilePath: string(),
  content: string(),
  initialContent: string(),
  storageId: optional(string()),
  mime: optional(string()),
  size: optional(number()),
  stagedBlobSha: optional(string()),
  parentCommitSha: union(string(), v.null()),
  lastEditTime: number(),
  lastEditUserId: string(),
  branch: string(),
  version: number(),
};

export const stagedFile = object({
  _id: string(),
  _creationTime: number(),
  ...stagedFileFields,
});
export type StagedFile = Infer<typeof stagedFile>;

export const stagedFileSnapshot = object({ _id: string(), ...stagedFileFields });
export type StagedFileSnapshot = Infer<typeof stagedFileSnapshot>;

export const committedStagedFile = object({
  snapshot: stagedFileSnapshot,
  committedContent: string(),
  committedBlobSha: union(string(), v.null()),
});

export const stagedFilesCategoryCounts = object({
  modified: number(),
  deleted: number(),
  new: number(),
  renamed: number(),
  renamedAndModified: number(),
  total: number(),
});
export const stagedFilesBranchSummary = object({
  branch: string(),
  counts: stagedFilesCategoryCounts,
});

export const storageReleaseResult = object({ releasedStorageIds: array(string()) });

export const deletionSnapshotSeed = object({
  initialContent: string(),
  kind: union(literal("text"), literal("binary")),
  mime: optional(string()),
  size: optional(number()),
  stagedBlobSha: optional(string()),
});

export const reconcileInstruction = union(
  object({ action: literal("delete"), stagingId: string(), branch: string() }),
  object({
    action: literal("update"),
    stagingId: string(),
    branch: string(),
    parentCommitSha: union(string(), v.null()),
    initialContent: optional(string()),
  }),
);
