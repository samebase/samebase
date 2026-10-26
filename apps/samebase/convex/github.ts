"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { Infer, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { action } from "./functions";
import { resolveGitHubAppAccess, type GitHubAppInstallationAccess } from "./githubAppAccess";
import { createGitHubInstallationOctokit, readGitHubAppInstallation } from "./githubApp";
import { guessMime, withRetry } from "@samebase/git-workspace/fileContent";
import { isRecord } from "./jsonUtils";
import {
  getRepositoryMediaKind,
  type RepositoryMediaKind,
  isSvgRepositoryMediaPath,
} from "@samebase/git-workspace/repositoryMedia";
import { readStagedFileKind } from "@samebase/git-workspace/stagingChanges";
import {
  refreshRepositoryBranch,
  vExactRepositoryBranchRefreshResult,
  type ExactRepositoryBranchRefreshResult,
} from "@samebase/git-workspace/repositoryRefresh";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const githubRepositoryListItem = object({
  id: number(),
  owner: object({
    id: number(),
    login: string(),
  }),
  name: string(),
  full_name: string(),
  html_url: string(),
  description: union(string(), v.null()),
  private: boolean(),
  fork: boolean(),
  created_at: string(),
  updated_at: string(),
  language: union(string(), v.null()),
  stargazers_count: number(),
  forks_count: number(),
});

type GitHubRepositoryListItem = Infer<typeof githubRepositoryListItem>;
type GitHubRepositoryList = GitHubRepositoryListItem[];
const githubRepositoryPreviewResult = object({
  repositories: array(githubRepositoryListItem),
  hasMore: boolean(),
});

type GitHubRepositoryPreviewResult = Infer<typeof githubRepositoryPreviewResult>;

const githubOwnerIdentityObservation = union(
  object({
    status: literal("current"),
  }),
  object({
    status: literal("renamed"),
    githubOwnerLogin: string(),
  }),
  object({
    status: literal("unavailable"),
  }),
);

const githubRepositoryIdentityObservation = union(
  object({
    status: literal("renamed"),
    repositoryId: id("repositories"),
    repositoryName: string(),
    update: union(literal("available"), literal("blocked")),
  }),
  object({
    status: literal("unavailable"),
    repositoryId: id("repositories"),
  }),
);

const githubIdentityObservation = object({
  owner: githubOwnerIdentityObservation,
  repositories: array(githubRepositoryIdentityObservation),
});

type GitHubIdentityObservation = Infer<typeof githubIdentityObservation>;

type CachedRepositoryBlob = {
  size?: number | null;
  storageId?: string | null;
  text?: string | null;
  mime?: string | undefined;
};
const publicRefreshRepositoryIntent = union(literal("passive"), literal("manual"));
const GITHUB_REPOSITORY_PREVIEW_PAGE_SIZE = 10;
const GITHUB_REPOSITORY_DISCOVERY_PAGE_SIZE = 100;
const MAX_GITHUB_REPOSITORY_PAGES = 100;

/** An omitted branch means default; a provided branch always remains exact. */
function normalizeOptionalRepositoryBranch(branch: string | undefined): string | undefined {
  if (branch === undefined) {
    return undefined;
  }

  const trimmedBranch = branch.trim();
  if (trimmedBranch.length === 0) {
    throw new Error("Branch is required when provided.");
  }
  return trimmedBranch;
}

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const status = error["status"];
  return typeof status === "number" ? status : null;
}

export function normalizeGitHubRepositoryListItem(value: unknown): GitHubRepositoryListItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    id,
    owner,
    name,
    full_name,
    html_url,
    description,
    private: isPrivate,
    fork,
    created_at,
    updated_at,
    language,
    stargazers_count,
    forks_count,
  } = value;

  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !isRecord(owner) ||
    typeof owner["id"] !== "number" ||
    !Number.isSafeInteger(owner["id"]) ||
    owner["id"] <= 0 ||
    typeof owner["login"] !== "string" ||
    owner["login"].trim().length === 0 ||
    typeof name !== "string" ||
    typeof full_name !== "string" ||
    typeof html_url !== "string" ||
    (typeof description !== "string" && description !== null) ||
    typeof isPrivate !== "boolean" ||
    typeof fork !== "boolean" ||
    typeof created_at !== "string" ||
    typeof updated_at !== "string" ||
    (typeof language !== "string" && language !== null) ||
    typeof stargazers_count !== "number" ||
    typeof forks_count !== "number"
  ) {
    return null;
  }

  return {
    id,
    owner: {
      id: owner["id"],
      login: owner["login"].trim(),
    },
    name,
    full_name,
    html_url,
    description,
    private: isPrivate,
    fork,
    created_at,
    updated_at,
    language,
    stargazers_count,
    forks_count,
  };
}

