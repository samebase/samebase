import { Octokit } from "@octokit/rest";

import type { ProviderApiCallRecorder } from "./providerApiLog";

export async function fetchGitHubRepoIdentity(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<{ ownerId: string }> {
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
  if (repoId !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the vault repo.");
  }
  return { ownerId };
}
