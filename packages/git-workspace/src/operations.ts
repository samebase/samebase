import { type Infer } from "convex/values";
import type { Octokit } from "@octokit/rest";
import { notEmpty, isRecord } from "@samebase/dependent/main";
import { guessMime, INLINE_TEXT_MAX, isTextBuffer, withRetry } from "./fileContent.js";
import { loadBlob, uploadBlob } from "./storage.js";
import { getRepositoryMediaKind } from "./repositoryMedia.js";
import { rebaseStagedContent } from "./stagingRebase.js";
import { hasStagedFileChanges, readStagedFileKind } from "./stagingChanges.js";
import { isStaleBaseVersionError } from "./stagingErrors.js";
import {
  reconcileInstruction,
  type StagedFile,
  type StagedFileSnapshot,
  type GitHubTree,
} from "./model.js";
import {
  computeGitBlobShaFromBuffer,
  computeGitBlobShaFromText,
  createCommitWithMultipleFiles,
  getBranchTreeMap,
  getGitHubErrorStatus,
  getTreeMapForRef,
  inspectStagedFilesAgainstLatestHead,
  isBinaryStagedFile,
  rebaseStagedFilesOnLatestHead,
  toGitTreeRef,
  type StagedFileForCommit,
} from "./github.js";
import {
  buildCommitPreviewFromStagedFiles,
  buildRebaseConflictPreviewFromStagedFiles,
  buildRebaseConflictBundleMarkdown,
  canHydrateInlineDiffText,
  buildRemoteComparePreviewFile,
  buildBranchComparePreviewFiles,
  finalizeCommitPreviewFiles,
  buildCommitPreviewTotals,
  buildCommitPreviewSafety,
  type CommitPreviewResult,
  type BranchComparePreviewResult,
  type DraftPullRequestResult,
  type StagedMediaUploadResult,
  type DefaultBranchDraftPullRequestResult,
  type RebaseConflictPreviewResult,
} from "./previews.js";
import {
  compareBranches,
  createDraftPullRequestForBranch,
  getOpenPullRequestForBranch,
  getPullRequestCompareFiles,
} from "./pullRequests.js";
import type { GitWorkspace } from "./operationsContext.js";
function sanitizeSlug(input: string, maxLen = 58): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (sanitized.length === 0) {
    return "repository";
  }
  return sanitized.slice(0, maxLen);
}

type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
export type EditableFileState = {
  content: string;
  parentCommitSha: string | null;
  lastEditTime: number;
  branch: string;
  version: number;
};
const PULL_REQUEST_COMPARE_FILE_LIST_LIMIT = 3_000;

export function selectBatchReadRepositoryTree(args: {
  requestedBranch?: string;
  branchTree: GitHubTree[] | null;
}): GitHubTree[] {
  if (args.branchTree) {
    return args.branchTree;
  }
  if (!args.requestedBranch) {
    throw new Error("Default branch tree is not cached. Refresh and retry.");
  }
  throw new Error(
    `Branch tree is not cached for "${args.requestedBranch}". Refresh branch and retry.`,
  );
}

function readDefaultBranch(repoData: unknown): string {
  if (!isRecord(repoData)) {
    return "main";
  }

  const defaultBranch = repoData["default_branch"];
  if (typeof defaultBranch === "string" && defaultBranch.length > 0) {
    return defaultBranch;
  }

  return "main";
}

async function getRepositoryDefaultBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<string> {
  const response = await args.octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
  });
  return readDefaultBranch(response.data);
}

function readEditableFileState(stagedFile: EditableFileState): EditableFileState {
  return {
    content: stagedFile.content,
    parentCommitSha: stagedFile.parentCommitSha,
    lastEditTime: stagedFile.lastEditTime,
    branch: stagedFile.branch,
    version: stagedFile.version,
  };
}

/**
 * Keep auto-created draft branches readable so the PR unit of work also gets a
 * readable branch name.
 */
export function buildDraftBranchName(args: {
  stagedFiles: Array<Pick<StagedFileForCommit, "filePath" | "initialFilePath">>;
  now: number;
}): string {
  const labels = Array.from(
    new Set(
      args.stagedFiles
        .flatMap((file) => [file.filePath, file.initialFilePath])
        .map((path) => path.split("/").at(-1) ?? path)
        .map((segment) => sanitizeSlug(segment, 18))
        .filter((segment) => segment.length > 0),
    ),
  );
  const stem = sanitizeSlug(labels.slice(0, 3).join("-"), 36);
  const suffix = args.now.toString(36);
  return `draft/${stem.length > 0 ? stem : "work"}-${suffix}`;
}

/**
 * Preserve the full staged-file snapshot when forking default-branch staging
 * into a draft branch. Only `_creationTime` is database-specific.
 */
export function stripCreationTimeFromStagingRecord<
  T extends {
    _creationTime: number;
  },
>(file: T): Omit<T, "_creationTime"> {
  const { _creationTime: _ignored, ...snapshot } = file;
  return snapshot;
}

/**
 * Read the current head SHA for a branch. Returning null lets callers avoid
 * destructive rollback when GitHub cannot confirm whether the ref advanced.
 */
