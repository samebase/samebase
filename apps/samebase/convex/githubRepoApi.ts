import { Octokit } from "@octokit/rest";

import { getConvexConfigRootDirectory } from "../shared/convexConfigPath";
import type { ProviderApiCallRecorder } from "./providerApiLog";

export type GitHubConvexConfigCandidate =
  | {
      state: "valid";
      convexConfigPath: string;
      rootDirectory: string;
      blobSha: string;
    }
  | {
      state: "invalid";
      convexConfigPath: string;
      rootDirectory: string;
      blobSha: string;
      reason: "invalid_json_object";
    };

export type GitHubConvexConfigDiscovery = {
  completeness: "complete" | "partial";
  defaultBranch: string;
  commitSha: string;
  treeSha: string;
  configs: GitHubConvexConfigCandidate[];
};

export async function fetchGitHubRepoIdentity(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
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
  const response = await octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
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

function parseConvexConfigCandidate(args: {
  convexConfigPath: string;
  blobSha: string;
  content: string;
}): GitHubConvexConfigCandidate {
  const rootDirectory = getConvexConfigRootDirectory(args.convexConfigPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.content);
  } catch {
    return {
      state: "invalid",
      convexConfigPath: args.convexConfigPath,
      rootDirectory,
      blobSha: args.blobSha,
      reason: "invalid_json_object",
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      state: "invalid",
      convexConfigPath: args.convexConfigPath,
      rootDirectory,
      blobSha: args.blobSha,
      reason: "invalid_json_object",
    };
  }
  return {
    state: "valid",
    convexConfigPath: args.convexConfigPath,
    rootDirectory,
    blobSha: args.blobSha,
  };
}

export async function fetchGitHubConvexConfigDiscovery(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<GitHubConvexConfigDiscovery> {
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
  }
  configBlobs.sort(
    (left, right) => left.path.localeCompare(right.path) || left.sha.localeCompare(right.sha),
  );
  const configs: GitHubConvexConfigCandidate[] = [];
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
    configs.push(
      parseConvexConfigCandidate({
        convexConfigPath: configBlob.path,
        blobSha: configBlob.sha,
        content: Buffer.from(blob.data.content.replace(/\n/g, ""), "base64").toString("utf-8"),
      }),
    );
  }

  return {
    completeness: tree.data.truncated ? "partial" : "complete",
    defaultBranch,
    commitSha,
    treeSha,
    configs,
  };
}