function normalizeGitHubRepositoryList(value: unknown): GitHubRepositoryList {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected GitHub API response format");
  }

  const repositoriesById = new Map<number, GitHubRepositoryListItem>();
  for (const repository of value) {
    const normalized = normalizeGitHubRepositoryListItem(repository);
    if (normalized === null) {
      throw new Error("Unexpected GitHub repository payload");
    }
    repositoriesById.set(normalized.id, normalized);
  }

  return Array.from(repositoriesById.values());
}

function compareGitHubRepositoriesByUpdatedAt(
  left: GitHubRepositoryListItem,
  right: GitHubRepositoryListItem,
): number {
  if (left.updated_at !== right.updated_at) {
    return left.updated_at < right.updated_at ? 1 : -1;
  }
  if (left.full_name !== right.full_name) {
    return left.full_name < right.full_name ? -1 : 1;
  }
  return left.id - right.id;
}

async function fetchGitHubInstallationRepositoryPage(args: {
  octokit: Octokit;
  page: number;
  perPage: number;
}): Promise<{
  repositories: GitHubRepositoryList;
  totalCount: number;
}> {
  const response = await args.octokit.request("GET /installation/repositories", {
    page: args.page,
    per_page: args.perPage,
  });
  const payload: unknown = response.data;
  if (
    !isRecord(payload) ||
    typeof payload["total_count"] !== "number" ||
    !Number.isSafeInteger(payload["total_count"]) ||
    payload["total_count"] < 0 ||
    !Array.isArray(payload["repositories"])
  ) {
    throw new Error("Unexpected GitHub installation repository payload");
  }

  return {
    repositories: normalizeGitHubRepositoryList(payload["repositories"]),
    totalCount: payload["total_count"],
  };
}

/**
 * The add-repository screen renders the first page immediately, then follows up
 * with the full discovery scan in the background.
 */
export async function listGitHubRepositoryPreview(args: {
  octokit: Octokit;
}): Promise<GitHubRepositoryPreviewResult> {
  const page = await fetchGitHubInstallationRepositoryPage({
    octokit: args.octokit,
    page: 1,
    perPage: GITHUB_REPOSITORY_PREVIEW_PAGE_SIZE,
  });

  return {
    repositories: page.repositories.sort(compareGitHubRepositoriesByUpdatedAt),
    hasMore: page.totalCount > page.repositories.length,
  };
}

export async function listGitHubRepositories(args: {
  octokit: Octokit;
}): Promise<GitHubRepositoryList> {
  const repositoriesById = new Map<number, GitHubRepositoryListItem>();
  for (let pageNumber = 1; pageNumber <= MAX_GITHUB_REPOSITORY_PAGES; pageNumber += 1) {
    const page = await fetchGitHubInstallationRepositoryPage({
      octokit: args.octokit,
      page: pageNumber,
      perPage: GITHUB_REPOSITORY_DISCOVERY_PAGE_SIZE,
    });

    for (const repository of page.repositories) {
      repositoriesById.set(repository.id, repository);
    }

    if (
      page.repositories.length < GITHUB_REPOSITORY_DISCOVERY_PAGE_SIZE ||
      repositoriesById.size >= page.totalCount
    ) {
      return Array.from(repositoriesById.values()).sort(compareGitHubRepositoriesByUpdatedAt);
    }
  }

  throw new Error(`GitHub repository pagination exceeded ${MAX_GITHUB_REPOSITORY_PAGES} pages`);
}

type GitHubInstallationIdentityState =
  | {
      status: "available";
      githubOwnerLogin: string;
      installationId: string;
    }
  | { status: "unavailable" };

async function readGitHubInstallationIdentityState(
  organization: GitHubAppInstallationAccess,
): Promise<GitHubInstallationIdentityState> {
  let installation;
  try {
    installation = await readGitHubAppInstallation(organization.githubInstallationId, {
      allowSuspended: true,
    });
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      return { status: "unavailable" };
    }
    throw error;
  }

  if (installation.suspended) {
    return { status: "unavailable" };
  }
  if (
    installation.githubOwnerId !== organization.githubOwnerId ||
    installation.githubOwnerType !== organization.githubOwnerType
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "available",
    githubOwnerLogin: installation.githubOwnerLogin,
    installationId: installation.installationId,
  };
}