async function getBranchHeadShaOrNull(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<string | null> {
  try {
    const refResponse = await args.octokit.rest.git.getRef({
      owner: args.owner,
      repo: args.repo,
      ref: `heads/${args.branch}`,
    });
    return refResponse.data.object.sha;
  } catch (error) {
    console.warn("Failed to inspect branch head after draft error:", error);
    return null;
  }
}

/**
 * Best-effort cleanup for a temporary draft branch that never advanced beyond
 * the default branch head.
 */

export function getDraftPullRequestCreateErrorMessage(error: unknown): string | null {
  const message = getErrorMessage(error);
  if (message.includes("No commits between")) {
    return "This branch has no changes to open as a pull request.";
  }
  if (message.includes("A pull request already exists")) {
    return "A pull request already exists for this branch.";
  }
  return null;
}

function toHeaderMap(value: unknown): HeaderMap | null {
  if (!isRecord(value)) {
    return null;
  }

  const headers: HeaderMap = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (
      typeof headerValue === "string" ||
      typeof headerValue === "number" ||
      headerValue === undefined
    ) {
      headers[key] = headerValue;
      continue;
    }

    if (Array.isArray(headerValue) && headerValue.every((item) => typeof item === "string")) {
      headers[key] = headerValue;
    }
  }

  return headers;
}

function getHeaderValue(headers: HeaderMap | null, name: string): string | null {
  if (!headers) {
    return null;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    return null;
  }

  return null;
}

function getErrorHeaders(error: unknown): HeaderMap | null {
  if (!isRecord(error)) {
    return null;
  }

  const response = error["response"];
  if (!isRecord(response)) {
    return null;
  }

  return toHeaderMap(response["headers"]);
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  const message = error["message"];
  return typeof message === "string" ? message : "";
}

function isGitHubRateLimitError(error: unknown): boolean {
  const status = getGitHubErrorStatus(error);
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }

  const headers = getErrorHeaders(error);
  if (getHeaderValue(headers, "retry-after") !== null) {
    return true;
  }

  const remaining = getHeaderValue(headers, "x-ratelimit-remaining");
  if (remaining === "0") {
    return true;
  }

  return getErrorMessage(error).toLowerCase().includes("rate limit");
}

export function shouldAdvanceBinaryPullParentCommit(args: {
  stagedBlobSha?: string | null;
  fileDeleted?: boolean;
  upstreamSha: string;
}): boolean {
  return args.fileDeleted !== true && args.stagedBlobSha === args.upstreamSha;
}
/** Repository files and uploads share binary staging and storage references. */
async function stageRepositoryBinaryBlobForEditing<
  RepositoryId extends string,
  UserId extends string,
>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: {
    originalFilePath: string;
    targetBranch: string;
    filePath: string;
    fileSha: string;
    storageId: string | null | undefined;
    mime: string | null | undefined;
    size: number;
    missingStorageError: string;
  },
): Promise<EditableFileState> {
  if (getRepositoryMediaKind(args.filePath) === null) {
    throw new Error("File content is stored in storage-backed binary form.");
  }
  if (typeof args.storageId !== "string") {
    throw new Error(args.missingStorageError);
  }

  const { ctx, host, repository, userId } = workspace;
  const stagedFile = await ctx.runMutation(host.initializeBinaryFile, {
    repositoryId: repository.repositoryId,
    filePath: args.originalFilePath,
    branch: args.targetBranch,
    storageId: args.storageId,
    mime: args.mime ?? guessMime(args.filePath),
    size: args.size,
    blobSha: args.fileSha,
    userId,
  });

  return readEditableFileState(stagedFile);
}
async function cleanupTemporaryDraftBranch<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: {
    branch: string;
  },
) {
  const { ctx, host, repository, userId, octokit } = workspace;
  try {
    await ctx.runMutation(host.clearAllStagingForOperation, {
      repositoryId: repository.repositoryId,
      userId,
      branch: args.branch,
      skipTreeUpdate: true,
    });
  } catch (cleanupError) {
    console.warn(
      "Failed to clear temporary draft-branch staging after draft PR error:",
      cleanupError,
    );
  }

  try {
    await octokit.rest.git.deleteRef({
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      ref: `heads/${args.branch}`,
    });
  } catch (cleanupError) {
    console.warn("Failed to remove temporary draft branch after draft PR error:", cleanupError);
  }
}

