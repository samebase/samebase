#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";

import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";

export type RepositoryExport = {
  sourceRoot: string;
  targetBranch: string;
  targetRepository: string;
};

export const baseTemplateSourceRoot = "templates/base";
export const alchemyTemplateSourceRoot = "templates/base-alchemy";

export const repositoryExports = [
  {
    sourceRoot: "packages/plugin",
    targetBranch: "main",
    targetRepository: "plugin",
  },
  {
    sourceRoot: baseTemplateSourceRoot,
    targetBranch: "main",
    targetRepository: "base",
  },
  {
    sourceRoot: alchemyTemplateSourceRoot,
    targetBranch: "main",
    targetRepository: "base-alchemy",
  },
] satisfies readonly RepositoryExport[];

export type RepositoryExportResult =
  | {
      status: "published";
      publishedCommit: string;
    }
  | {
      status: "unchanged";
    };

type PublishRepositoryExportOptions = {
  definition: RepositoryExport;
  gitEnvironment: NodeJS.ProcessEnv;
  repoRoot: string;
  sourceCommit: string;
  sourceRepository: string;
  targetRemoteUrl: string;
};

type ReadCurrentSourceBranchHeadOptions = {
  gitEnvironment: NodeJS.ProcessEnv;
  repoRoot: string;
  sourceBranch: string;
};

function gitOutput(
  repoRoot: string,
  args: readonly string[],
  gitEnvironment: NodeJS.ProcessEnv,
): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: gitEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`git ${args[0]} failed${detail ? `: ${detail}` : "."}`);
  }
  return result.stdout.trim();
}

function assertObjectId(objectId: string, label: string): void {
  if (!/^[0-9a-f]{40,64}$/.test(objectId)) {
    throw new Error(`${label} must be a full Git object ID.`);
  }
}

function assertRepositoryExport(definition: RepositoryExport): void {
  if (!/^[A-Za-z0-9._-]+$/.test(definition.targetRepository)) {
    throw new Error(`Invalid target repository name: ${definition.targetRepository}`);
  }
  if (
    !definition.sourceRoot ||
    definition.sourceRoot.startsWith("/") ||
    definition.sourceRoot.endsWith("/") ||
    definition.sourceRoot.includes("\\") ||
    definition.sourceRoot.includes(":") ||
    definition.sourceRoot.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid source root: ${definition.sourceRoot}`);
  }
}

function assertGitBranch(
  repoRoot: string,
  branch: string,
  gitEnvironment: NodeJS.ProcessEnv,
): void {
  gitOutput(repoRoot, ["check-ref-format", "--branch", branch], gitEnvironment);
}

function githubAuthenticationEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  token: string,
): NodeJS.ProcessEnv {
  if (!token) {
    throw new Error("GitHub authentication token must not be empty.");
  }

  const authorization = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return {
    ...baseEnvironment,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
    GIT_TERMINAL_PROMPT: "0",
  };
}

export function formatPublishedCommitSubject(
  sourceSubject: string,
  sourceRepository: string,
): string {
  if (!/^v\d+:/.test(sourceSubject)) {
    throw new Error(`Source commit subject has no build version: ${sourceSubject}`);
  }
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(sourceRepository)) {
    throw new Error(`Invalid source repository: ${sourceRepository}`);
  }
  return sourceSubject.replace(/ \(#(\d+)\)$/, ` (${sourceRepository}#$1)`);
}

export function readCurrentSourceBranchHead({
  gitEnvironment,
  repoRoot,
  sourceBranch,
}: ReadCurrentSourceBranchHeadOptions): string {
  assertGitBranch(repoRoot, sourceBranch, gitEnvironment);

  const sourceTrackingRef = "refs/remotes/repository-exports/source";
  gitOutput(
    repoRoot,
    ["fetch", "--no-tags", "--force", "origin", `+refs/heads/${sourceBranch}:${sourceTrackingRef}`],
    gitEnvironment,
  );
  const sourceHead = gitOutput(repoRoot, ["rev-parse", sourceTrackingRef], gitEnvironment);
  assertObjectId(sourceHead, "Current source branch head");
  return sourceHead;
}

function readTargetState(options: PublishRepositoryExportOptions): {
  commit: string;
  tree: string;
} {
  const { definition, gitEnvironment, repoRoot, targetRemoteUrl } = options;
  const targetTrackingRef = `refs/remotes/repository-exports/${definition.targetRepository}/${definition.targetBranch}`;

  gitOutput(
    repoRoot,
    [
      "fetch",
      "--no-tags",
      "--force",
      targetRemoteUrl,
      `+refs/heads/${definition.targetBranch}:${targetTrackingRef}`,
    ],
    gitEnvironment,
  );

  const commit = gitOutput(repoRoot, ["rev-parse", targetTrackingRef], gitEnvironment);
  const tree = gitOutput(repoRoot, ["rev-parse", `${commit}^{tree}`], gitEnvironment);
  assertObjectId(commit, "Target commit");
  assertObjectId(tree, "Target tree");
  return { commit, tree };
}

export function publishRepositoryExport(
  options: PublishRepositoryExportOptions,
): RepositoryExportResult {
  const { definition, gitEnvironment, repoRoot, sourceCommit, sourceRepository, targetRemoteUrl } =
    options;
  assertRepositoryExport(definition);
  assertObjectId(sourceCommit, "Source commit");
  assertGitBranch(repoRoot, definition.targetBranch, gitEnvironment);

  gitOutput(repoRoot, ["cat-file", "-e", `${sourceCommit}^{commit}`], gitEnvironment);
  const sourceTree = gitOutput(
    repoRoot,
    ["rev-parse", `${sourceCommit}:${definition.sourceRoot}`],
    gitEnvironment,
  );
  if (gitOutput(repoRoot, ["cat-file", "-t", sourceTree], gitEnvironment) !== "tree") {
    throw new Error(`Repository export source is not a directory: ${definition.sourceRoot}`);
  }

  const sourceSubject = gitOutput(
    repoRoot,
    ["show", "-s", "--format=%s", sourceCommit],
    gitEnvironment,
  );
  const publishedSubject = formatPublishedCommitSubject(sourceSubject, sourceRepository);

  const target = readTargetState(options);
  if (target.tree === sourceTree) {
    return {
      status: "unchanged",
    };
  }

  const commitEnvironment = {
    ...gitEnvironment,
    GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    GIT_AUTHOR_NAME: "github-actions[bot]",
    GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_NAME: "github-actions[bot]",
  };
  const publishedCommit = gitOutput(
    repoRoot,
    [
      "commit-tree",
      sourceTree,
      "-p",
      target.commit,
      "-m",
      publishedSubject,
      "-m",
      `Samebase-Source-Repository: ${sourceRepository}\nSamebase-Source-Commit: ${sourceCommit}\nSamebase-Source-Path: ${definition.sourceRoot}`,
    ],
    commitEnvironment,
  );

  gitOutput(
    repoRoot,
    [
      "push",
      `--force-with-lease=refs/heads/${definition.targetBranch}:${target.commit}`,
      targetRemoteUrl,
      `${publishedCommit}:refs/heads/${definition.targetBranch}`,
    ],
    gitEnvironment,
  );
  return {
    status: "published",
    publishedCommit,
  };
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment value: ${name}`);
  }
  return value;
}

function writeTargetRepositoriesOutput(): void {
  const outputPath = requiredEnvironmentValue("GITHUB_OUTPUT");
  for (const definition of repositoryExports) {
    assertRepositoryExport(definition);
  }
  const targetRepositories = repositoryExports
    .map((definition) => definition.targetRepository)
    .join(",");
  appendFileSync(outputPath, `repositories=${targetRepositories}\n`, "utf8");
}

/**
GitHub refuses a publisher token scoped to a repository that does not exist without naming that
repository. A metadata-only lookup token reads each target first, so a missing target fails with its
name before the publisher token is requested.
*/
export async function findMissingTargetRepositories(args: {
  owner: string;
  lookupToken: string;
}): Promise<string[]> {
  const missingRepositories: string[] = [];
  for (const definition of repositoryExports) {
    const repository = `${args.owner}/${definition.targetRepository}`;
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${args.lookupToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status === 404) {
      missingRepositories.push(repository);
    } else if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for the export target ${repository}.`);
    }
  }
  return missingRepositories;
}