async function readGitHubInstallationRepositories(
  installationId: string,
): Promise<GitHubRepositoryList | null> {
  try {
    return await listGitHubRepositories({
      octokit: createGitHubInstallationOctokit(installationId),
    });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 401 || status === 403 || status === 404) {
      return null;
    }
    throw error;
  }
}

export const observeOrganizationGitHubIdentity = action({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
  },
  returns: githubIdentityObservation,
  handler: async (ctx, args): Promise<GitHubIdentityObservation> => {
    const access = await ctx.runQuery(internal.githubAppAccess.loadInstallationAccess, {
      userId: ctx.viewer.userId,
      target: { kind: "organization", organizationId: args.organizationId },
    });
    const installation = await readGitHubInstallationIdentityState(access);
    if (installation.status === "unavailable") {
      return {
        owner: { status: "unavailable" },
        repositories: [],
      };
    }

    const owner: GitHubIdentityObservation["owner"] =
      installation.githubOwnerLogin === access.githubOwnerLogin
        ? {
            status: "current",
          }
        : {
            status: "renamed",
            githubOwnerLogin: installation.githubOwnerLogin,
          };
    const providerRepositories = await readGitHubInstallationRepositories(
      installation.installationId,
    );
    const target = await ctx.runQuery(
      internal.repository.records.getGitHubIdentityObservationRepositories,
      {
        userId: ctx.viewer.userId,
        organizationId: access.organizationId,
      },
    );
    if (providerRepositories === null) {
      return {
        owner,
        repositories: target.connectedRepositories.map((repository) => ({
          status: "unavailable",
          repositoryId: repository.repositoryId,
        })),
      };
    }

    const repositoriesById = new Map(
      providerRepositories.map((repository) => [String(repository.id), repository] as const),
    );
    const repositoryObservations = target.connectedRepositories.flatMap(
      (connectedRepository): GitHubIdentityObservation["repositories"] => {
        const providerRepository = repositoriesById.get(
          connectedRepository.githubRepositoryDatabaseId,
        );
        if (
          providerRepository === undefined ||
          String(providerRepository.owner.id) !== access.githubOwnerId
        ) {
          return [
            {
              status: "unavailable",
              repositoryId: connectedRepository.repositoryId,
            },
          ];
        }
        if (providerRepository.name === connectedRepository.githubRepositoryName) {
          return [];
        }

        const normalizedRepositoryName = providerRepository.name.trim().toLowerCase();
        const nameCollision = target.occupiedRepositories.some(
          (occupiedRepository) =>
            occupiedRepository.repositoryId !== connectedRepository.repositoryId &&
            occupiedRepository.githubRepositoryName.trim().toLowerCase() ===
              normalizedRepositoryName,
        );
        return [
          {
            status: "renamed",
            repositoryId: connectedRepository.repositoryId,
            repositoryName: providerRepository.name,
            update: nameCollision ? "blocked" : "available",
          },
        ];
      },
    );

    return {
      owner,
      repositories: repositoryObservations,
    };
  },
});

const updateGitHubOwnerLoginResult = object({
  githubOwnerLogin: string(),
});

type UpdateGitHubOwnerLoginResult = Infer<typeof updateGitHubOwnerLoginResult>;

export const updateOrganizationGitHubOwnerLogin = action({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    expectedGithubOwnerLogin: string(),
  },
  returns: updateGitHubOwnerLoginResult,
  handler: async (ctx, args): Promise<UpdateGitHubOwnerLoginResult> => {
    const organization = await ctx.runQuery(
      internal.organizations.getGitHubOwnerLoginUpdateTargetForUser,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const provider = await readGitHubInstallationIdentityState(organization);
    if (provider.status === "unavailable") {
      throw new Error("The GitHub App installation is unavailable for this organization.");
    }
    if (provider.githubOwnerLogin !== args.expectedGithubOwnerLogin) {
      throw new Error("The GitHub owner login changed before the update was approved.");
    }

    const githubOwnerLogin = await ctx.runMutation(
      internal.organizations.updateVerifiedGitHubOwnerLogin,
      {
        userId: ctx.viewer.userId,
        organizationId: organization.organizationId,
        githubOwnerId: organization.githubOwnerId,
        expectedStoredGithubOwnerLogin: organization.githubOwnerLogin,
        githubOwnerLogin: provider.githubOwnerLogin,
      },
    );
    return { githubOwnerLogin };
  },
});