export async function openFile<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { originalFilePath: string; branch?: string },
): Promise<EditableFileState> {
  const { ctx, component, host, repository, userId, octokit } = workspace;
  const targetBranch =
    args.branch ??
    (await getRepositoryDefaultBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
    }));

  // Check if there's staged content for this file
  const staging = await ctx.runQuery(component.staging.getByOriginalPath, {
    repositoryId: repository.repositoryId,
    originalFilePath: args.originalFilePath,
    branch: targetBranch,
  });

  // TODO: Maybe also check the github, if it has updates
  if (staging) {
    // Return staged content
    return {
      content: staging.content,
      parentCommitSha: staging.parentCommitSha,
      lastEditTime: staging.lastEditTime,
      branch: staging.branch,
      version: staging.version,
    };
  }

  try {
    const file = await octokit.rest.repos.getContent({
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      path: args.originalFilePath,
      ref: targetBranch,
    });

    if (Array.isArray(file.data)) {
      throw new Error("Path is a directory");
    }

    if (file.data.type !== "file") {
      throw new Error("Path is not a file");
    }

    const filePath = file.data.path;
    const fileSha = file.data.sha;
    if (typeof fileSha !== "string" || fileSha.length === 0) {
      throw new Error("File SHA is missing");
    }

    const cachedBlob = await ctx.runQuery(component.blobs.getBySha, {
      sha: fileSha,
    });

    if (cachedBlob) {
      if (typeof cachedBlob.text !== "string") {
        return stageRepositoryBinaryBlobForEditing(workspace, {
          originalFilePath: args.originalFilePath,
          targetBranch,
          filePath,
          fileSha,
          storageId: cachedBlob.storageId,
          mime: cachedBlob.mime,
          size: file.data.size,
          missingStorageError: "Cached binary blob is missing storage data.",
        });
      }

      const stagedFile = await ctx.runMutation(host.saveToStaging, {
        branch: targetBranch,
        repositoryId: repository.repositoryId,
        initialFilePath: args.originalFilePath,
        content: cachedBlob.text,
        initialContent: cachedBlob.text,
        parentCommitSha: fileSha,
        userId,
      });

      return readEditableFileState(stagedFile);
    }

    const blobResponse = await octokit.rest.git.getBlob({
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      file_sha: fileSha,
    });
    const buffer = Buffer.from(blobResponse.data.content, "base64");
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const isText = isTextBuffer(new Uint8Array(buffer));
    let mime = guessMime(filePath);
    if (mime === "application/octet-stream" && isText) {
      mime = "text/plain; charset=utf-8";
    }

    const blobContent =
      isText && file.data.size < INLINE_TEXT_MAX
        ? { text: buffer.toString("utf-8"), storageId: undefined }
        : {
            text: undefined,
            storageId: await withRetry(() =>
              uploadBlob(ctx, component, new Blob([buffer], { type: mime })),
            ),
          };
    const savedBlob = await ctx.runMutation(host.saveFileBlob, {
      repositoryId: repository.repositoryId,
      sha: fileSha,
      size: file.data.size,
      mime,
      text: blobContent.text,
      storageId: blobContent.storageId,
      ext,
    });

    if (!savedBlob) {
      throw new Error("Repository is unavailable.");
    }

    if (typeof savedBlob.text !== "string") {
      return stageRepositoryBinaryBlobForEditing(workspace, {
        originalFilePath: args.originalFilePath,
        targetBranch,
        filePath,
        fileSha,
        storageId: savedBlob.storageId,
        mime,
        size: file.data.size,
        missingStorageError: "Saved binary blob is missing storage data.",
      });
    }

    const stagedFile = await ctx.runMutation(host.saveToStaging, {
      branch: targetBranch,
      repositoryId: repository.repositoryId,
      initialFilePath: args.originalFilePath,
      content: savedBlob.text,
      initialContent: savedBlob.text,
      parentCommitSha: fileSha,
      userId,
    });

    return readEditableFileState(stagedFile);
  } catch (error) {
    console.error("error", error);
    throw error;
  }
}

export async function stageUploadedMedia<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: {
    filePath: string;
    storageId: string;
    branch?: string;
    replaceExisting: boolean;
  },
): Promise<StagedMediaUploadResult> {
  const { ctx, host, repository, userId, octokit } = workspace;
  if (getRepositoryMediaKind(args.filePath) !== "image")
    throw new Error("Only image uploads are supported right now.");
  const targetBranch =
    args.branch ??
    (await getRepositoryDefaultBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
    }));

  const uploadedBlob = await loadBlob(ctx, workspace.component, args.storageId);
  if (!uploadedBlob) {
    throw new Error("Uploaded media is no longer available.");
  }

  const uploadedBuffer = Buffer.from(await uploadedBlob.arrayBuffer());
  const stagedBlobSha = computeGitBlobShaFromBuffer(uploadedBuffer);
  const stagedFile = await ctx.runMutation(host.saveBinaryUploadToStaging, {
    repositoryId: repository.repositoryId,
    filePath: args.filePath,
    branch: targetBranch,
    storageId: args.storageId,
    mime: uploadedBlob.type || guessMime(args.filePath),
    size: uploadedBlob.size,
    stagedBlobSha,
    replaceExisting: args.replaceExisting,
    userId,
  });

  return {
    filePath: stagedFile.filePath,
    branch: stagedFile.branch,
    parentCommitSha: stagedFile.parentCommitSha ?? undefined,
    replacedExisting: stagedFile.parentCommitSha !== null,
  };
}

export async function createDraftPullRequest<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string },
): Promise<DraftPullRequestResult> {
  const { ctx, component, repository, octokit } = workspace;
  const defaultBranch = await getRepositoryDefaultBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
  });
  const branch = args.branch?.trim() || defaultBranch;

  if (branch === defaultBranch) {
    throw new Error("Create the draft PR from a non-default branch.");
  }

  const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
    component.staging.listAllStagedFiles,
    {
      repositoryId: repository.repositoryId,
      branch,
    },
  );
  if (stagedFiles.length > 0) {
    await commitAllStaged(workspace, {
      branch,
    });
  }

  const existingPullRequest = await getOpenPullRequestForBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    branch,
    baseBranch: defaultBranch,
  });
  if (existingPullRequest) {
    return {
      url: existingPullRequest.url,
      number: existingPullRequest.number,
      existing: true,
    };
  }

  const comparison = await compareBranches({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    baseBranch: defaultBranch,
    branch,
  });
  if (comparison.ahead_by === 0) {
    throw new Error("This branch has no changes to open as a pull request.");
  }

  try {
    const response = await createDraftPullRequestForBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      branch,
      baseBranch: defaultBranch,
    });

    return {
      url: response.html_url,
      number: response.number,
      existing: false,
    };
  } catch (error) {
    const currentPullRequest = await getOpenPullRequestForBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      branch,
      baseBranch: defaultBranch,
    });
    if (currentPullRequest) {
      return {
        url: currentPullRequest.url,
        number: currentPullRequest.number,
        existing: true,
      };
    }

    const friendlyMessage = getDraftPullRequestCreateErrorMessage(error);
    if (friendlyMessage) {
      throw new Error(friendlyMessage);
    }
    throw error;
  }
}

