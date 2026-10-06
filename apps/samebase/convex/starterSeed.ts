"use node";

import { Octokit } from "@octokit/rest";
import type { StarterTemplateManifest } from "./starterSeedManifest.generated";
import type { ProviderApiCall, ProviderApiCallRecorder } from "./providerApiLog";

export type { StarterTemplateManifest } from "./starterSeedManifest.generated";

type StarterTemplateTreeEntry = {
  path: string;
  mode: StarterTemplateFileMode;
  type: "blob";
} & ({ content: string } | { sha: string });

type StarterTemplateFileMode = StarterTemplateManifest["fileModes"][string];

export type StarterSeedGitClient = {
  createTree(args: {
    owner: string;
    repo: string;
    tree: StarterTemplateTreeEntry[];
  }): Promise<{ sha: string }>;
  createBlob(args: {
    owner: string;
    repo: string;
    contentBase64: string;
  }): Promise<{ sha: string }>;
  createCommit(args: {
    owner: string;
    repo: string;
    message: string;
    tree: string;
    parents: string[];
  }): Promise<{ sha: string }>;
  createRef(args: { owner: string; repo: string; ref: string; sha: string }): Promise<void>;
  updateRef(args: {
    owner: string;
    repo: string;
    ref: string;
    sha: string;
    force: boolean;
  }): Promise<void>;
  createBootstrapCommit(args: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    path: string;
    contentBase64: string;
  }): Promise<{ sha: string }>;
};

type StarterSeedGitClientOptions = {
  recordApiCall?: ProviderApiCallRecorder;
};

/** The file of the commit that a seeded branch points at before the starter: no starter file. */
const SEED_BOOTSTRAP_PATH = ".samebase-seed-bootstrap";

/** How many commits of a branch the seed check reads back to find the starter tree. */
const SEED_HISTORY_LIMIT = 100;

/** The reads that tell what a seeded branch holds before Samebase pushes the starter to it. */
export type StarterSeedBranchReader = {
  /** The branch head's tree and parent count; null when the branch or any commit is missing. */
  readBranchHead(args: {
    owner: string;
    repo: string;
    branch: string;
  }): Promise<{ treeSha: string; parentCount: number } | null>;
  /** The tree of each of the branch's latest commits, newest first. */
  listBranchTreeShas(args: {
    owner: string;
    repo: string;
    branch: string;
    limit: number;
  }): Promise<string[]>;
  readTreePaths(args: { owner: string; repo: string; treeSha: string }): Promise<string[]>;
};

const RETRYABLE_STATUSES = new Set([409, 422]);

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if (!("status" in error)) {
    return undefined;
  }

  const status = error.status;
  if (typeof status !== "number") {
    return undefined;
  }

  return status;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return typeof status === "number" && RETRYABLE_STATUSES.has(status);
}

function isRefAlreadyExistsError(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes("reference already exists");
}

function isEmptyRepositoryError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== 409) {
    return false;
  }
  const message = errorMessage(error).toLowerCase();
  return message.includes("repository is empty");
}

function isMissingBranchError(error: unknown): boolean {
  if (getErrorStatus(error) !== 422) {
    return false;
  }
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("branch") &&
    (message.includes("not found") || message.includes("does not exist"))
  );
}

function readRequiredCommitSha(value: unknown, operation: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`${operation} did not return a commit sha`);
}

async function retryOperation<T>(args: {
  operation: string;
  run: () => Promise<T>;
  maxAttempts?: number;
  shouldRetry?: (error: unknown) => boolean;
}): Promise<T> {
  const maxAttempts = args.maxAttempts ?? 3;
  const shouldRetry = args.shouldRetry ?? isRetryableError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await args.run();
    } catch (error) {
      if (!shouldRetry(error) || attempt === maxAttempts) {
        throw error;
      }

      console.warn("seed:retry", {
        operation: args.operation,
        attempt,
        status: getErrorStatus(error),
        message: errorMessage(error),
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 250 * attempt);
      });
    }
  }

  throw new Error(`Unreachable retry state for ${args.operation}`);
}

async function recordGitHubApiCall(
  options: StarterSeedGitClientOptions | undefined,
  call: Omit<ProviderApiCall, "provider">,
): Promise<void> {
  const recordApiCall = options?.recordApiCall;
  if (recordApiCall) {
    await recordApiCall({
      provider: "GitHub",
      ...call,
    });
  }
}

