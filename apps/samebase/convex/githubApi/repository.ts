import { Octokit } from "@octokit/rest";

import {
  getConvexDirectoryRootDirectory,
  normalizeConvexDirectoryPath,
} from "../../shared/convexCodeLocation";
import { getConvexConfigRootDirectory } from "../../shared/convexConfigPath";
import type { ProviderApiCallRecorder } from "../logging/providerApiLog";

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

/** `octokit` must use an installation token restricted to `githubRepositoryDatabaseId`. */
export async function resolveGitHubRepositoryById(args: {
  octokit: Octokit;
  githubRepositoryDatabaseId: string;
  recordApiCall?: ProviderApiCallRecorder;
}) {
  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/installation/repositories",
    values: {},
  });
  const accessibleRepositories = await args.octokit.request("GET /installation/repositories");
  const selectedRepository = accessibleRepositories.data.repositories.find(
    (repository) => String(repository.id) === args.githubRepositoryDatabaseId,
  );
  if (selectedRepository === undefined) {
    throw new Error("The GitHub App installation cannot access the selected repository.");
  }

  const ownerName = selectedRepository.owner.login.trim();
  const repoName = selectedRepository.name.trim();
  if (!ownerName || !repoName) {
    throw new Error("GitHub returned invalid repository coordinates.");
  }
  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}",
    values: {
      params: {
        path: { owner: ownerName, repo: repoName },
      },
    },
  });
  const repository = await args.octokit.rest.repos.get({
    owner: ownerName,
    repo: repoName,
  });
  if (String(repository.data.id) !== args.githubRepositoryDatabaseId) {
    throw new Error("GitHub repository response did not match the selected repository.");
  }
  if (
    repository.data.owner.id !== selectedRepository.owner.id ||
    repository.data.owner.login !== ownerName ||
    repository.data.name !== repoName
  ) {
    throw new Error("GitHub returned inconsistent repository coordinates.");
  }

  return repository;
}

export async function fetchGitHubRepoIdentity(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  expectedRepoId: string;
  signal?: AbortSignal;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<{ ownerId: string; defaultBranch: string }> {
  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}",
    values: {
      params: {
        path: {
          owner: args.owner,
          repo: args.repo,
        },
      },
    },
  });

  const signal = args.signal ?? createGitHubRequestDeadlineSignal();
  const response = await args.octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
    request: { signal },
  });
  const repoId = String(response.data.id);
  const ownerId = String(response.data.owner.id);
  const defaultBranch = response.data.default_branch.trim();
  if (repoId !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the Samebase repository.");
  }
  if (!defaultBranch) {
    throw new Error("GitHub repository response did not include a default branch.");
  }
  return { ownerId, defaultBranch };
}

function requireGitHubCommitSha(value: string): string {
  const commitSha = value.trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commitSha)) {
    throw new Error("GitHub default branch ref did not include a valid commit SHA.");
  }
  return commitSha;
}

export async function fetchGitHubDefaultBranchHead(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  expectedRepoId: string;
  signal?: AbortSignal;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<{ defaultBranch: string; commitSha: string }> {
  const repository = await fetchGitHubRepoIdentity(args);
  const signal = args.signal ?? createGitHubRequestDeadlineSignal();

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/ref/{ref}",
    values: {
      params: {
        path: { owner: args.owner, repo: args.repo, ref: `heads/${repository.defaultBranch}` },
      },
    },
  });

  const ref = await args.octokit.rest.git.getRef({
    owner: args.owner,
    repo: args.repo,
    ref: `heads/${repository.defaultBranch}`,
    request: { signal },
  });
  return {
    defaultBranch: repository.defaultBranch,
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
  octokit: Octokit;
  owner: string;
  repo: string;
  expectedRepoId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<GitHubConvexCodeLocationDiscovery> {
  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}",
    values: { params: { path: { owner: args.owner, repo: args.repo } } },
  });
  const repository = await args.octokit.rest.repos.get({ owner: args.owner, repo: args.repo });
  if (String(repository.data.id) !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the Samebase repository.");
  }
  const defaultBranch = repository.data.default_branch.trim();
  if (!defaultBranch) {
    throw new Error("GitHub repository response did not include a default branch.");
  }

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/ref/{ref}",
    values: {
      params: {
        path: { owner: args.owner, repo: args.repo, ref: `heads/${defaultBranch}` },
      },
    },
  });
  const ref = await args.octokit.rest.git.getRef({
    owner: args.owner,
    repo: args.repo,
    ref: `heads/${defaultBranch}`,
  });
  const commitSha = ref.data.object.sha;

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/commits/{commit_sha}",
    values: {
      params: { path: { owner: args.owner, repo: args.repo, commit_sha: commitSha } },
    },
  });
  const commit = await args.octokit.rest.git.getCommit({
    owner: args.owner,
    repo: args.repo,
    commit_sha: commitSha,
  });
  const treeSha = commit.data.tree.sha;

  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
    values: {
      params: {
        path: { owner: args.owner, repo: args.repo, tree_sha: treeSha },
        query: { recursive: "1" },
      },
    },
  });
  const tree = await args.octokit.rest.git.getTree({
    owner: args.owner,
    repo: args.repo,
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
