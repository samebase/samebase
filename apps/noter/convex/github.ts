"use node";

import { action, internalAction } from "./_generated/server";
import { getUserId } from "./common";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { guessMime, withRetry } from "./gitOperationsActions";
import {
  getRepositoryMediaKind,
  isSvgRepositoryMediaPath,
} from "../shared/repositoryMedia";

const {
  array,
  boolean,
  id,
  literal,
  null: nullValidator,
  number,
  object,
  optional,
  string,
  union,
} = v;

const githubRepositoryListItem = object({
  id: number(),
  name: string(),
  full_name: string(),
  html_url: string(),
  description: union(string(), nullValidator()),
  private: boolean(),
  fork: boolean(),
  created_at: string(),
  updated_at: string(),
  language: union(string(), nullValidator()),
  stargazers_count: number(),
  forks_count: number(),
});

type GitHubRepositoryListItem = Infer<typeof githubRepositoryListItem>;

type CachedRepositoryBlob = {
  storageId?: string | null;
  text?: string | null;
  mime?: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeGitHubRepositoryListItem(
  value: unknown,
): GitHubRepositoryListItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    id,
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

// List the current user's GitHub repositories
export const listRepositories = action({
  args: {},
  returns: array(githubRepositoryListItem),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const accessToken = githubConnection.auth.credential;

    // Fetch repositories from GitHub API
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "noter-App",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const reposRaw: unknown = await response.json();
    if (!Array.isArray(reposRaw)) {
      throw new Error("Unexpected GitHub API response format");
    }

    return reposRaw.map((repo) => {
      const normalized = normalizeGitHubRepositoryListItem(repo);
      if (normalized === null) {
        throw new Error("Unexpected GitHub repository payload");
      }

      return normalized;
    });
  },
});

const repositoryFileContentResult = union(
  object({ exists: literal(false) }),
  object({ exists: literal(true), content: string() }),
);

type RepositoryFileContent = Infer<typeof repositoryFileContentResult>;
const PAGE_LOAD_REFRESH_DEBOUNCE_MS = 10 * 1000;

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
);

type RepositoryMediaAsset = Infer<typeof repositoryMediaAssetResult>;

function toGitTreeRef(branch: string): string {
  if (branch.startsWith("refs/heads/")) {
    return branch.slice("refs/".length);
  }
  if (branch.startsWith("heads/")) {
    return branch;
  }
  return `heads/${branch}`;
}

interface RemoteBranchSummary {
  name: string;
  headCommitSha: string;
  lastCommitAt?: number;
  aheadBy?: number;
  behindBy?: number;
  aheadBehindState: "resolved" | "unavailable" | "preserve";
  isDefault: boolean;
  isProtected: boolean;
}

interface CachedBranchTreeSnapshot {
  treeSHA: string;
  commitSHA?: string;
}

interface RepositoryTreeUpdatePlan {
  shouldUpdateBranchTree: boolean;
  shouldUpdateLegacyTree: boolean;
  shouldUpdateLegacyCommit: boolean;
}

export function computeRepositoryTreeUpdatePlan(args: {
  resolvedBranch: string;
  defaultBranch?: string;
  fetchedTreeSHA: string;
  fetchedCommitSHA?: string;
  cachedBranchTree: CachedBranchTreeSnapshot | null;
  legacyTreeSHA: string;
  legacyCommitSHA?: string;
}): RepositoryTreeUpdatePlan {
  const shouldUpdateBranchTree =
    !args.cachedBranchTree ||
    args.fetchedTreeSHA !== args.cachedBranchTree.treeSHA ||
    args.fetchedCommitSHA !== args.cachedBranchTree.commitSHA;
  const isDefaultBranch =
    typeof args.defaultBranch === "string" &&
    args.resolvedBranch === args.defaultBranch;
  const shouldUpdateLegacyTree =
    isDefaultBranch && args.fetchedTreeSHA !== args.legacyTreeSHA;
  const shouldUpdateLegacyCommit =
    isDefaultBranch &&
    typeof args.fetchedCommitSHA === "string" &&
    args.fetchedCommitSHA !== args.legacyCommitSHA;

  return {
    shouldUpdateBranchTree,
    shouldUpdateLegacyTree,
    shouldUpdateLegacyCommit,
  };
}

function parseGitTimestamp(value: string | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return timestamp;
}

export function resolveAheadBehindBaseBranch(args: {
  branchNames: string[];
  defaultBranch: string;
}): string | undefined {
  return args.branchNames.some(
    (branchName) => branchName === args.defaultBranch,
  )
    ? args.defaultBranch
    : undefined;
}

