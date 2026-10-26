import type { Octokit } from "@octokit/rest";
import type { FunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import type { FileBlob, vGitHubTreeData } from "./model.js";
import type { GitWorkspace } from "./operationsContext.js";
import { guessMime, withRetry } from "./fileContent.js";
import { type RepositoryMediaKind, isSvgRepositoryMediaPath } from "./repositoryMedia.js";
import { readStagedFileKind } from "./stagingChanges.js";

const { literal, object, string, union } = v;

/** The host authorizes the repository before a read. Provider access stays lazy. */
export type GitWorkspaceReads<RepositoryId extends string> = {
  ctx: GitWorkspace<RepositoryId, string>["ctx"];
  component: Pick<GitWorkspace<RepositoryId, string>["component"], "staging">;
  repository: Pick<
    GitWorkspace<RepositoryId, string>["repository"],
    "repositoryId" | "githubOwnerLogin" | "githubRepositoryName"
  > & { treeData?: Infer<typeof vGitHubTreeData> | null };
  host: Pick<GitWorkspace<RepositoryId, string>["host"], "saveFileBlob"> & {
    getBlobBySha: FunctionReference<"query", "internal", { sha: string }, FileBlob | null>;
  };
  getOctokit: () => Promise<Octokit>;
};

type CachedRepositoryBlob = {
  size?: number | null;
  storageId?: string | null;
  text?: string | null;
  mime?: string | undefined;
};

export const repositoryFileContentResult = union(
  object({ exists: literal(false) }),
  object({ exists: literal(true), content: string() }),
);

export type RepositoryFileContent = Infer<typeof repositoryFileContentResult>;
const MAX_REPOSITORY_MEDIA_BYTES = 1_000_000;
const REPOSITORY_MEDIA_TOO_LARGE_MESSAGE = "Preview unavailable for files larger than 1 MB.";

export const repositoryMediaAssetResult = union(
  object({
    found: literal(false),
    reason: literal("missing"),
  }),
  object({
    found: literal(false),
    reason: literal("unavailable"),
    message: string(),
  }),
  object({
    found: literal(true),
    kind: literal("image"),
    mimeType: string(),
    url: string(),
    fileName: string(),
  }),
  object({
    found: literal(true),
    kind: literal("vox"),
    mimeType: string(),
    url: string(),
    fileName: string(),
  }),
);

export type RepositoryMediaAsset = Infer<typeof repositoryMediaAssetResult>;

type RepositoryMediaUnavailableAsset = Extract<
  RepositoryMediaAsset,
  { found: false; reason: "unavailable" }
>;
type StagedRepositoryMediaAssetCandidate = {
  fileDeleted: boolean;
  kind?: "text" | "binary";
  storageId?: string | null;
  stagedBlobSha?: string | null;
  mime?: string;
  size?: number;
  content: string;
};
/**
 * Mirror GitHub's preview size ceiling for cached blobs so storage-backed media
 * cannot bypass the same protection the live Contents API path already applies.
 */
export function isRepositoryMediaPreviewTooLarge(size: number | null | undefined): boolean {
  return typeof size === "number" && size > MAX_REPOSITORY_MEDIA_BYTES;
}

function getRepositoryMediaErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message;
}

function isRepositoryMediaTooLargeError(error: unknown): boolean {
  if (getRepositoryMediaErrorStatus(error) !== 403) {
    return false;
  }

  const message = getRepositoryMediaErrorMessage(error).toLowerCase();
  return (
    message.includes("too large") ||
    message.includes("too_large") ||
    message.includes("blobs up to 1 mb")
  );
}

function getRepositoryMediaTooLargeAsset(): RepositoryMediaUnavailableAsset {
  return {
    found: false,
    reason: "unavailable",
    message: REPOSITORY_MEDIA_TOO_LARGE_MESSAGE,
  };
}

function toGitTreeRef(branch: string): string {
  if (branch.startsWith("refs/heads/")) {
    return branch.slice("refs/".length);
  }
  if (branch.startsWith("heads/")) {
    return branch;
  }
  return `heads/${branch}`;
}

function buildDataUrl(mimeType: string, content: Buffer): string {
  return `data:${mimeType};base64,${content.toString("base64")}`;
}

function readStoredMimeType(filePath: string, blobMime: string | undefined): string {
  if (typeof blobMime === "string" && blobMime.includes("/")) {
    return blobMime;
  }
  return guessMime(filePath);
}