export async function createDraftPullRequestFromDefaultBranch<
  RepositoryId extends string,
  UserId extends string,
>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string },
): Promise<DefaultBranchDraftPullRequestResult> {
  const { ctx, component, host, repository, userId, octokit } = workspace;
  const defaultBranch = await getRepositoryDefaultBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
  });
  const sourceBranch = args.branch?.trim() || defaultBranch;
  if (sourceBranch !== defaultBranch) {
    throw new Error("Create a new draft branch from the default branch.");
  }

  const stagedFilesResult: StagedFile[] = await ctx.runQuery(component.staging.listAllStagedFiles, {
    repositoryId: repository.repositoryId,
    branch: defaultBranch,
  });
  const stagedFiles: StagedFileSnapshot[] = stagedFilesResult.map(
    stripCreationTimeFromStagingRecord,
  );
  if (stagedFiles.length === 0) {
    throw new Error("Stage changes on the default branch before drafting.");
  }

  const targetBranch = buildDraftBranchName({
    stagedFiles,
    now: Date.now(),
  });
  const defaultRef = await octokit.rest.git.getRef({
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    ref: `heads/${defaultBranch}`,
  });

  await octokit.rest.git.createRef({
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    ref: `refs/heads/${targetBranch}`,
    sha: defaultRef.data.object.sha,
  });

  const initialTargetBranchSha = defaultRef.data.object.sha;
  try {
    await ctx.runMutation(host.duplicateBranchStaging, {
      repositoryId: repository.repositoryId,
      sourceBranch: defaultBranch,
      targetBranch,
      stagedFiles,
      userId,
    });
  } catch (error) {
    await cleanupTemporaryDraftBranch(workspace, { branch: targetBranch });

    if (error instanceof Error && error.message.length > 0) {
      throw error;
    }
    throw new Error("Failed to create draft pull request");
  }

  try {
    await commitAllStaged(workspace, {
      branch: targetBranch,
    });
  } catch (error) {
    // commitAllStaged can fail after GitHub advances the branch ref, so
    // re-check the head before rolling back the newly created branch.
    const currentTargetBranchSha = await getBranchHeadShaOrNull({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      branch: targetBranch,
    });
    if (currentTargetBranchSha === initialTargetBranchSha) {
      await cleanupTemporaryDraftBranch(workspace, { branch: targetBranch });
    }

    if (error instanceof Error && error.message.length > 0) {
      throw error;
    }
    throw new Error("Failed to create draft pull request");
  }

  try {
    let url: string;
    let number: number;
    try {
      const response = await createDraftPullRequestForBranch({
        octokit,
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        branch: targetBranch,
        baseBranch: defaultBranch,
      });
      url = response.html_url;
      number = response.number;
    } catch (error) {
      const currentPullRequest = await getOpenPullRequestForBranch({
        octokit,
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        branch: targetBranch,
        baseBranch: defaultBranch,
      });
      if (!currentPullRequest) {
        // If GitHub never confirmed a PR, keep the default-branch staging
        // intact so the user can retry from the same source state.
        await cleanupTemporaryDraftBranch(workspace, { branch: targetBranch });

        if (error instanceof Error && error.message.length > 0) {
          throw error;
        }
        throw new Error("Failed to create draft pull request");
      }
      url = currentPullRequest.url;
      number = currentPullRequest.number;
    }

    // Once GitHub confirms the draft PR, clear only the unchanged source
    // snapshot so newer default-branch edits survive while retries do not
    // re-draft the same work.
    await ctx.runMutation(host.clearMatchingStagingSnapshot, {
      repositoryId: repository.repositoryId,
      branch: defaultBranch,
      stagedFiles,
    });

    return {
      branch: targetBranch,
      url,
      number,
    };
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      throw error;
    }
    throw new Error("Failed to create draft pull request");
  }
}

