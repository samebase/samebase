import { Octokit } from "@octokit/rest";
import { z } from "zod";

import {
  getConvexDirectoryRootDirectory,
  normalizeConvexDirectoryPath,
} from "../shared/convexCodeLocation";
import { getConvexConfigRootDirectory } from "../shared/convexConfigPath";
import type { GitHubVaultAccess } from "./githubAppAccess";
import type { ProviderApiCallRecorder } from "./providerApiLog";

const GITHUB_INSTALLATION_REPOSITORY_PAGE_SIZE = 100;
const MAX_GITHUB_INSTALLATION_REPOSITORY_PAGES = 100;
const GITHUB_REQUEST_DEADLINE_MS = 15_000;

export function createGitHubRequestDeadlineSignal(): AbortSignal {
  return AbortSignal.timeout(GITHUB_REQUEST_DEADLINE_MS);
}

export type GitHubConvexCodeLocationCandidate =
  | {
      kind: "config";
      convexConfigPath: string;
      rootDirectory: string;
      blobSha: string;
    }
  | {
      kind: "directory";
      convexDirectoryPath: string;
      rootDirectory: string;
      convexDirectoryTreeSha: string;
      packageJsonPath: string;
      packageJsonBlobSha: string;
    };

export type GitHubConvexCodeLocationDiscovery = {
  completeness: "complete" | "partial";
  defaultBranch: string;
  commitSha: string;
  treeSha: string;
  locations: GitHubConvexCodeLocationCandidate[];
};

const providerInstallationRepositoriesSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      full_name: z.string().min(3),
      default_branch: z.string().min(1),
      owner: z.object({
        id: z.number().int().positive(),
        login: z.string().min(1),
      }),
    }),
  ),
});

export type GitHubRepositoryIdentity = {
  repositoryId: string;
  ownerId: string;
  ownerLogin: string;
  repositoryName: string;
  defaultBranch: string;
};

export async function listGitHubInstallationRepositories(args: {
  octokit: Octokit;
  signal?: AbortSignal;
}): Promise<Map<string, GitHubRepositoryIdentity>> {
  const repositories = new Map<string, GitHubRepositoryIdentity>();
  const signal = args.signal ?? createGitHubRequestDeadlineSignal();

  for (let page = 1; page <= MAX_GITHUB_INSTALLATION_REPOSITORY_PAGES; page += 1) {
    const response = await args.octokit.request("GET /installation/repositories", {
      page,
      per_page: GITHUB_INSTALLATION_REPOSITORY_PAGE_SIZE,
      request: { signal },
    });
    const providerPage = providerInstallationRepositoriesSchema.parse(response.data);
    for (const repository of providerPage.repositories) {
      const repositoryFullName = `${repository.owner.login}/${repository.name}`;
      if (repository.full_name !== repositoryFullName) {
        throw new Error("GitHub returned inconsistent repository coordinates.");
      }
      const repositoryId = String(repository.id);
      repositories.set(repositoryId, {
        repositoryId,
        ownerId: String(repository.owner.id),
        ownerLogin: repository.owner.login,
        repositoryName: repository.name,
        defaultBranch: repository.default_branch,
      });
    }
    if (
      providerPage.repositories.length < GITHUB_INSTALLATION_REPOSITORY_PAGE_SIZE ||
      repositories.size >= providerPage.total_count
    ) {
      return repositories;
    }
  }

  throw new Error(
    `GitHub installation repository pagination exceeded ${MAX_GITHUB_INSTALLATION_REPOSITORY_PAGES} pages.`,
  );
}

export async function resolveGitHubInstallationRepositoryIdentity(args: {
  octokit: Octokit;
  expectedRepoId: string;
  expectedOwnerId: string;
  signal?: AbortSignal;
}): Promise<GitHubRepositoryIdentity> {
  const repositories = await listGitHubInstallationRepositories(args);
  const repository = repositories.get(args.expectedRepoId);
  if (repository === undefined) {
    throw new Error("GitHub App installation cannot access the vault repository.");
  }
  if (repository.ownerId !== args.expectedOwnerId) {
    throw new Error(
      "GitHub repository owner changed. Remove this vault and connect the repository under its current owner.",
    );
  }
  return repository;
}

function requireGitHubCommitSha(value: string): string {
  const commitSha = value.trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commitSha)) {
    throw new Error("GitHub default branch ref did not include a valid commit SHA.");
  }
  return commitSha;
}

export async function fetchGitHubDefaultBranchHead(args: {
  githubAccess: GitHubVaultAccess;
  signal?: AbortSignal;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<{ commitSha: string }> {
  const signal = args.signal ?? createGitHubRequestDeadlineSignal();

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/ref/{ref}",
    values: {
      params: {
        path: {
          owner: args.githubAccess.githubOwnerLogin,
          repo: args.githubAccess.repositoryName,
          ref: `heads/${args.githubAccess.repositoryDefaultBranch}`,
        },
      },
    },
  });

  const ref = await args.githubAccess.octokit.rest.git.getRef({
    owner: args.githubAccess.githubOwnerLogin,
    repo: args.githubAccess.repositoryName,
    ref: `heads/${args.githubAccess.repositoryDefaultBranch}`,
    request: { signal },
  });
  return {
    commitSha: requireGitHubCommitSha(ref.data.object.sha),
  };
}