const updateGitHubRepositoryNameResult = object({
  githubOwnerLogin: string(),
  repositoryName: string(),
});

type UpdateGitHubRepositoryNameResult = Infer<typeof updateGitHubRepositoryNameResult>;

export const updateRepositoryGitHubRepositoryName = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    expectedRepositoryName: string(),
  },
  returns: updateGitHubRepositoryNameResult,
  handler: async (ctx, args): Promise<UpdateGitHubRepositoryNameResult> => {
    const target = await ctx.runQuery(
      internal.repository.records.getGitHubRepositoryNameUpdateTargetForUser,
      {
        userId: ctx.viewer.userId,
        repositoryId: args.repositoryId,
      },
    );
    const installation = await readGitHubInstallationIdentityState(target.organization);
    if (installation.status === "unavailable") {
      throw new Error("The GitHub App installation is unavailable for this organization.");
    }
    const repositories = await readGitHubInstallationRepositories(installation.installationId);
    if (repositories === null) {
      throw new Error("The GitHub App installation is unavailable for this organization.");
    }
    const repository = repositories.find(
      (candidate) => String(candidate.id) === target.repository.githubRepositoryDatabaseId,
    );
    if (repository === undefined) {
      throw new Error("The GitHub repository is not available to this App installation.");
    }
    if (String(repository.owner.id) !== target.organization.githubOwnerId) {
      throw new Error("The GitHub repository moved to another owner.");
    }
    if (repository.name !== args.expectedRepositoryName) {
      throw new Error("The GitHub repository name changed before the update was approved.");
    }

    const updated = await ctx.runMutation(
      internal.repository.records.updateGitHubRepositoryNameForUser,
      {
        userId: ctx.viewer.userId,
        repositoryId: target.repository.repositoryId,
        githubRepositoryDatabaseId: target.repository.githubRepositoryDatabaseId,
        githubOwnerId: target.organization.githubOwnerId,
        expectedStoredName: target.repository.githubRepositoryName,
        repositoryName: repository.name,
      },
    );
    return updated;
  },
});

export const listRepositoriesPreview = action({
  access: "access_repo_connect",
  args: {
    organizationId: id("organizations"),
  },
  returns: githubRepositoryPreviewResult,
  handler: async (ctx, args): Promise<GitHubRepositoryPreviewResult> => {
    const access = await resolveGitHubAppAccess(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "organization", organizationId: args.organizationId },
    });
    return await listGitHubRepositoryPreview({ octokit: access.octokit });
  },
});

export const listRepositories = action({
  access: "access_repo_connect",
  args: {
    organizationId: id("organizations"),
  },
  returns: array(githubRepositoryListItem),
  handler: async (ctx, args): Promise<GitHubRepositoryList> => {
    const access = await resolveGitHubAppAccess(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "organization", organizationId: args.organizationId },
    });
    return await listGitHubRepositories({ octokit: access.octokit });
  },
});

const repositoryFileContentResult = union(
  object({ exists: literal(false) }),
  object({ exists: literal(true), content: string() }),
);

type RepositoryFileContent = Infer<typeof repositoryFileContentResult>;
const MAX_REPOSITORY_MEDIA_BYTES = 1_000_000;
const REPOSITORY_MEDIA_TOO_LARGE_MESSAGE = "Preview unavailable for files larger than 1 MB.";

const repositoryMediaAssetResult = union(
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

type RepositoryMediaAsset = Infer<typeof repositoryMediaAssetResult>;

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

export const getRepositoryFileContent = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
  },
  returns: repositoryFileContentResult,
  handler: async (ctx, args): Promise<RepositoryFileContent> => {
    const requestedBranch = normalizeOptionalRepositoryBranch(args.branch);
    const userId = ctx.viewer.userId;

    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    if (!requestedBranch) {
      const targetFile = repository.treeData?.tree.find(
        (item: { path: string; type: string; sha?: string }) =>
          item.path === args.filePath && item.type === "blob",
      );

      if (!targetFile?.sha) {
        return { exists: false };
      }

      const blobFile = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: targetFile.sha,
      });

      if (blobFile && typeof blobFile.text === "string") {
        return {
          exists: true,
          content: blobFile.text,
        };
      }
    }

    const { octokit } = await resolveGitHubAppAccess(ctx, {
      userId,
      target: { kind: "repository", repositoryId: repository.repositoryId },
    });

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
  },
});