async function getAheadBehindByBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  baseBranch: string | undefined;
  branchNames: string[];
}): Promise<
  Map<
    string,
    {
      state: "resolved" | "unavailable" | "preserve";
      aheadBy?: number;
      behindBy?: number;
    }
  >
> {
  const countsByBranch = new Map<
    string,
    {
      state: "resolved" | "unavailable" | "preserve";
      aheadBy?: number;
      behindBy?: number;
    }
  >();

  if (!args.baseBranch) {
    for (const branchName of args.branchNames) {
      countsByBranch.set(branchName, { state: "unavailable" });
    }
    return countsByBranch;
  }

  for (const branchName of args.branchNames) {
    if (branchName === args.baseBranch) {
      countsByBranch.set(branchName, {
        state: "resolved",
        aheadBy: 0,
        behindBy: 0,
      });
    }
  }

  const branchNamesToCompare = args.branchNames.filter(
    (branchName) => branchName !== args.baseBranch,
  );
  const chunkSize = 10;
  for (
    let startIndex = 0;
    startIndex < branchNamesToCompare.length;
    startIndex += chunkSize
  ) {
    const chunk = branchNamesToCompare.slice(
      startIndex,
      startIndex + chunkSize,
    );
    const chunkResults = await Promise.all(
      chunk.map(async (branchName) => {
        try {
          const response =
            await args.octokit.rest.repos.compareCommitsWithBasehead({
              owner: args.owner,
              repo: args.repo,
              basehead: `${args.baseBranch}...${branchName}`,
            });
          const aheadBy = response.data.ahead_by;
          const behindBy = response.data.behind_by;
          if (typeof aheadBy !== "number" || typeof behindBy !== "number") {
            return {
              branchName,
              state: "preserve" as const,
              aheadBy: undefined,
              behindBy: undefined,
            };
          }
          return {
            branchName,
            state: "resolved" as const,
            aheadBy,
            behindBy,
          };
        } catch (error: unknown) {
          console.warn(
            "compareCommitsWithBasehead failed",
            JSON.stringify({
              owner: args.owner,
              repo: args.repo,
              baseBranch: args.baseBranch,
              branchName,
              error:
                error instanceof Error
                  ? error.message
                  : String(error ?? "unknown"),
            }),
          );
          return {
            branchName,
            state: "preserve" as const,
            aheadBy: undefined,
            behindBy: undefined,
          };
        }
      }),
    );

    for (const chunkResult of chunkResults) {
      countsByBranch.set(chunkResult.branchName, {
        state: chunkResult.state,
        aheadBy: chunkResult.aheadBy,
        behindBy: chunkResult.behindBy,
      });
    }
  }

  return countsByBranch;
}

async function getHeadCommitTimestamps(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  shas: string[];
}): Promise<Map<string, number | undefined>> {
  const uniqueShas = Array.from(new Set(args.shas));
  const timestampsBySha = new Map<string, number | undefined>();
  const chunkSize = 20;

  for (let start = 0; start < uniqueShas.length; start += chunkSize) {
    const chunk = uniqueShas.slice(start, start + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (sha) => {
        try {
          const response = await args.octokit.rest.git.getCommit({
            owner: args.owner,
            repo: args.repo,
            commit_sha: sha,
          });
          const lastCommitAt =
            parseGitTimestamp(response.data.committer.date) ??
            parseGitTimestamp(response.data.author.date);
          return { sha, lastCommitAt };
        } catch {
          return { sha, lastCommitAt: undefined };
        }
      }),
    );

    for (const result of chunkResults) {
      timestampsBySha.set(result.sha, result.lastCommitAt);
    }
  }

  return timestampsBySha;
}