export function createStarterSeedGitClient(
  octokit: Octokit,
  options?: StarterSeedGitClientOptions,
): StarterSeedGitClient {
  return {
    createTree: async (args) => {
      await recordGitHubApiCall(options, {
        method: "POST",
        endpoint: "/repos/{owner}/{repo}/git/trees",
        values: {
          body: { tree: args.tree },
          params: { path: { owner: args.owner, repo: args.repo } },
        },
      });
      const response = await octokit.rest.git.createTree({
        owner: args.owner,
        repo: args.repo,
        tree: args.tree,
      });

      return {
        sha: response.data.sha,
      };
    },
    createBlob: async (args) => {
      await recordGitHubApiCall(options, {
        method: "POST",
        endpoint: "/repos/{owner}/{repo}/git/blobs",
        values: {
          body: {
            contentBase64: args.contentBase64,
            encoding: "base64",
          },
          params: { path: { owner: args.owner, repo: args.repo } },
        },
      });
      const response = await octokit.rest.git.createBlob({
        owner: args.owner,
        repo: args.repo,
        content: args.contentBase64,
        encoding: "base64",
      });

      return {
        sha: response.data.sha,
      };
    },
    createCommit: async (args) => {
      await recordGitHubApiCall(options, {
        method: "POST",
        endpoint: "/repos/{owner}/{repo}/git/commits",
        values: {
          body: {
            message: args.message,
            parents: args.parents,
            tree: args.tree,
          },
          params: { path: { owner: args.owner, repo: args.repo } },
        },
      });
      const response = await octokit.rest.git.createCommit({
        owner: args.owner,
        repo: args.repo,
        message: args.message,
        tree: args.tree,
        parents: args.parents,
      });

      return {
        sha: response.data.sha,
      };
    },
    createRef: async (args) => {
      await recordGitHubApiCall(options, {
        method: "POST",
        endpoint: "/repos/{owner}/{repo}/git/refs",
        values: {
          body: {
            ref: args.ref,
            sha: args.sha,
          },
          params: { path: { owner: args.owner, repo: args.repo } },
        },
      });
      await octokit.rest.git.createRef({
        owner: args.owner,
        repo: args.repo,
        ref: args.ref,
        sha: args.sha,
      });
    },
    updateRef: async (args) => {
      await recordGitHubApiCall(options, {
        method: "PATCH",
        endpoint: "/repos/{owner}/{repo}/git/refs/{ref}",
        values: {
          body: {
            force: args.force,
            sha: args.sha,
          },
          params: { path: { owner: args.owner, repo: args.repo, ref: args.ref } },
        },
      });
      await octokit.rest.git.updateRef({
        owner: args.owner,
        repo: args.repo,
        ref: args.ref,
        sha: args.sha,
        force: args.force,
      });
    },
    createBootstrapCommit: async (args) => {
      try {
        await recordGitHubApiCall(options, {
          method: "PUT",
          endpoint: "/repos/{owner}/{repo}/contents/{path}",
          values: {
            body: {
              branch: args.branch,
              contentBase64: args.contentBase64,
              message: args.message,
            },
            params: { path: { owner: args.owner, repo: args.repo, path: args.path } },
          },
        });
        const response = await octokit.rest.repos.createOrUpdateFileContents({
          owner: args.owner,
          repo: args.repo,
          branch: args.branch,
          path: args.path,
          message: args.message,
          content: args.contentBase64,
        });
        return {
          sha: readRequiredCommitSha(response.data.commit.sha, "seed:bootstrapCommit"),
        };
      } catch (error) {
        if (!isMissingBranchError(error)) {
          throw error;
        }
      }

      await recordGitHubApiCall(options, {
        method: "PUT",
        endpoint: "/repos/{owner}/{repo}/contents/{path}",
        values: {
          body: {
            contentBase64: args.contentBase64,
            message: args.message,
          },
          params: { path: { owner: args.owner, repo: args.repo, path: args.path } },
        },
      });
      const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        message: args.message,
        content: args.contentBase64,
      });
      return {
        sha: readRequiredCommitSha(response.data.commit.sha, "seed:bootstrapCommit"),
      };
    },
  };
}

