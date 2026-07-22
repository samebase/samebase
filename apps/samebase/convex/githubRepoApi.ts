import { Octokit } from "@octokit/rest";

import {
  getConvexDirectoryRootDirectory,
  normalizeConvexDirectoryPath,
} from "../shared/convexCodeLocation";
import { getConvexConfigRootDirectory } from "../shared/convexConfigPath";
import type { ProviderApiCallRecorder } from "./providerApiLog";

const GITHUB_REQUEST_DEADLINE_MS = 15_000;

export function createGitHubRequestDeadlineSignal(): AbortSignal {
  return AbortSignal.timeout(GITHUB_REQUEST_DEADLINE_MS);
}

export type GitHubConvexCodeLocationCandidate =
  | {
      state: "valid";
      kind: "config";
      convexConfigPath: string;
      rootDirectory: string;
      blobSha: string;
    }
  | {
      state: "invalid";
      kind: "config";
      convexConfigPath: string;
      rootDirectory: string;
      blobSha: string;
      reason: "invalid_json_object";
    }
  | {
      state: "valid";
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

export async function fetchGitHubRepoIdentity(args: {
  githubAccessToken: string;
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

  const octokit = new Octokit({ auth: args.githubAccessToken });
  const signal = args.signal ?? createGitHubRequestDeadlineSignal();
  const response = await octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
    request: { signal },
  });
  const repoId = String(response.data.id);
  const ownerId = String(response.data.owner.id);
  const defaultBranch = response.data.default_branch.trim();
  if (repoId !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the vault repo.");
  }
  if (!defaultBranch) {
    throw new Error("GitHub repository response did not include a default branch.");
  }
  return { ownerId, defaultBranch };
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

function parseConvexConfigCandidate(args: {
  convexConfigPath: string;
  blobSha: string;
  content: string;
}): GitHubConvexCodeLocationCandidate {
  const rootDirectory = getConvexConfigRootDirectory(args.convexConfigPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.content);
  } catch {
    return {
      state: "invalid",
      kind: "config",
      convexConfigPath: args.convexConfigPath,
      rootDirectory,
      blobSha: args.blobSha,
      reason: "invalid_json_object",
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      state: "invalid",
      kind: "config",
      convexConfigPath: args.convexConfigPath,
      rootDirectory,
      blobSha: args.blobSha,
      reason: "invalid_json_object",
    };
  }
  return {
    state: "valid",
    kind: "config",
    convexConfigPath: args.convexConfigPath,
    rootDirectory,
    blobSha: args.blobSha,
  };
}

export async function fetchGitHubConvexCodeLocationDiscovery(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<GitHubConvexCodeLocationDiscovery> {
  const octokit = new Octokit({ auth: args.githubAccessToken });
  await args.recordApiCall?.({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}",
    values: { params: { path: { owner: args.owner, repo: args.repo } } },
  });
  const repository = await octokit.rest.repos.get({ owner: args.owner, repo: args.repo });
  if (String(repository.data.id) !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the vault repo.");
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
  const ref = await octokit.rest.git.getRef({
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
  const commit = await octokit.rest.git.getCommit({
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
  const tree = await octokit.rest.git.getTree({
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
  const locations: GitHubConvexCodeLocationCandidate[] = [];
  for (const configBlob of configBlobs) {
    await args.recordApiCall?.({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/git/blobs/{file_sha}",
      values: {
        params: {
          path: { owner: args.owner, repo: args.repo, file_sha: configBlob.sha },
        },
      },
    });
    const blob = await octokit.rest.git.getBlob({
      owner: args.owner,
      repo: args.repo,
      file_sha: configBlob.sha,
    });
    if (blob.data.encoding !== "base64") {
      throw new Error(`GitHub returned an unsupported encoding for ${configBlob.path}.`);
    }
    locations.push(
      parseConvexConfigCandidate({
        convexConfigPath: configBlob.path,
        blobSha: configBlob.sha,
        content: Buffer.from(blob.data.content.replace(/\n/g, ""), "base64").toString("utf-8"),
      }),
    );
  }

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
      state: "valid",
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
