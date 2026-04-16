"use node";

import { Octokit } from "@octokit/rest";
import {
  starterTemplateManifest,
  type StarterTemplateManifest,
} from "./starterSeedManifest.generated";

export type { StarterTemplateManifest } from "./starterSeedManifest.generated";

export type SeedTemplateManifest = Pick<
  StarterTemplateManifest,
  "version" | "commitMessage" | "files"
> & {
  source?: StarterTemplateManifest["source"];
};

type StarterTemplateTreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  content: string;
};

export type StarterSeedGitClient = {
  createTree(args: {
    owner: string;
    repo: string;
    tree: StarterTemplateTreeEntry[];
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

function validateManifest(manifest: SeedTemplateManifest): void {
  if (manifest.version.length === 0) {
    throw new Error("starter template manifest version is required");
  }

  if (manifest.commitMessage.length === 0) {
    throw new Error("starter template manifest commitMessage is required");
  }

  // Agent-template seeding still uses this helper but doesn't carry starter
  // source pin metadata, so only validate source when a manifest provides it.
  if (manifest.source !== undefined) {
    if (manifest.source.repository.length === 0) {
      throw new Error(
        "starter template manifest source repository is required",
      );
    }

    if (manifest.source.commitSha.length === 0) {
      throw new Error(
        "starter template manifest source commit sha is required",
      );
    }
  }

  if (Object.keys(manifest.files).length === 0) {
    throw new Error("starter template manifest has no files");
  }
}

export function buildTreeEntriesForManifest(
  files: Record<string, string>,
): StarterTemplateTreeEntry[] {
  return Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => ({
      path: filePath,
      mode: "100644",
      type: "blob",
      content,
    }));
}

export async function seedRepositoryWithStarter(args: {
  client: StarterSeedGitClient;
  owner: string;
  repo: string;
  defaultBranch: string;
  manifest?: SeedTemplateManifest;
}): Promise<{ defaultBranch: string; headCommitSha: string }> {
  const manifest = args.manifest ?? starterTemplateManifest;
  validateManifest(manifest);

  const manifestSource =
    manifest.source === undefined
      ? "embedded"
      : `${manifest.source.repository}@${manifest.source.commitSha}`;

  console.log("seed:start", {
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
    manifestVersion: manifest.version,
    manifestSource,
  });

  const treeEntries = buildTreeEntriesForManifest(manifest.files);

  const createManifestTree = async (): Promise<{ sha: string }> =>
    await retryOperation({
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
    manifestSource,
  });

  return {
    defaultBranch: args.defaultBranch,
    headCommitSha: commit.sha,
  };
}