export async function pullFromGitHub<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
): Promise<null> {
  const { ctx, component, host, repository, userId, octokit } = workspace;
  // 1. Read all staging records for this repository (including unchanged)
  const allStaged = await ctx.runQuery(component.staging.listAllStagedFiles, {
    repositoryId: repository.repositoryId,
    includeUnchanged: true,
  });

  // null is a branch deleted on GitHub, such as a merged pull request branch.
  const treeMapByBranch = new Map<string, Promise<Map<string, string> | null>>();
  const getTreeMapForBranch = (branch: string): Promise<Map<string, string> | null> => {
    const existing = treeMapByBranch.get(branch);
    if (existing) {
      return existing;
    }

    const loaded = getBranchTreeMap({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      branch,
    }).catch((error: unknown) => {
      if (getGitHubErrorStatus(error) === 404) {
        return null;
      }
      throw error;
    });
    treeMapByBranch.set(branch, loaded);
    return loaded;
  };

  // 2. Build reconciliation instructions
  const instructions: Infer<typeof reconcileInstruction>[] = [];
  const blobFetchQueue: Array<{
    stagingId: (typeof allStaged)[0]["_id"];
    sha: string;
    branch: string;
    initialFilePath: string;
    filePath: string;
    version: number;
    stagedContent: string;
    initialContent: string;
  }> = [];

  for (const staged of allStaged) {
    const branchTreeMap = await getTreeMapForBranch(staged.branch);
    const isEdited = hasStagedFileChanges(staged);
    const isNewFile = staged.parentCommitSha === null;

    if (isNewFile) {
      continue;
    }

    if (!isEdited) {
      instructions.push({ action: "delete", stagingId: staged._id, branch: staged.branch });
      continue;
    }

    // Edits on a deleted branch keep their base so they can still be read or
    // discarded.
    if (!branchTreeMap) {
      continue;
    }

    const pathInTree = staged.initialFilePath;
    const newSha = branchTreeMap.get(pathInTree);
    const fileExistsOnGitHub = newSha !== undefined;

    if (!fileExistsOnGitHub) {
      instructions.push({
        action: "update",
        stagingId: staged._id,
        branch: staged.branch,
        parentCommitSha: null,
      });
    } else if (newSha !== staged.parentCommitSha) {
      if (readStagedFileKind(staged.kind) === "binary") {
        if (
          shouldAdvanceBinaryPullParentCommit({
            stagedBlobSha: staged.stagedBlobSha,
            fileDeleted: staged.fileDeleted,
            upstreamSha: newSha,
          })
        ) {
          instructions.push({
            action: "update",
            stagingId: staged._id,
            branch: staged.branch,
            parentCommitSha: newSha,
          });
        }
        continue;
      }
      // A staged delete keeps its base so the commit reports the upstream
      // edit as a conflict instead of deleting it.
      if (staged.fileDeleted) {
        continue;
      }
      blobFetchQueue.push({
        stagingId: staged._id,
        sha: newSha,
        branch: staged.branch,
        initialFilePath: staged.initialFilePath,
        filePath: staged.filePath,
        version: staged.version,
        stagedContent: staged.content,
        initialContent: staged.initialContent,
      });
    }
  }

  // 3. Fetch blobs for files that changed on GitHub (need new initialContent)
  for (const item of blobFetchQueue) {
    try {
      const blob = await octokit.rest.git.getBlob({
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        file_sha: item.sha,
      });
      const buffer = Buffer.from(blob.data.content, "base64");
      const newContent = buffer.toString("utf-8");
      let shouldAdvanceParentCommit = true;
      const rebaseResult = rebaseStagedContent({
        baseContent: item.initialContent,
        stagedContent: item.stagedContent,
        upstreamContent: newContent,
      });

      if (rebaseResult.content !== item.stagedContent) {
        try {
          await ctx.runMutation(host.pushContentUpdate, {
            repositoryId: repository.repositoryId,
            filePath: item.filePath,
            branch: item.branch,
            expectedVersion: item.version,
            newContent: rebaseResult.content,
            userId: userId,
          });
        } catch (error) {
          if (!isStaleBaseVersionError(error)) {
            throw error;
          }

          const latestStaging = await ctx.runQuery(component.staging.getByOriginalPath, {
            repositoryId: repository.repositoryId,
            originalFilePath: item.initialFilePath,
            branch: item.branch,
          });

          if (!latestStaging) {
            shouldAdvanceParentCommit = false;
          } else if (!latestStaging.fileDeleted) {
            const retriedRebase = rebaseStagedContent({
              baseContent: latestStaging.initialContent,
              stagedContent: latestStaging.content,
              upstreamContent: newContent,
            });

            if (retriedRebase.content !== latestStaging.content) {
              await ctx.runMutation(host.pushContentUpdate, {
                repositoryId: repository.repositoryId,
                filePath: latestStaging.filePath,
                branch: item.branch,
                expectedVersion: latestStaging.version,
                newContent: retriedRebase.content,
                userId: userId,
              });
            }
          }
        }
      }

      if (shouldAdvanceParentCommit) {
        instructions.push({
          action: "update",
          stagingId: item.stagingId,
          branch: item.branch,
          parentCommitSha: item.sha,
          initialContent: newContent,
        });
      }
    } catch (error) {
      if (isStaleBaseVersionError(error)) {
        console.warn(`Skipping stale staging rebase for ${item.branch}:${item.filePath}`);
        continue;
      }
      console.error(`Failed to fetch blob ${item.sha}:`, error);
      // Still update the parentCommitSha even if we can't get content
      instructions.push({
        action: "update",
        stagingId: item.stagingId,
        branch: item.branch,
        parentCommitSha: item.sha,
      });
    }
  }

  // 4. Apply reconciliation instructions
  if (instructions.length > 0) {
    await ctx.runMutation(host.reconcileStagingWithTree, {
      repositoryId: repository.repositoryId,
      instructions,
      userId: userId,
    });
  }

  // 5. Refresh touched branch caches after reconciliation
  const touchedBranches = new Set([
    ...allStaged.map((item) => item.branch),
    repository.defaultBranch,
  ]);
  for (const branch of touchedBranches) {
    const treeMap = treeMapByBranch.get(branch);
    if (treeMap && (await treeMap) === null) {
      continue;
    }
    await workspace.refreshBranch(branch);
  }

  return null;
}