async function listRemoteBranches(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  includeAheadBehind: boolean;
}): Promise<RemoteBranchSummary[]> {
  const repoResponse = await args.octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
  });
  const defaultBranch =
    typeof repoResponse.data.default_branch === "string"
      ? repoResponse.data.default_branch
      : "main";

  const branches: RemoteBranchSummary[] = [];
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const pageResponse = await args.octokit.rest.repos.listBranches({
      owner: args.owner,
      repo: args.repo,
      per_page: perPage,
      page,
    });
    if (pageResponse.data.length === 0) {
      break;
    }

    for (const branch of pageResponse.data) {
      if (typeof branch.name !== "string") {
        continue;
      }
      const headCommitSha =
        typeof branch.commit.sha === "string" ? branch.commit.sha : "";
      if (headCommitSha.length === 0) {
        continue;
      }

      branches.push({
        name: branch.name,
        headCommitSha,
        aheadBehindState: "preserve",
        isDefault: branch.name === defaultBranch,
        isProtected: branch.protected === true,
      });
    }

    if (pageResponse.data.length < perPage) {
      break;
    }
  }

  const branchNames = branches.map((branch) => branch.name);
  const baseBranch = resolveAheadBehindBaseBranch({
    branchNames,
    defaultBranch,
  });
  const aheadBehindByBranchPromise = args.includeAheadBehind
    ? getAheadBehindByBranch({
        octokit: args.octokit,
        owner: args.owner,
        repo: args.repo,
        baseBranch,
        branchNames,
      })
    : Promise.resolve(
        new Map(
          branchNames.map((branchName) => [
            branchName,
            { state: "preserve" as const },
          ]),
        ),
      );
  const [timestampsBySha, aheadBehindByBranch] = await Promise.all([
    getHeadCommitTimestamps({
      octokit: args.octokit,
      owner: args.owner,
      repo: args.repo,
      shas: branches.map((branch) => branch.headCommitSha),
    }),
    aheadBehindByBranchPromise,
  ]);

  return branches.map((branch) => {
    const aheadBehind = aheadBehindByBranch.get(branch.name) ?? {
      state: "preserve" as const,
    };
    return {
      ...branch,
      lastCommitAt: timestampsBySha.get(branch.headCommitSha),
      aheadBy:
        aheadBehind.state === "resolved" ? aheadBehind.aheadBy : undefined,
      behindBy:
        aheadBehind.state === "resolved" ? aheadBehind.behindBy : undefined,
      aheadBehindState: aheadBehind.state,
    };
  });
}

function buildDataUrl(mimeType: string, content: Buffer): string {
  return `data:${mimeType};base64,${content.toString("base64")}`;
}

function readStoredMimeType(
  filePath: string,
  blobMime: string | undefined,
): string {
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
  mediaKind: "image",
  fileName: string,
): Promise<RepositoryMediaAsset | null> {
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

  if (
    typeof cachedBlob?.text === "string" &&
    isSvgRepositoryMediaPath(filePath)
  ) {
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

function getRepositoryMediaErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Preview unavailable.";
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

export const getRepositoryFileContent = action({
  args: {
    repositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
  },
  returns: repositoryFileContentResult,
  handler: async (ctx, args): Promise<RepositoryFileContent> => {
    const requestedBranch = args.branch?.trim() || undefined;
    const userId = await getUserId(ctx);

    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    if (!requestedBranch) {
      const targetFile = vault.treeData.tree.find(
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

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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
  args: {
    repositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
  },
  returns: repositoryMediaAssetResult,
  handler: async (ctx, args): Promise<RepositoryMediaAsset> => {
    const mediaKind = getRepositoryMediaKind(args.filePath);
    if (mediaKind === null) {
      return { found: false, reason: "missing" };
    }

    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim() || undefined;
    const fileName = getRepositoryMediaFileName(args.filePath);

    if (!requestedBranch) {
      const targetFile = vault.treeData.tree.find(
        (item: { path: string; type: string; sha?: string }) =>
          item.path === args.filePath && item.type === "blob",
      );

      if (!targetFile?.sha) {
        return { found: false, reason: "missing" };
      }

      const cachedBlob = await ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        {
          sha: targetFile.sha,
        },
      );
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

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        path: args.filePath,
        ref: requestedBranch,
      });

      if (Array.isArray(file.data) || file.data.type !== "file") {
        return { found: false, reason: "missing" };
      }

      if (typeof file.data.sha === "string") {
        const cachedBlob = await ctx.runQuery(
          internal.gitOperations.getBlobBySha,
          {
            sha: file.data.sha,
          },
        );
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

      if (
        typeof file.data.content !== "string" ||
        file.data.content.length === 0
      ) {
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for this file.",
        };
      }

      const mimeType = guessMime(args.filePath);
      const content = file.data.content.replace(/\n/g, "");
      const buffer = Buffer.from(content, "base64");
      const storageId = await withRetry(() =>
        ctx.storage.store(new Blob([buffer], { type: mimeType })),
      );

      if (typeof file.data.sha === "string") {
        await ctx.runMutation(internal.gitOperations.saveFileBlob, {
          vaultId: vault._id,
          sha: file.data.sha,
          size: buffer.byteLength,
          mime: mimeType,
          text: undefined,
          storageId,
          ext: getRepositoryMediaExtension(args.filePath),
          debugFilePath: args.filePath,
        });
      }

      const url = await ctx.storage.getUrl(storageId);
      if (typeof url !== "string" || url.length === 0) {
        throw new Error("Failed to create media preview URL");
      }

      return {
        found: true,
        kind: mediaKind,
        mimeType,
        url,
        fileName,
      };
    } catch (error: unknown) {
      if (getRepositoryMediaErrorStatus(error) === 404) {
        return { found: false, reason: "missing" };
      }

      if (isRepositoryMediaTooLargeError(error)) {
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for files larger than 1 MB.",
        };
      }

      throw error;
    }
  },
});

// Public action to refresh repository tree (called from frontend on vault open)
export const refreshRepositoryTree = action({
  args: {
    owner: string(),
    repo: string(),
    branch: optional(string()),
    trigger: optional(union(literal("focus"), literal("page_load"))),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const requestedBranch =
      typeof args.branch === "string" && args.branch.trim().length > 0
        ? args.branch.trim()
        : undefined;

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId,
    });
    if (!vault) return null;

    if (requestedBranch) {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId,
        owner: args.owner,
        repo: args.repo,
        branch: requestedBranch,
        includeAheadBehind: false,
      });
      return null;
    }

    const debounceMs =
      args.trigger === "page_load" ? PAGE_LOAD_REFRESH_DEBOUNCE_MS : undefined;

    // Atomically claim the refresh lock; skip if debounced or already running
    const { claimed } = await ctx.runMutation(internal.vault.claimTreeRefresh, {
      vaultId: vault._id,
      debounceMs,
    });
    if (!claimed) return null;

    let markRefreshed = false;
    try {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId,
        owner: args.owner,
        repo: args.repo,
        includeAheadBehind: args.trigger === "page_load",
      });
      markRefreshed = true;
    } finally {
      await ctx.runMutation(internal.vault.releaseTreeRefresh, {
        vaultId: vault._id,
        markRefreshed,
      });
    }

    return null;
  },
});

