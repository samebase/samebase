import { Octokit } from "@octokit/rest";

import type { ProviderApiCallRecorder } from "./providerApiLog";

const GITHUB_REQUEST_DEADLINE_MS = 15_000;

export function createGitHubRequestDeadlineSignal(): AbortSignal {
  return AbortSignal.timeout(GITHUB_REQUEST_DEADLINE_MS);
}

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