function isConvexConfigPath(path: string): boolean {
  return path === "convex.json" || path.endsWith("/convex.json");
}

function isPackageJsonPath(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

function isConvexDirectoryPath(path: string): boolean {
  return path === "convex" || path.endsWith("/convex");
}

function getPackageJsonPath(rootDirectory: string): string {
  return rootDirectory === "/" ? "package.json" : `${rootDirectory}/package.json`;
}

export async function fetchGitHubConvexCodeLocationDiscovery(args: {
  githubAccess: GitHubVaultAccess;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<GitHubConvexCodeLocationDiscovery> {
  const defaultBranch = args.githubAccess.repositoryDefaultBranch;

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/ref/{ref}",
    values: {
      params: {
        path: {
          owner: args.githubAccess.githubOwnerLogin,
          repo: args.githubAccess.repositoryName,
          ref: `heads/${defaultBranch}`,
        },
      },
    },
  });
  const ref = await args.githubAccess.octokit.rest.git.getRef({
    owner: args.githubAccess.githubOwnerLogin,
    repo: args.githubAccess.repositoryName,
    ref: `heads/${defaultBranch}`,
  });
  const commitSha = ref.data.object.sha;

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/commits/{commit_sha}",
    values: {
      params: {
        path: {
          owner: args.githubAccess.githubOwnerLogin,
          repo: args.githubAccess.repositoryName,
          commit_sha: commitSha,
        },
      },
    },
  });
  const commit = await args.githubAccess.octokit.rest.git.getCommit({
    owner: args.githubAccess.githubOwnerLogin,
    repo: args.githubAccess.repositoryName,
    commit_sha: commitSha,
  });
  const treeSha = commit.data.tree.sha;

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
    values: {
      params: {
        path: {
          owner: args.githubAccess.githubOwnerLogin,
          repo: args.githubAccess.repositoryName,
          tree_sha: treeSha,
        },
        query: { recursive: "1" },
      },
    },
  });
  const tree = await args.githubAccess.octokit.rest.git.getTree({
    owner: args.githubAccess.githubOwnerLogin,
    repo: args.githubAccess.repositoryName,
    tree_sha: treeSha,
    recursive: "1",
  });
  const configBlobs: { path: string; sha: string }[] = [];
  const packageJsonBlobs = new Map<string, string>();
  const convexDirectories: { path: string; sha: string }[] = [];
  for (const item of tree.data.tree) {
    if (
      item.type === "blob" &&
      (item.mode === "100644" || item.mode === "100755") &&
      item.path &&
      item.sha &&
      isConvexConfigPath(item.path)
    ) {
      configBlobs.push({ path: item.path, sha: item.sha });
    }
    if (
      item.type === "blob" &&
      (item.mode === "100644" || item.mode === "100755") &&
      item.path &&
      item.sha &&
      isPackageJsonPath(item.path)
    ) {
      packageJsonBlobs.set(item.path, item.sha);
    }
    if (
      item.type === "tree" &&
      item.mode === "040000" &&
      item.path &&
      item.sha &&
      isConvexDirectoryPath(item.path)
    ) {
      convexDirectories.push({
        path: normalizeConvexDirectoryPath(item.path),
        sha: item.sha,
      });
    }
  }
  configBlobs.sort(
    (left, right) => left.path.localeCompare(right.path) || left.sha.localeCompare(right.sha),
  );
  const locations: GitHubConvexCodeLocationCandidate[] = configBlobs.map((configBlob) => ({
    kind: "config",
    convexConfigPath: configBlob.path,
    rootDirectory: getConvexConfigRootDirectory(configBlob.path),
    blobSha: configBlob.sha,
  }));

  const configRootDirectories = new Set(
    configBlobs.map((config) => getConvexConfigRootDirectory(config.path)),
  );
  for (const directory of convexDirectories) {
    const rootDirectory = getConvexDirectoryRootDirectory(directory.path);
    if (configRootDirectories.has(rootDirectory)) {
      continue;
    }
    const packageJsonPath = getPackageJsonPath(rootDirectory);
    const packageJsonBlobSha = packageJsonBlobs.get(packageJsonPath);
    if (!packageJsonBlobSha) {
      continue;
    }
    locations.push({
      kind: "directory",
      convexDirectoryPath: directory.path,
      rootDirectory,
      convexDirectoryTreeSha: directory.sha,
      packageJsonPath,
      packageJsonBlobSha,
    });
  }
  locations.sort((left, right) => {
    const leftPath = left.kind === "config" ? left.convexConfigPath : left.convexDirectoryPath;
    const rightPath = right.kind === "config" ? right.convexConfigPath : right.convexDirectoryPath;
    return leftPath.localeCompare(rightPath);
  });

  return {
    completeness: tree.data.truncated ? "partial" : "complete",
    defaultBranch,
    commitSha,
    treeSha,
    locations,
  };
}