async function checkTargetRepositories(): Promise<void> {
  const missingRepositories = await findMissingTargetRepositories({
    owner: requiredEnvironmentValue("TARGET_REPOSITORY_OWNER"),
    lookupToken: requiredEnvironmentValue("REPOSITORY_EXPORTS_LOOKUP_TOKEN"),
  });
  if (missingRepositories.length > 0) {
    throw new Error(
      `These repository export targets do not exist, or the publisher GitHub App cannot access them: ${missingRepositories.join(", ")}. Create each one with its target branch, then rerun this job. Until then, no export publishes.`,
    );
  }
  console.log("Every repository export target exists.");
}

function publishConfiguredRepositoryExports(): void {
  const repoRoot = resolveRepoRoot();
  const sourceCommit = requiredEnvironmentValue("SOURCE_COMMIT");
  assertObjectId(sourceCommit, "Source commit");
  const sourceRepository = requiredEnvironmentValue("SOURCE_REPOSITORY");
  const sourceToken = requiredEnvironmentValue("REPOSITORY_EXPORTS_SOURCE_TOKEN");
  const targetOwner = requiredEnvironmentValue("TARGET_REPOSITORY_OWNER");
  const targetToken = requiredEnvironmentValue("REPOSITORY_EXPORTS_TARGET_TOKEN");
  const sourceEnvironment = githubAuthenticationEnvironment(process.env, sourceToken);
  const targetEnvironment = githubAuthenticationEnvironment(process.env, targetToken);

  const currentSourceHead = readCurrentSourceBranchHead({
    gitEnvironment: sourceEnvironment,
    repoRoot,
    sourceBranch: "main",
  });
  if (currentSourceHead !== sourceCommit) {
    console.log(
      `Skip repository exports because ${sourceCommit} is not the current main commit ${currentSourceHead}.`,
    );
    return;
  }

  for (const definition of repositoryExports) {
    const result = publishRepositoryExport({
      definition,
      gitEnvironment: targetEnvironment,
      repoRoot,
      sourceCommit,
      sourceRepository,
      targetRemoteUrl: `https://github.com/${targetOwner}/${definition.targetRepository}.git`,
    });

    if (result.status === "published") {
      console.log(
        `Published ${definition.sourceRoot} to ${targetOwner}/${definition.targetRepository}@${result.publishedCommit}.`,
      );
    } else {
      console.log(
        `${targetOwner}/${definition.targetRepository} already matches ${definition.sourceRoot}.`,
      );
    }
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(async () => {
    const [command, ...extraArguments] = process.argv.slice(2);
    if (extraArguments.length > 0) {
      throw new Error(`Unexpected repository export arguments: ${extraArguments.join(" ")}`);
    }
    if (command === "--write-target-repositories-output") {
      writeTargetRepositoriesOutput();
      return;
    }
    if (command === "--check-target-repositories") {
      await checkTargetRepositories();
      return;
    }
    if (command) {
      throw new Error(`Unknown repository export command: ${command}`);
    }
    publishConfiguredRepositoryExports();
  });
}