export async function batchReadFiles<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string; filePaths: string[] },
): Promise<Array<{ path: string; content: string }>> {
  const { ctx, component, host, repository, octokit } = workspace;
  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;
  let branchTreeData: GitHubTree[] | null = null;
  const defaultBranch = repository.defaultBranch;
  const branchToLoad = requestedBranch ?? defaultBranch;
  if (branchToLoad) {
    let branchTree = await ctx.runQuery(component.branches.get, {
      repositoryId: repository.repositoryId,
      branch: branchToLoad,
    });

    if (!branchTree) {
      await workspace.refreshBranch(branchToLoad);
      branchTree = await ctx.runQuery(component.branches.get, {
        repositoryId: repository.repositoryId,
        branch: branchToLoad,
      });
    }

    if (branchTree) {
      branchTreeData = branchTree.treeData.tree;
    }
  }
  const repositoryTree = selectBatchReadRepositoryTree({
    requestedBranch,
    branchTree: branchTreeData,
  });

  // Build a map of path → tree entry for fast lookups
  const treeMap = new Map<string, { sha: string; size?: number }>();
  for (const item of repositoryTree) {
    if (item.type === "blob" && item.sha) {
      treeMap.set(item.path, { sha: item.sha, size: item.size });
    }
  }

  const uniqueFilePaths = Array.from(new Set(args.filePaths));
  const MAX_FILE_SIZE = 100_000; // 100KB – skip large generated files
  const results: Array<{ path: string; content: string }> = [];
  const misses: Array<{ path: string; sha: string }> = [];

  for (const filePath of uniqueFilePaths) {
    const entry = treeMap.get(filePath);
    if (!entry) continue; // file not in tree, skip

    // Skip files that are too large
    if (entry.size !== undefined && entry.size > MAX_FILE_SIZE) continue;

    // 1. Try blob cache
    const cached = await ctx.runQuery(component.blobs.getBySha, {
      sha: entry.sha,
    });

    if (cached && typeof cached.text === "string") {
      results.push({ path: filePath, content: cached.text });
      continue;
    }

    misses.push({ path: filePath, sha: entry.sha });
  }

  for (const miss of misses) {
    // 2. Fetch from GitHub (blob API by SHA – lightweight)
    try {
      const blob = await octokit.rest.git.getBlob({
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        file_sha: miss.sha,
      });

      const buffer = Buffer.from(blob.data.content, "base64");

      // Skip binary files
      if (!isTextBuffer(new Uint8Array(buffer))) continue;

      const text = buffer.toString("utf-8");

      // Cache in blob store for future reads
      if (buffer.byteLength <= INLINE_TEXT_MAX) {
        const ext = miss.path.split(".").pop()?.toLowerCase() ?? "";
        await ctx.runMutation(host.saveFileBlob, {
          repositoryId: repository.repositoryId,
          sha: miss.sha,
          size: buffer.byteLength,
          text,
          storageId: undefined,
          ext,
          mime: "text/plain; charset=utf-8",
        });
      }

      results.push({ path: miss.path, content: text });
    } catch (error) {
      if (isGitHubRateLimitError(error)) {
        console.warn("batchReadFiles: hit GitHub rate limit, stopping uncached reads for now", {
          failedPath: miss.path,
        });
        break;
      }

      // Skip files that fail to fetch (permissions, deleted, etc.)
      console.warn(`batchReadFiles: failed to fetch ${miss.path}:`, error);
    }
  }

  return results;
}

export async function getCommitPreview<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string; includePatch?: boolean },
): Promise<CommitPreviewResult> {
  const { ctx, component, repository, octokit } = workspace;
  const includePatch = args.includePatch ?? true;
  const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
    component.staging.listAllStagedFiles,
    {
      repositoryId: repository.repositoryId,
      branch: args.branch,
    },
  );

  const stagedBranches: string[] = Array.from(
    new Set(stagedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
  );
  if (stagedBranches.length > 1) {
    throw new Error(
      `Cannot preview staged files across multiple branches: ${stagedBranches.join(", ")}`,
    );
  }
  const branch =
    args.branch ??
    stagedBranches.at(0) ??
    (await getRepositoryDefaultBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
    }));

  const rebasedStagedFiles = await rebaseStagedFilesOnLatestHead({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    branch,
    stagedFiles,
  });

  return buildCommitPreviewFromStagedFiles({
    stagedFiles: rebasedStagedFiles,
    branch,
    includePatch,
  });
}