function validateManifest(manifest: StarterTemplateManifest): void {
  if (manifest.version.length === 0) {
    throw new Error("starter template manifest version is required");
  }

  if (manifest.commitMessage.length === 0) {
    throw new Error("starter template manifest commitMessage is required");
  }

  const binaryFiles = manifest.binaryFiles;
  const fileCount = Object.keys(manifest.files).length + Object.keys(binaryFiles).length;
  if (fileCount === 0) {
    throw new Error("starter template manifest has no files");
  }

  const duplicatePaths = Object.keys(manifest.files).filter((path) =>
    Object.prototype.hasOwnProperty.call(binaryFiles, path),
  );
  if (duplicatePaths.length > 0) {
    throw new Error(
      `starter template manifest has duplicate file paths: ${duplicatePaths.join(", ")}`,
    );
  }

  const manifestPaths = new Set([...Object.keys(manifest.files), ...Object.keys(binaryFiles)]);
  const invalidModeEntries = Object.keys(manifest.fileModes).filter(
    (filePath) => !manifestPaths.has(filePath),
  );
  if (invalidModeEntries.length > 0) {
    throw new Error(
      `starter template manifest has invalid file modes: ${invalidModeEntries.join(", ")}`,
    );
  }
}

export function buildTreeEntriesForManifest(
  files: Record<string, string>,
  binaryFileShas: Record<string, string> = {},
  fileModes: StarterTemplateManifest["fileModes"] = {},
): StarterTemplateTreeEntry[] {
  const resolveMode = (filePath: string): StarterTemplateFileMode =>
    fileModes[filePath] ?? "100644";
  const entries: StarterTemplateTreeEntry[] = Object.entries(files).map(([filePath, content]) => ({
    path: filePath,
    mode: resolveMode(filePath),
    type: "blob",
    content,
  }));

  entries.push(
    ...Object.entries(binaryFileShas).map(([filePath, sha]) => ({
      path: filePath,
      mode: resolveMode(filePath),
      type: "blob" as const,
      sha,
    })),
  );

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function createBinaryFileBlobs(args: {
  client: StarterSeedGitClient;
  owner: string;
  repo: string;
  binaryFiles: Record<string, string>;
}): Promise<Record<string, string>> {
  const binaryFileShas: Record<string, string> = {};
  const entries = Object.entries(args.binaryFiles).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [filePath, contentBase64] of entries) {
    const blob = await retryOperation({
      operation: "seed:createBlob",
      shouldRetry: (error) => isRetryableError(error) && !isEmptyRepositoryError(error),
      run: async () =>
        await args.client.createBlob({
          owner: args.owner,
          repo: args.repo,
          contentBase64,
        }),
    });
    binaryFileShas[filePath] = blob.sha;
  }

  return binaryFileShas;
}

/**
What a branch holds before Samebase pushes the starter to it, which decides whether the force push of
the starter may run: missing or bootstrap (a root commit with only the bootstrap file) may take the
starter; seeded already holds the starter tree that the caller recorded, at its head or within the
latest commits; foreign has commits that Samebase did not make, which a force push would drop.
*/
export async function readSeedBranchState(args: {
  reader: StarterSeedBranchReader;
  owner: string;
  repo: string;
  branch: string;
  /** The starter tree recorded before an earlier push, which may have landed; null before any. */
  starterTreeSha: string | null;
}): Promise<"missing" | "bootstrap" | "seeded" | "foreign"> {
  const location = { owner: args.owner, repo: args.repo };
  const head = await args.reader.readBranchHead({ ...location, branch: args.branch });
  if (head === null) {
    return "missing";
  }
  if (args.starterTreeSha !== null) {
    if (head.treeSha === args.starterTreeSha) {
      return "seeded";
    }
    const treeShas = await args.reader.listBranchTreeShas({
      ...location,
      branch: args.branch,
      limit: SEED_HISTORY_LIMIT,
    });
    if (treeShas.includes(args.starterTreeSha)) {
      return "seeded";
    }
  }
  if (head.parentCount === 0) {
    const paths = await args.reader.readTreePaths({ ...location, treeSha: head.treeSha });
    if (paths.length === 1 && paths[0] === SEED_BOOTSTRAP_PATH) {
      return "bootstrap";
    }
  }
  return "foreign";
}