export const getRepositoryMediaAsset = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
    skipStaging: optional(boolean()),
  },
  returns: repositoryMediaAssetResult,
  handler: async (ctx, args): Promise<RepositoryMediaAsset> => {
    const mediaKind = getRepositoryMediaKind(args.filePath);
    if (mediaKind === null) {
      return { found: false, reason: "missing" };
    }

    const requestedBranch = normalizeOptionalRepositoryBranch(args.branch);
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
      branch: requestedBranch,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    const fileName = getRepositoryMediaFileName(args.filePath);
    const shouldSkipStaging = args.skipStaging === true;

    if (requestedBranch && !shouldSkipStaging) {
      const stagedFile = await ctx.runQuery(internal.fileStaging.getByNewPathInternal, {
        repositoryId: repository.repositoryId,
        branch: requestedBranch,
        newPath: args.filePath,
      });
      if (stagedFile) {
        const stagedAsset = await resolveStagedRepositoryMediaAsset({
          storage: ctx.storage,
          loadCachedBlobBySha: (sha) => ctx.runQuery(internal.gitOperations.getBlobBySha, { sha }),
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
      const cachedBlob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
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

    const { octokit } = await resolveGitHubAppAccess(ctx, {
      userId,
      target: { kind: "repository", repositoryId: repository.repositoryId },
    });

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
        const cachedBlob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
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

      const savedBlob = await ctx.runMutation(internal.gitOperations.saveFileBlob, {
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
  },
});

/** Reads and caches one exact branch for the file route or an app-owned repository write. */
async function refreshExactRepositoryBranchForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    repo: string;
    branch: string;
    intent: "passive" | "manual";
  },
): Promise<ExactRepositoryBranchRefreshResult> {
  return await refreshRepositoryBranch(ctx, components.gitWorkspace, {
    repositoryId: args.repositoryId,
    repo: args.repo,
    branch: args.branch,
    intent: args.intent,
    resolveGitHubAccess: async () => {
      const access = await resolveGitHubAppAccess(ctx, {
        userId: args.userId,
        target: { kind: "repository", repositoryId: args.repositoryId },
      });
      return { owner: access.githubOwnerLogin, octokit: access.octokit };
    },
    mutations: {
      claimRefresh: internal.repository.branches.claimTreeRefresh,
      publishBranchTree: internal.repository.branches.upsertClaimedRepositoryBranchTree,
      releaseRefresh: internal.repository.branches.releaseTreeRefresh,
    },
  });
}

/**
 * Public branch refresh used by the file route.
 *
 * The browser identifies the repository, branch, and user-visible intent. The
 * action checks `userId + repositoryId`, derives owner/repo from the repository, then
 * applies the current file-view branch refresh policy. URL owner/repo strings
 * and GitHub metadata-depth choices are not trusted from React.
 */
export const refreshRepositoryTree = action({
  access: "access_app_refresh",
  args: {
    repositoryId: id("repositories"),
    branch: string(),
    intent: publicRefreshRepositoryIntent,
  },
  returns: vExactRepositoryBranchRefreshResult,
  handler: async (ctx, args): Promise<ExactRepositoryBranchRefreshResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
      userId,
      repositoryId: args.repositoryId,
    });
    if (
      !repository ||
      repository.state !== "connected" ||
      repository.deletion.state !== "not_deleting"
    ) {
      throw new Error("Repository not found.");
    }
    return await refreshExactRepositoryBranchForUser(ctx, {
      userId,
      repositoryId: args.repositoryId,
      repo: repository.githubRepositoryName,
      branch: args.branch,
      intent: args.intent,
    });
  },
});

/** Refreshes one exact branch after an app-owned repository write. */
export const updateRepositoryTree = internalAction({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    branch: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    if (
      !repository ||
      repository.state !== "connected" ||
      repository.deletion.state !== "not_deleting"
    ) {
      throw new Error("Repository not found");
    }
    const refresh = await refreshExactRepositoryBranchForUser(ctx, {
      userId: args.userId,
      repositoryId: repository._id,
      repo: repository.githubRepositoryName,
      branch: args.branch,
      intent: "manual",
    });
    if (refresh.kind !== "ready") {
      throw new Error(`Repository branch refresh did not complete: ${refresh.kind}.`);
    }
    return null;
  },
});