export async function getBranchComparePreview<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string; includePatch?: boolean },
): Promise<BranchComparePreviewResult> {
  const { ctx, component, repository, octokit } = workspace;
  const includePatch = args.includePatch ?? true;
  const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
    component.staging.listAllStagedFiles,
    {
      repositoryId: repository.repositoryId,
      branch: args.branch,
    },
  );
  const stagedBranches = Array.from(
    new Set(stagedFiles.map((file) => file.branch).filter(notEmpty)),
  );
  if (stagedBranches.length > 1) {
    throw new Error(
      `Cannot compare staged files across multiple branches: ${stagedBranches.join(", ")}`,
    );
  }

  const defaultBranch = await getRepositoryDefaultBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
  });
  const branch = args.branch?.trim() || stagedBranches.at(0) || defaultBranch;
  const currentPullRequest = await getOpenPullRequestForBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    branch,
  });
  const baseBranch = currentPullRequest?.baseBranch ?? defaultBranch;
  const compareResponse = await compareBranches({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    baseBranch,
    branch,
  });
  const mergeBaseCommitSha = compareResponse.merge_base_commit.sha;
  const baseCommitSha = compareResponse.base_commit.sha;
  const mergeBaseSha =
    mergeBaseCommitSha.length > 0
      ? mergeBaseCommitSha
      : baseCommitSha.length > 0
        ? baseCommitSha
        : baseBranch;

  const baseShaByPath = await getTreeMapForRef({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    ref: toGitTreeRef(mergeBaseSha),
  });
  const headShaByPath = await getTreeMapForRef({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    ref: toGitTreeRef(branch),
  });
  const blobBufferBySha = new Map<string, Promise<Uint8Array>>();
  const getBlobBufferBySha = (sha: string): Promise<Uint8Array> => {
    const existing = blobBufferBySha.get(sha);
    if (existing) {
      return existing;
    }

    const loaded = octokit.rest.git
      .getBlob({
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        file_sha: sha,
      })
      .then((response) => {
        const content = response.data.content.replace(/\n/g, "");
        return new Uint8Array(Buffer.from(content, "base64"));
      })
      .catch((error) => {
        blobBufferBySha.delete(sha);
        throw error;
      });

    blobBufferBySha.set(sha, loaded);
    return loaded;
  };
  const getBlobTextBySha = async (sha: string): Promise<string> => {
    const buffer = await getBlobBufferBySha(sha);
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  };
  const remoteFileCandidates = currentPullRequest
    ? await getPullRequestCompareFiles({
        octokit,
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        pullRequestNumber: currentPullRequest.number,
      })
    : (compareResponse.files ?? []);
  const remoteFiles = (
    await Promise.all(
      remoteFileCandidates.map((file) =>
        buildRemoteComparePreviewFile({
          file,
          baseShaByPath,
          headShaByPath,
          getBlobBufferBySha,
          includePatch,
        }),
      ),
    )
  ).filter(notEmpty);
  const files =
    stagedFiles.length > 0
      ? await buildBranchComparePreviewFiles({
          remoteFiles,
          stagedFiles,
          baseShaByPath,
          getBlobTextBySha,
          includePatch,
        })
      : finalizeCommitPreviewFiles(remoteFiles);
  const totals = buildCommitPreviewTotals(files);
  const safety = buildCommitPreviewSafety(files);

  return {
    branch,
    baseBranch,
    source: currentPullRequest ? "pull_request" : "branch_compare",
    pullRequestNumber: currentPullRequest?.number,
    pullRequestUrl: currentPullRequest?.url,
    sourceFileListTruncated:
      currentPullRequest != null
        ? remoteFileCandidates.length >= PULL_REQUEST_COMPARE_FILE_LIST_LIMIT
        : remoteFileCandidates.length >= 300,
    hasDestructiveChanges: totals.deleted > 0,
    files,
    totals,
    safety,
  };
}

export async function restoreComparedDeletedFileToStaging<
  RepositoryId extends string,
  UserId extends string,
>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string; filePath: string; previousPath?: string },
): Promise<null> {
  const { ctx, host, repository, userId, octokit } = workspace;
  const defaultBranch = await getRepositoryDefaultBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
  });
  const branch = args.branch?.trim() || defaultBranch;
  const currentPullRequest = await getOpenPullRequestForBranch({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    branch,
  });
  const baseBranch = currentPullRequest?.baseBranch ?? defaultBranch;
  const compareResponse = await compareBranches({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    baseBranch,
    branch,
  });
  const mergeBaseCommitSha = compareResponse.merge_base_commit.sha;
  const baseCommitSha = compareResponse.base_commit.sha;
  const mergeBaseSha =
    mergeBaseCommitSha.length > 0
      ? mergeBaseCommitSha
      : baseCommitSha.length > 0
        ? baseCommitSha
        : baseBranch;
  const baseShaByPath = await getTreeMapForRef({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    ref: toGitTreeRef(mergeBaseSha),
  });
  const basePath =
    typeof args.previousPath === "string" && baseShaByPath.has(args.previousPath)
      ? args.previousPath
      : args.filePath;
  const baseSha = baseShaByPath.get(basePath);
  if (typeof baseSha !== "string") {
    throw new Error("Deleted compare file is not available from the PR base.");
  }

  const blobResponse = await octokit.rest.git.getBlob({
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    file_sha: baseSha,
  });
  const buffer = new Uint8Array(
    Buffer.from(blobResponse.data.content.replace(/\n/g, ""), "base64"),
  );
  if (!canHydrateInlineDiffText(basePath, buffer)) {
    throw new Error("Only text compare files can be restored into staging right now.");
  }
  const content = Buffer.from(blobResponse.data.content.replace(/\n/g, ""), "base64").toString(
    "utf-8",
  );

  await ctx.runMutation(host.createFileInStagingForOperation, {
    repositoryId: repository.repositoryId,
    filePath: args.filePath,
    content,
    branch,
    userId,
  });

  return null;
}

export async function getRebaseConflictPreview<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string },
): Promise<RebaseConflictPreviewResult> {
  const { ctx, component, repository, octokit } = workspace;
  const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
    component.staging.listAllStagedFiles,
    {
      repositoryId: repository.repositoryId,
      branch: args.branch,
    },
  );

  const stagedBranches: string[] = Array.from(
    new Set(stagedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
  );
  if (stagedBranches.length > 1) {
    throw new Error(
      `Cannot inspect staged conflicts across multiple branches: ${stagedBranches.join(", ")}`,
    );
  }

  const branch =
    args.branch ??
    stagedBranches.at(0) ??
    (await getRepositoryDefaultBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
    }));

  const inspection = await inspectStagedFilesAgainstLatestHead({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    branch,
    stagedFiles,
  });

  return buildRebaseConflictPreviewFromStagedFiles({
    branch,
    conflicts: inspection.conflicts,
  });
}