async function resolveCachedRepositoryMediaAsset(
  ctx: {
    storage: {
      getUrl(storageId: string): Promise<string | null>;
    };
  },
  cachedBlob: CachedRepositoryBlob | null,
  filePath: string,
  mediaKind: RepositoryMediaKind,
  fileName: string,
): Promise<RepositoryMediaAsset | null> {
  if (isRepositoryMediaPreviewTooLarge(cachedBlob?.size)) {
    return getRepositoryMediaTooLargeAsset();
  }

  if (typeof cachedBlob?.storageId === "string") {
    const url = await ctx.storage.getUrl(cachedBlob.storageId);
    if (typeof url === "string" && url.length > 0) {
      return {
        found: true,
        kind: mediaKind,
        mimeType: readStoredMimeType(filePath, cachedBlob.mime),
        url,
        fileName,
      };
    }
  }

  if (typeof cachedBlob?.text === "string" && isSvgRepositoryMediaPath(filePath)) {
    return {
      found: true,
      kind: mediaKind,
      mimeType: "image/svg+xml",
      url: buildDataUrl("image/svg+xml", Buffer.from(cachedBlob.text, "utf-8")),
      fileName,
    };
  }

  return null;
}

async function getRepositoryBlobShaForBranchPath(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}): Promise<string | null> {
  const tree = await args.octokit.rest.git.getTree({
    owner: args.owner,
    repo: args.repo,
    tree_sha: toGitTreeRef(args.branch),
    recursive: "1",
  });
  const targetFile = tree.data.tree.find(
    (item) =>
      item.type === "blob" &&
      item.path === args.filePath &&
      typeof item.sha === "string" &&
      item.sha.length > 0,
  );

  return targetFile?.sha ?? null;
}

export async function resolveStagedRepositoryMediaAsset(args: {
  storage: {
    getUrl(storageId: string): Promise<string | null>;
  };
  loadCachedBlobBySha: (sha: string) => Promise<CachedRepositoryBlob | null>;
  stagedFile: StagedRepositoryMediaAssetCandidate;
  filePath: string;
  mediaKind: RepositoryMediaKind;
  fileName: string;
}): Promise<RepositoryMediaAsset> {
  if (args.stagedFile.fileDeleted) {
    return { found: false, reason: "missing" };
  }

  const stagedKind = readStagedFileKind(args.stagedFile.kind);
  const directAsset = await resolveCachedRepositoryMediaAsset(
    { storage: args.storage },
    {
      storageId: args.stagedFile.storageId,
      text: args.stagedFile.content,
      mime: args.stagedFile.mime,
      size: args.stagedFile.size,
    },
    args.filePath,
    args.mediaKind,
    args.fileName,
  );
  if (directAsset) {
    return directAsset;
  }

  if (
    stagedKind === "binary" &&
    typeof args.stagedFile.stagedBlobSha === "string" &&
    args.stagedFile.stagedBlobSha.length > 0
  ) {
    const cachedBlob = await args.loadCachedBlobBySha(args.stagedFile.stagedBlobSha);
    const resolvedCachedAsset = await resolveCachedRepositoryMediaAsset(
      { storage: args.storage },
      cachedBlob,
      args.filePath,
      args.mediaKind,
      args.fileName,
    );
    if (resolvedCachedAsset) {
      return resolvedCachedAsset;
    }
  }

  if (stagedKind === "binary") {
    return {
      found: false,
      reason: "unavailable",
      message: "Staged upload is missing storage reference.",
    };
  }

  if (isSvgRepositoryMediaPath(args.filePath)) {
    return {
      found: true,
      kind: args.mediaKind,
      mimeType: "image/svg+xml",
      url: buildDataUrl("image/svg+xml", Buffer.from(args.stagedFile.content, "utf-8")),
      fileName: args.fileName,
    };
  }

  return {
    found: false,
    reason: "unavailable",
    message: "Preview unavailable for this staged file.",
  };
}

function getRepositoryMediaFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function getRepositoryMediaExtension(filePath: string): string {
  const fileName = getRepositoryMediaFileName(filePath);
  const extensionStart = fileName.lastIndexOf(".");
  if (extensionStart === -1 || extensionStart === fileName.length - 1) {
    return "";
  }
  return fileName.slice(extensionStart + 1).toLowerCase();
}

function getRepositoryMediaErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

export async function readRepositoryFileContent<RepositoryId extends string>(
  workspace: GitWorkspaceReads<RepositoryId>,
  args: { filePath: string; branch: string | undefined },
): Promise<RepositoryFileContent> {
  const { ctx, repository } = workspace;
  const requestedBranch = args.branch;
  if (!requestedBranch) {
    const targetFile = repository.treeData?.tree.find(
      (item: { path: string; type: string; sha?: string }) =>
        item.path === args.filePath && item.type === "blob",
    );

    if (!targetFile?.sha) {
      return { exists: false };
    }

    const blobFile = await ctx.runQuery(workspace.host.getBlobBySha, {
      sha: targetFile.sha,
    });

    if (blobFile && typeof blobFile.text === "string") {
      return {
        exists: true,
        content: blobFile.text,
      };
    }
  }

  const octokit = await workspace.getOctokit();

  try {
    const file = await octokit.rest.repos.getContent({
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      path: args.filePath,
      ref: requestedBranch,
    });

    if (Array.isArray(file.data) || file.data.type !== "file") {
      return { exists: false };
    }

    const contentBuffer = Buffer.from(file.data.content, "base64");
    return {
      exists: true,
      content: contentBuffer.toString("utf-8"),
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status === 404
    ) {
      return { exists: false };
    }

    throw error;
  }
}