export function createStarterSeedBranchReader(
  octokit: Octokit,
  options?: StarterSeedGitClientOptions,
): StarterSeedBranchReader {
  return {
    readBranchHead: async (args) => {
      await recordGitHubApiCall(options, {
        method: "GET",
        endpoint: "/repos/{owner}/{repo}/branches/{branch}",
        values: { params: { path: args } },
      });
      try {
        const response = await octokit.rest.repos.getBranch(args);
        return {
          treeSha: response.data.commit.commit.tree.sha,
          parentCount: response.data.commit.parents.length,
        };
      } catch (error) {
        // GitHub answers 404 for a missing branch and 409 for a repository without commits.
        const status = getErrorStatus(error);
        if (status === 404 || status === 409) {
          return null;
        }
        throw error;
      }
    },
    listBranchTreeShas: async (args) => {
      await recordGitHubApiCall(options, {
        method: "GET",
        endpoint: "/repos/{owner}/{repo}/commits",
        values: {
          params: {
            path: { owner: args.owner, repo: args.repo },
            query: { sha: args.branch, per_page: args.limit },
          },
        },
      });
      const response = await octokit.rest.repos.listCommits({
        owner: args.owner,
        repo: args.repo,
        sha: args.branch,
        per_page: args.limit,
      });
      return response.data.map((commit) => commit.commit.tree.sha);
    },
    readTreePaths: async (args) => {
      await recordGitHubApiCall(options, {
        method: "GET",
        endpoint: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
        values: {
          params: { path: { owner: args.owner, repo: args.repo, tree_sha: args.treeSha } },
        },
      });
      const response = await octokit.rest.git.getTree({
        owner: args.owner,
        repo: args.repo,
        tree_sha: args.treeSha,
      });
      return response.data.tree.map((entry) => entry.path);
    },
  };
}

/** A root commit with only the bootstrap file, for a branch that must exist before the starter. */
async function createPlaceholderCommit(args: {
  client: StarterSeedGitClient;
  owner: string;
  repo: string;
  path: string;
  message: string;
}): Promise<string> {
  const tree = await retryOperation({
    operation: "seed:createPlaceholderTree",
    run: async () =>
      await args.client.createTree({
        owner: args.owner,
        repo: args.repo,
        tree: [{ path: args.path, mode: "100644", type: "blob", content: "bootstrap\n" }],
      }),
  });
  const commit = await retryOperation({
    operation: "seed:createPlaceholderCommit",
    run: async () =>
      await args.client.createCommit({
        owner: args.owner,
        repo: args.repo,
        message: args.message,
        tree: tree.sha,
        parents: [],
      }),
  });
  return commit.sha;
}

