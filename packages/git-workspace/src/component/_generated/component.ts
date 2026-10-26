/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    blobs: {
      deleteRepositoryBatch: FunctionReference<
        "mutation",
        "internal",
        { repositoryId: string },
        number,
        Name
      >;
      getBySha: FunctionReference<
        "query",
        "internal",
        { sha: string },
        {
          _creationTime: number;
          _id: string;
          ext?: string;
          mime?: string;
          repositoryId: string;
          sha: string;
          size: number;
          storageId?: string;
          text?: string;
        } | null,
        Name
      >;
      save: FunctionReference<
        "mutation",
        "internal",
        {
          ext: string;
          mime: string;
          repositoryId: string;
          sha: string;
          size: number;
          storageId?: string;
          text?: string;
        },
        {
          _creationTime: number;
          _id: string;
          ext?: string;
          mime?: string;
          repositoryId: string;
          sha: string;
          size: number;
          storageId?: string;
          text?: string;
        },
        Name
      >;
    };
    branches: {
      claimRefresh: FunctionReference<
        "mutation",
        "internal",
        { repositoryId: string },
        | { claimed: true; startedAt: number }
        | { claimed: false; reason: "cooldown" | "in_progress" },
        Name
      >;
      deleteRepositoryBatch: FunctionReference<
        "mutation",
        "internal",
        { repositoryId: string; table: "branchTrees" | "repositorySyncState" },
        number,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { branch: string; repositoryId: string },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          commitSHA: string;
          lastTreeRefreshAt: number;
          repositoryId: string;
          treeData: {
            sha: string;
            tree: Array<{
              mode: string;
              path: string;
              sha: string;
              size?: number;
              type: string;
              url?: string;
            }>;
            truncated: boolean;
            url?: string;
          };
        } | null,
        Name
      >;
      getSyncState: FunctionReference<
        "query",
        "internal",
        { repositoryId: string },
        {
          _creationTime: number;
          _id: string;
          lastTreeRefreshFailedAt?: number;
          repositoryId: string;
          treeRefreshCooldownUntil?: number;
          treeRefreshFailureKind?: "failed" | "rate_limited";
          treeRefreshFailureMessage?: string;
          treeRefreshStartedAt?: number;
        } | null,
        Name
      >;
      recordRefreshFailure: FunctionReference<
        "mutation",
        "internal",
        {
          cooldownUntil?: number;
          failureKind?: "failed" | "rate_limited";
          failureMessage?: string;
          repositoryId: string;
          startedAt?: number;
        },
        null,
        Name
      >;
      releaseRefresh: FunctionReference<
        "mutation",
        "internal",
        {
          cooldownUntil?: number;
          failureKind?: "failed" | "rate_limited";
          failureMessage?: string;
          markRefreshed: boolean;
          repositoryId: string;
          startedAt: number;
        },
        { released: boolean },
        Name
      >;
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          commitSHA: string;
          repositoryId: string;
          startedAt?: number;
          treeData: {
            sha: string;
            tree: Array<{
              mode: string;
              path: string;
              sha: string;
              size?: number;
              type: string;
              url?: string;
            }>;
            truncated: boolean;
            url?: string;
          };
        },
        { written: boolean },
        Name
      >;
    };
    collaborative: {
      pullUpdates: FunctionReference<
        "query",
        "internal",
        {
          branch: string;
          filePath: string;
          repositoryId: string;
          version: number;
        },
        Array<{
          changes: string;
          clientID: string;
          userId: string;
          version: number;
        }>,
        Name
      >;
      pushContentUpdate: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          expectedVersion: number;
          filePath: string;
          newContent: string;
          repositoryId: string;
          userId: string;
        },
        null,
        Name
      >;
      pushUpdates: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          filePath: string;
          repositoryId: string;
          updates: Array<{ changes: string; clientId: string }>;
          userId: string;
          version: number;
        },
        { newVersion: number; success: boolean },
        Name
      >;
    };
    staging: {
      clearAllStaging: FunctionReference<
        "mutation",
        "internal",
        { branch?: string; repositoryId: string },
        null,
        Name
      >;
      clearCommittedStaging: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          committedFiles: Array<{
            committedBlobSha: string | null;
            committedContent: string;
            snapshot: {
              _id: string;
              branch: string;
              content: string;
              fileDeleted: boolean;
              filePath: string;
              initialContent: string;
              initialFilePath: string;
              kind?: "text" | "binary";
              lastEditTime: number;
              lastEditUserId: string;
              mime?: string;
              parentCommitSha: string | null;
              repositoryId: string;
              size?: number;
              stagedBlobSha?: string;
              storageId?: string;
              version: number;
            };
          }>;
          repositoryId: string;
        },
        null,
        Name
      >;
      clearMatchingStagingSnapshot: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          repositoryId: string;
          stagedFiles: Array<{
            _id: string;
            branch: string;
            content: string;
            fileDeleted: boolean;
            filePath: string;
            initialContent: string;
            initialFilePath: string;
            kind?: "text" | "binary";
            lastEditTime: number;
            lastEditUserId: string;
            mime?: string;
            parentCommitSha: string | null;
            repositoryId: string;
            size?: number;
            stagedBlobSha?: string;
            storageId?: string;
            version: number;
          }>;
        },
        null,
        Name
      >;
      createFileInStaging: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          content: string;
          filePath: string;
          repositoryId: string;
          userId: string;
        },
        null,
        Name
      >;
      deleteRepositoryBatch: FunctionReference<
        "mutation",
        "internal",
        { repositoryId: string; table: "stagedFiles" | "fileUpdates" },
        number,
        Name
      >;
      duplicateBranchStaging: FunctionReference<
        "mutation",
        "internal",
        {
          repositoryId: string;
          sourceBranch: string;
          stagedFiles: Array<{
            _id: string;
            branch: string;
            content: string;
            fileDeleted: boolean;
            filePath: string;
            initialContent: string;
            initialFilePath: string;
            kind?: "text" | "binary";
            lastEditTime: number;
            lastEditUserId: string;
            mime?: string;
            parentCommitSha: string | null;
            repositoryId: string;
            size?: number;
            stagedBlobSha?: string;
            storageId?: string;
            version: number;
          }>;
          targetBranch: string;
        },
        null,
        Name
      >;
      getByNewPath: FunctionReference<
        "query",
        "internal",
        { branch: string; newPath: string; repositoryId: string },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        } | null,
        Name
      >;
      getByOriginalPath: FunctionReference<
        "query",
        "internal",
        { branch: string; originalFilePath: string; repositoryId: string },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        } | null,
        Name
      >;
      getRepositorySummary: FunctionReference<
        "query",
        "internal",
        { repositoryId: string },
        { fileCount: number; lastEditTime?: number },
        Name
      >;
      initializeBinaryFile: FunctionReference<
        "mutation",
        "internal",
        {
          blobSha: string;
          branch: string;
          filePath: string;
          mime: string;
          repositoryId: string;
          size: number;
          storageId: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        },
        Name
      >;
      listAllStagedFiles: FunctionReference<
        "query",
        "internal",
        { branch?: string; includeUnchanged?: boolean; repositoryId: string },
        Array<{
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        }>,
        Name
      >;
      listBranchSummaries: FunctionReference<
        "query",
        "internal",
        { repositoryId: string },
        Array<{
          branch: string;
          counts: {
            deleted: number;
            modified: number;
            new: number;
            renamed: number;
            renamedAndModified: number;
            total: number;
          };
        }>,
        Name
      >;
      markFileForDeletion: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          filePath: string;
          parentCommitSha: string | null;
          repositoryId: string;
          userId: string;
        },
        null,
        Name
      >;
      reconcileStagingWithTree: FunctionReference<
        "mutation",
        "internal",
        {
          instructions: Array<
            | { action: "delete"; branch: string; stagingId: string }
            | {
                action: "update";
                branch: string;
                initialContent?: string;
                parentCommitSha: string | null;
                stagingId: string;
              }
          >;
          repositoryId: string;
        },
        null,
        Name
      >;
      rename: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          initialFilePath: string;
          newPath: string;
          repositoryId: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        },
        Name
      >;
      revertDeletedFileInStaging: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          filePath: string;
          repositoryId: string;
          userId: string;
        },
        null,
        Name
      >;
      saveBinaryUploadToStaging: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          filePath: string;
          mime: string;
          replaceExisting: boolean;
          repositoryId: string;
          size: number;
          stagedBlobSha: string;
          storageId: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        },
        Name
      >;
      saveToStaging: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          content: string;
          initialContent: string;
          initialFilePath: string;
          parentCommitSha: string | null;
          repositoryId: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        },
        Name
      >;
      updateStagedFileContent: FunctionReference<
        "mutation",
        "internal",
        {
          branch: string;
          content: string;
          expectedVersion: number;
          repositoryId: string;
          stagingId: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          branch: string;
          content: string;
          fileDeleted: boolean;
          filePath: string;
          initialContent: string;
          initialFilePath: string;
          kind?: "text" | "binary";
          lastEditTime: number;
          lastEditUserId: string;
          mime?: string;
          parentCommitSha: string | null;
          repositoryId: string;
          size?: number;
          stagedBlobSha?: string;
          storageId?: string;
          version: number;
        },
        Name
      >;
    };
    storage: {
      deletePendingUpload: FunctionReference<
        "mutation",
        "internal",
        { storageId: string },
        null,
        Name
      >;
      generateUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {},
        string,
        Name
      >;
      getUrl: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        string | null,
        Name
      >;
      releaseUnreferenced: FunctionReference<
        "mutation",
        "internal",
        { storageIds: Array<string> },
        null,
        Name
      >;
    };
  };
