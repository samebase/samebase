"use node";

import { Octokit } from "@octokit/rest";
import {
  starterTemplateManifest,
  type StarterTemplateManifest,
} from "./starterSeedManifest.generated";

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
  createRef(args: {
    owner: string;
    repo: string;
    ref: string;
    sha: string;
  }): Promise<void>;
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

const RETRYABLE_STATUSES = new Set([409, 422]);

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = Reflect.get(error, "status");
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

export function createStarterSeedGitClient(
  octokit: Octokit,
): StarterSeedGitClient {
  return {
    createTree: async (args) => {
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
      await octokit.rest.git.createRef({
        owner: args.owner,
        repo: args.repo,
        ref: args.ref,
        sha: args.sha,
      });
    },
    updateRef: async (args) => {
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
        const response = await octokit.rest.repos.createOrUpdateFileContents({
          owner: args.owner,
          repo: args.repo,
          branch: args.branch,
          path: args.path,
          message: args.message,
          content: args.contentBase64,
        });
        return {
          sha: readRequiredCommitSha(
            response.data.commit.sha,
            "seed:bootstrapCommit",
          ),
        };
      } catch (error) {
        if (!isMissingBranchError(error)) {
          throw error;
        }
      }

      const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        message: args.message,
        content: args.contentBase64,
      });
      return {
        sha: readRequiredCommitSha(
          response.data.commit.sha,
          "seed:bootstrapCommit",
        ),
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
  const fileCount =
    Object.keys(manifest.files).length + Object.keys(binaryFiles).length;
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

  const manifestPaths = new Set([
    ...Object.keys(manifest.files),
    ...Object.keys(binaryFiles),
  ]);
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
  const entries: StarterTemplateTreeEntry[] = Object.entries(files).map(
    ([filePath, content]) => ({
      path: filePath,
      mode: resolveMode(filePath),
      type: "blob",
      content,
    }),
  );

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
      shouldRetry: (error) =>
        isRetryableError(error) && !isEmptyRepositoryError(error),
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

export async function seedRepositoryWithStarter(args: {
  client: StarterSeedGitClient;
  owner: string;
  repo: string;
  defaultBranch: string;
  manifest?: StarterTemplateManifest;
}): Promise<{ defaultBranch: string; headCommitSha: string }> {
  const manifest = args.manifest ?? starterTemplateManifest;
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
      shouldRetry: (error) =>
        isRetryableError(error) && !isEmptyRepositoryError(error),
      run: async () =>
        await args.client.createTree({
          owner: args.owner,
          repo: args.repo,
          tree: treeEntries,
        }),
    });
  };

  const bootstrapPath = ".noter-seed-bootstrap";
  const bootstrapMessage = "chore: bootstrap branch for starter seeding";
  const bootstrapContentBase64 = Buffer.from("bootstrap\n", "utf8").toString(
    "base64",
  );

  let tree: { sha: string };
  let seededFromEmptyRepository = false;

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

    await retryOperation({
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

    tree = await createManifestTree();
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

  if (seededFromEmptyRepository) {
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
        shouldRetry: (error) =>
          isRetryableError(error) && !isRefAlreadyExistsError(error),
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