export async function getRebaseConflictBundle<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string },
): Promise<string> {
  const { ctx, component, repository, octokit } = workspace;
  const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
    component.staging.listAllStagedFiles,
    {
      repositoryId: repository.repositoryId,
      branch: args.branch,
    },
  );

  const stagedBranches: string[] = Array.from(
    new Set(stagedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
  );
  if (stagedBranches.length > 1) {
    throw new Error(
      `Cannot inspect staged conflicts across multiple branches: ${stagedBranches.join(", ")}`,
    );
  }

  const branch =
    args.branch ??
    stagedBranches.at(0) ??
    (await getRepositoryDefaultBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
    }));

  const inspection = await inspectStagedFilesAgainstLatestHead({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    branch,
    stagedFiles,
  });

  if (inspection.conflicts.length === 0) {
    throw new Error("No current rebase conflicts found");
  }

  return buildRebaseConflictBundleMarkdown({
    githubRepositoryFullName: `${repository.githubOwnerLogin}/${repository.githubRepositoryName}`,
    branch,
    conflicts: inspection.conflicts,
  });
}

export async function commitAllStaged<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { branch?: string },
): Promise<null> {
  const { ctx, component, host, repository, userId, octokit } = workspace;
  // @ts-expect-error Convex OptionalRestArgs cannot prove this generic ID scope has required arguments.
  await ctx.runMutation(host.assertWriteAccess, {
    repositoryId: repository.repositoryId,
    userId,
  });
  // Get the staging record
  const changedFiles: StagedFile[] = await ctx.runQuery(component.staging.listAllStagedFiles, {
    repositoryId: repository.repositoryId,
    branch: args.branch,
  });

  if (!changedFiles.length) {
    return null;
  }

  const stagedBranches: string[] = Array.from(
    new Set(changedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
  );
  if (stagedBranches.length > 1) {
    throw new Error(
      `Cannot commit staged files across multiple branches: ${stagedBranches.join(", ")}`,
    );
  }

  const commitBranch: string =
    args.branch ??
    stagedBranches.at(0) ??
    (await getRepositoryDefaultBranch({
      octokit,
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
    }));
  const { committedFiles } = await createCommitWithMultipleFiles({
    octokit,
    owner: repository.githubOwnerLogin,
    repo: repository.githubRepositoryName,
    stagedFiles: changedFiles.map((file) => ({
      ...file,
      snapshot: stripCreationTimeFromStagingRecord(file),
    })),
    branch: commitBranch,
    loadStorageBlob: (storageId) => loadBlob(ctx, component, storageId),
  });

  // 1. Refresh branch/default tree caches and re-read the updated repository.
  //    This is best-effort: upstream commit already succeeded.
  let treeRefreshed = false;
  try {
    treeRefreshed = await workspace.refreshBranch(commitBranch);
  } catch (error) {
    console.error("Post-commit tree refresh failed; continuing with cleanup:", error);
  }

  // 3. Save committed file contents into the blob cache under their new SHAs
  //    so that when the client re-fetches after staging is cleared, it gets
  //    the correct content immediately without hitting GitHub API
  if (treeRefreshed) {
    try {
      for (const file of committedFiles.filter(hasStagedFileChanges)) {
        if (file.fileDeleted) continue;

        const newSha = isBinaryStagedFile(file)
          ? file.stagedBlobSha
          : computeGitBlobShaFromText(file.content);

        if (!newSha) {
          continue;
        }

        if (isBinaryStagedFile(file)) {
          if (!file.storageId) {
            continue;
          }

          await ctx.runMutation(host.saveFileBlob, {
            repositoryId: repository.repositoryId,
            sha: newSha,
            size: file.size ?? 0,
            text: undefined,
            storageId: file.storageId,
            ext: file.filePath.split(".").pop()?.toLowerCase() ?? "",
            mime: file.mime ?? guessMime(file.filePath),
          });
          continue;
        }

        if (typeof file.content === "string") {
          await ctx.runMutation(host.saveFileBlob, {
            repositoryId: repository.repositoryId,
            sha: newSha,
            size: Buffer.byteLength(file.content, "utf-8"),
            text: file.content,
            storageId: undefined,
            ext: file.filePath.split(".").pop()?.toLowerCase() ?? "",
            mime: "text/plain; charset=utf-8",
          });
        }
      }
    } catch (error) {
      console.error("Failed to warm blob cache after commit; continuing cleanup:", error);
    }
  }

  // 4. NOW clear the committed staging rows. Client will refetch with correct
  //    tree + blobs. Rows edited after `changedFiles` was read keep their edits.
  await ctx.runMutation(host.clearCommittedStaging, {
    repositoryId: repository.repositoryId,
    branch: commitBranch,
    committedFiles: committedFiles.map((file) => ({
      snapshot: file.snapshot,
      committedContent: file.content,
      committedBlobSha: file.fileDeleted
        ? null
        : isBinaryStagedFile(file)
          ? (file.stagedBlobSha ?? null)
          : computeGitBlobShaFromText(file.content),
    })),
  });

  return null;
}

export async function renameFile<RepositoryId extends string, UserId extends string>(
  workspace: GitWorkspace<RepositoryId, UserId>,
  args: { originalPath: string; newPath: string; branch: string },
) {
  await openFile(workspace, { originalFilePath: args.originalPath, branch: args.branch });
  const file = await workspace.ctx.runMutation(workspace.host.rename, {
    repositoryId: workspace.repository.repositoryId,
    initialFilePath: args.originalPath,
    branch: args.branch,
    newPath: args.newPath,
    userId: workspace.userId,
  });
  return { content: file.content };
}