export async function seedRepositoryWithStarter(args: {
  client: StarterSeedGitClient;
  owner: string;
  repo: string;
  defaultBranch: string;
  manifest: StarterTemplateManifest;
  /**
  Runs after the seeded branch exists with a commit that has no starter file and before the starter
  commit is pushed to it, with the starter commit's tree. The push of the starter is the push that
  the repository's workflows run on, so a caller that must change the repository before that first
  run (repository_actions makes the seeded branch the default) does it here, and a caller that must
  recognize the pushed starter later records the tree here.
  */
  beforeStarterPush?: (starter: { treeSha: string }) => Promise<void>;
}): Promise<{ defaultBranch: string; headCommitSha: string }> {
  const manifest = args.manifest;
  validateManifest(manifest);

  console.log("seed:start", {
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
    manifestVersion: manifest.version,
  });

  const createManifestTree = async (): Promise<{ sha: string }> => {
    const binaryFileShas = await createBinaryFileBlobs({
      client: args.client,
      owner: args.owner,
      repo: args.repo,
      binaryFiles: manifest.binaryFiles,
    });
    const treeEntries = buildTreeEntriesForManifest(
      manifest.files,
      binaryFileShas,
      manifest.fileModes,
    );

    return await retryOperation({
      operation: "seed:createTree",
      shouldRetry: (error) => isRetryableError(error) && !isEmptyRepositoryError(error),
      run: async () =>
        await args.client.createTree({
          owner: args.owner,
          repo: args.repo,
          tree: treeEntries,
        }),
    });
  };

  const bootstrapPath = SEED_BOOTSTRAP_PATH;
  const bootstrapMessage = "chore: bootstrap branch for starter seeding";
  const bootstrapContentBase64 = Buffer.from("bootstrap\n", "utf8").toString("base64");

  let tree: { sha: string };
  let seededFromEmptyRepository = false;
  let bootstrapCommitSha: string | null = null;

  try {
    tree = await createManifestTree();
  } catch (error) {
    if (!isEmptyRepositoryError(error)) {
      throw error;
    }

    seededFromEmptyRepository = true;

    console.warn("seed:bootstrap_needed", {
      repo: `${args.owner}/${args.repo}`,
      defaultBranch: args.defaultBranch,
      message: errorMessage(error),
    });

    const bootstrapCommit = await retryOperation({
      operation: "seed:bootstrapCommit",
      run: async () =>
        await args.client.createBootstrapCommit({
          owner: args.owner,
          repo: args.repo,
          branch: args.defaultBranch,
          message: bootstrapMessage,
          path: bootstrapPath,
          contentBase64: bootstrapContentBase64,
        }),
    });

    bootstrapCommitSha = bootstrapCommit.sha;

    tree = await retryOperation({
      operation: "seed:createManifestTreeAfterBootstrap",
      maxAttempts: 5,
      shouldRetry: isEmptyRepositoryError,
      run: createManifestTree,
    });
  }

  const commit = await retryOperation({
    operation: "seed:createCommit",
    run: async () =>
      await args.client.createCommit({
        owner: args.owner,
        repo: args.repo,
        message: manifest.commitMessage,
        tree: tree.sha,
        parents: [],
      }),
  });

  if (args.beforeStarterPush) {
    // The seeded branch first points at a commit without starter files, so creating it runs no
    // workflow. The bootstrap commit serves when it exists; it can sit on GitHub's default branch.
    const placeholderSha =
      bootstrapCommitSha ??
      (await createPlaceholderCommit({
        client: args.client,
        owner: args.owner,
        repo: args.repo,
        path: bootstrapPath,
        message: bootstrapMessage,
      }));
    try {
      await retryOperation({
        operation: "seed:createBranchBeforeStarter",
        shouldRetry: (error) => isRetryableError(error) && !isRefAlreadyExistsError(error),
        run: async () =>
          await args.client.createRef({
            owner: args.owner,
            repo: args.repo,
            ref: `refs/heads/${args.defaultBranch}`,
            sha: placeholderSha,
          }),
      });
    } catch (error) {
      if (!(getErrorStatus(error) === 422 && isRefAlreadyExistsError(error))) {
        throw error;
      }
    }
    await args.beforeStarterPush({ treeSha: tree.sha });
    await retryOperation({
      operation: "seed:pushStarter",
      run: async () =>
        await args.client.updateRef({
          owner: args.owner,
          repo: args.repo,
          ref: `heads/${args.defaultBranch}`,
          sha: commit.sha,
          force: true,
        }),
    });
  } else if (seededFromEmptyRepository) {
    await retryOperation({
      operation: "seed:updateRefAfterBootstrap",
      run: async () =>
        await args.client.updateRef({
          owner: args.owner,
          repo: args.repo,
          ref: `heads/${args.defaultBranch}`,
          sha: commit.sha,
          force: true,
        }),
    });
  } else {
    try {
      await retryOperation({
        operation: "seed:createRef",
        shouldRetry: (error) => isRetryableError(error) && !isRefAlreadyExistsError(error),
        run: async () =>
          await args.client.createRef({
            owner: args.owner,
            repo: args.repo,
            ref: `refs/heads/${args.defaultBranch}`,
            sha: commit.sha,
          }),
      });
    } catch (error) {
      if (!(getErrorStatus(error) === 422 && isRefAlreadyExistsError(error))) {
        throw error;
      }

      await retryOperation({
        operation: "seed:updateRef",
        run: async () =>
          await args.client.updateRef({
            owner: args.owner,
            repo: args.repo,
            ref: `heads/${args.defaultBranch}`,
            sha: commit.sha,
            force: true,
          }),
      });
    }
  }

  console.log("seed:success", {
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
    headCommitSha: commit.sha,
    manifestVersion: manifest.version,
  });

  return {
    defaultBranch: args.defaultBranch,
    headCommitSha: commit.sha,
  };
}