// Get repository tree structure
export const updateRepositoryTree = internalAction({
  args: {
    userId: id("users"),
    owner: string(),
    repo: string(),
    branch: optional(string()),
    includeAheadBehind: optional(boolean()),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    console.log("updateRepositoryTree", args);
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId: args.userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    const targetBranch =
      typeof args.branch === "string" && args.branch.trim().length > 0
        ? args.branch.trim()
        : undefined;

    const remoteBranches = await listRemoteBranches({
      octokit,
      owner: args.owner,
      repo: args.repo,
      includeAheadBehind: args.includeAheadBehind === true,
    });
    await ctx.runMutation(internal.vault.syncVaultRemoteBranches, {
      vaultId: vault._id,
      syncedAt: Date.now(),
      branches: remoteBranches,
    });
    const defaultBranch = remoteBranches.find(
      (branch) => branch.isDefault,
    )?.name;
    const resolvedBranch = targetBranch ?? defaultBranch ?? "main";

    const tree = await octokit.rest.git.getTree({
      owner: args.owner,
      repo: args.repo,
      tree_sha: toGitTreeRef(resolvedBranch),
      recursive: "1",
    });
    const latestCommits = await octokit.rest.repos.listCommits({
      owner: args.owner,
      repo: args.repo,
      sha: resolvedBranch,
      per_page: 1,
    });
    const latestCommitSha = latestCommits.data[0]?.sha;

    const cachedBranchTree = await ctx.runQuery(
      internal.vault.getVaultBranchTree,
      {
        vaultId: vault._id,
        branch: resolvedBranch,
      },
    );
    const {
      shouldUpdateBranchTree,
      shouldUpdateLegacyTree,
      shouldUpdateLegacyCommit,
    } = computeRepositoryTreeUpdatePlan({
      resolvedBranch,
      defaultBranch,
      fetchedTreeSHA: tree.data.sha,
      fetchedCommitSHA: latestCommitSha,
      cachedBranchTree,
      legacyTreeSHA: vault.treeData.sha,
      legacyCommitSHA: vault.commitSHA,
    });

    if (
      !shouldUpdateBranchTree &&
      !shouldUpdateLegacyTree &&
      !shouldUpdateLegacyCommit
    ) {
      return null;
    }

    if (shouldUpdateBranchTree) {
      await ctx.runMutation(internal.vault.upsertVaultBranchTree, {
        vaultId: vault._id,
        branch: resolvedBranch,
        treeData: tree.data,
        commitSHA: latestCommitSha,
      });
    }

    if (shouldUpdateLegacyTree || shouldUpdateLegacyCommit) {
      await ctx.runMutation(internal.vault.updateVaultTree, {
        vaultId: vault._id,
        treeData: tree.data,
        commitSHA: latestCommitSha,
      });
    }

    return null;
  },
});