export async function readRepositoryMediaAsset<RepositoryId extends string>(
  workspace: GitWorkspaceReads<RepositoryId>,
  args: {
    filePath: string;
    branch: string | undefined;
    skipStaging: boolean | undefined;
    mediaKind: RepositoryMediaKind;
  },
): Promise<RepositoryMediaAsset> {
  const { ctx, repository } = workspace;
  const { mediaKind } = args;
  const requestedBranch = args.branch;
  const fileName = getRepositoryMediaFileName(args.filePath);
  const shouldSkipStaging = args.skipStaging === true;

  if (requestedBranch && !shouldSkipStaging) {
    const stagedFile = await ctx.runQuery(workspace.component.staging.getByNewPath, {
      repositoryId: repository.repositoryId,
      branch: requestedBranch,
      newPath: args.filePath,
    });
    if (stagedFile) {
      const stagedAsset = await resolveStagedRepositoryMediaAsset({
        storage: ctx.storage,
        loadCachedBlobBySha: (sha) => ctx.runQuery(workspace.host.getBlobBySha, { sha }),
        stagedFile,
        filePath: args.filePath,
        mediaKind,
        fileName,
      });
      if (
        !stagedAsset.found &&
        stagedAsset.reason === "unavailable" &&
        readStagedFileKind(stagedFile.kind) === "binary"
      ) {
        console.warn("Staged binary media preview is missing storage data", {
          repositoryId: repository.repositoryId,
          branch: requestedBranch,
          filePath: args.filePath,
          stagingId: stagedFile._id,
        });
      }
      return stagedAsset;
    }
  }

  let targetFileSha: string | null = null;
  if (!requestedBranch) {
    const targetFile = repository.treeData?.tree.find(
      (item: { path: string; type: string; sha?: string }) =>
        item.path === args.filePath && item.type === "blob",
    );

    if (!targetFile?.sha) {
      return { found: false, reason: "missing" };
    }

    targetFileSha = targetFile.sha;
    const cachedBlob = await ctx.runQuery(workspace.host.getBlobBySha, {
      sha: targetFileSha,
    });
    const resolvedCachedAsset = await resolveCachedRepositoryMediaAsset(
      ctx,
      cachedBlob,
      args.filePath,
      mediaKind,
      fileName,
    );
    if (resolvedCachedAsset) {
      return resolvedCachedAsset;
    }
  }

  const octokit = await workspace.getOctokit();

  try {
    if (requestedBranch) {
      targetFileSha = await getRepositoryBlobShaForBranchPath({
        octokit,
        owner: repository.githubOwnerLogin,
        repo: repository.githubRepositoryName,
        branch: requestedBranch,
        filePath: args.filePath,
      });
      if (targetFileSha === null) {
        return { found: false, reason: "missing" };
      }
      const cachedBlob = await ctx.runQuery(workspace.host.getBlobBySha, {
        sha: targetFileSha,
      });
      const resolvedCachedAsset = await resolveCachedRepositoryMediaAsset(
        ctx,
        cachedBlob,
        args.filePath,
        mediaKind,
        fileName,
      );
      if (resolvedCachedAsset) {
        return resolvedCachedAsset;
      }
    }

    if (targetFileSha === null) {
      return { found: false, reason: "missing" };
    }

    const blob = await octokit.rest.git.getBlob({
      owner: repository.githubOwnerLogin,
      repo: repository.githubRepositoryName,
      file_sha: targetFileSha,
    });
    if (typeof blob.data.content !== "string" || blob.data.content.length === 0) {
      return {
        found: false,
        reason: "unavailable",
        message: "Preview unavailable for this file.",
      };
    }

    const mimeType = guessMime(args.filePath);
    const content = blob.data.content.replace(/\n/g, "");
    const buffer = Buffer.from(content, "base64");
    const storageId = await withRetry(() =>
      ctx.storage.store(new Blob([buffer], { type: mimeType })),
    );

    const savedBlob = await ctx.runMutation(workspace.host.saveFileBlob, {
      repositoryId: repository.repositoryId,
      sha: targetFileSha,
      size: buffer.byteLength,
      mime: mimeType,
      text: undefined,
      storageId,
      ext: getRepositoryMediaExtension(args.filePath),
      debugFilePath: args.filePath,
    });

    if (!savedBlob) {
      return { found: false, reason: "unavailable", message: "Repository is unavailable." };
    }
    const savedAsset = await resolveCachedRepositoryMediaAsset(
      ctx,
      savedBlob,
      args.filePath,
      mediaKind,
      fileName,
    );
    if (!savedAsset) {
      throw new Error("Failed to create media preview URL");
    }
    return savedAsset;
  } catch (error: unknown) {
    if (getRepositoryMediaErrorStatus(error) === 404) {
      return { found: false, reason: "missing" };
    }

    if (isRepositoryMediaTooLargeError(error)) {
      return getRepositoryMediaTooLargeAsset();
    }
    throw error;
  }
}
