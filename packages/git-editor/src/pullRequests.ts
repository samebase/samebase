import type { Octokit } from "@octokit/rest";

type OpenPullRequestCandidate = {
  number: number;
  html_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  base: {
    ref?: string | null;
  };
  head: {
    ref: string;
    repo?: {
      full_name?: string | null;
    } | null;
  };
};

function readPullRequestActivityAt(pullRequest: OpenPullRequestCandidate): number {
  const updatedAt = Date.parse(pullRequest.updated_at ?? "");
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }

  const createdAt = Date.parse(pullRequest.created_at ?? "");
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

export function readOpenPullRequestForBranch(args: {
  branch: string;
  githubRepositoryFullName: string;
  pullRequests: OpenPullRequestCandidate[];
  baseBranch?: string;
}): { url: string; number: number; baseBranch: string } | null {
  const normalizedRepositoryFullName = args.githubRepositoryFullName.toLowerCase();
  let latestMatch: {
    url: string;
    number: number;
    baseBranch: string;
    activityAt: number;
  } | null = null;

  for (const pullRequest of args.pullRequests) {
    const pullRequestRepositoryFullName = pullRequest.head.repo?.full_name;
    if (
      pullRequest.head.ref !== args.branch ||
      (typeof args.baseBranch === "string" && pullRequest.base.ref !== args.baseBranch) ||
      typeof pullRequestRepositoryFullName !== "string" ||
      pullRequestRepositoryFullName.toLowerCase() !== normalizedRepositoryFullName ||
      typeof pullRequest.base.ref !== "string" ||
      pullRequest.base.ref.length === 0 ||
      typeof pullRequest.html_url !== "string" ||
      pullRequest.html_url.length === 0
    ) {
      continue;
    }

    const activityAt = readPullRequestActivityAt(pullRequest);
    if (
      !latestMatch ||
      activityAt > latestMatch.activityAt ||
      (activityAt === latestMatch.activityAt && pullRequest.number > latestMatch.number)
    ) {
      latestMatch = {
        url: pullRequest.html_url,
        number: pullRequest.number,
        baseBranch: pullRequest.base.ref,
        activityAt,
      };
    }
  }

  return latestMatch
    ? {
        url: latestMatch.url,
        number: latestMatch.number,
        baseBranch: latestMatch.baseBranch,
      }
    : null;
}

export async function getOpenPullRequestForBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  signal?: AbortSignal;
}) {
  const response = await args.octokit.rest.pulls.list({
    owner: args.owner,
    repo: args.repo,
    state: "open",
    head: `${args.owner}:${args.branch}`,
    sort: "updated",
    direction: "desc",
    per_page: 100,
    request: { signal: args.signal },
  });
  return readOpenPullRequestForBranch({
    branch: args.branch,
    baseBranch: args.baseBranch,
    githubRepositoryFullName: `${args.owner}/${args.repo}`,
    pullRequests: response.data,
  });
}

export async function compareBranches(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  baseBranch: string;
  branch: string;
  signal?: AbortSignal;
}) {
  const response = await args.octokit.rest.repos.compareCommitsWithBasehead({
    owner: args.owner,
    repo: args.repo,
    basehead: `${args.baseBranch}...${args.branch}`,
    request: { signal: args.signal },
  });
  return response.data;
}

export async function createDraftPullRequestForBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
}) {
  const branchRef = await args.octokit.rest.git.getRef({
    owner: args.owner,
    repo: args.repo,
    ref: `heads/${args.branch}`,
  });
  const commit = await args.octokit.rest.git.getCommit({
    owner: args.owner,
    repo: args.repo,
    commit_sha: branchRef.data.object.sha,
  });
  const response = await args.octokit.rest.pulls.create({
    owner: args.owner,
    repo: args.repo,
    title: buildDraftPullRequestTitle({
      branch: args.branch,
      commitMessage: commit.data.message,
    }),
    head: args.branch,
    base: args.baseBranch,
    draft: true,
  });
  return response.data;
}

export function buildDraftPullRequestTitle(args: {
  branch: string;
  commitMessage: string | null;
}): string {
  const commitSubject = args.commitMessage?.split("\n")[0]?.trim();
  if (typeof commitSubject === "string" && commitSubject.length > 0) {
    return commitSubject;
  }

  return `Update ${args.branch}`;
}

export async function getPullRequestCompareFiles(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullRequestNumber: number;
}) {
  const files: Awaited<ReturnType<Octokit["rest"]["pulls"]["listFiles"]>>["data"] = [];

  for (let page = 1; page <= 50; page += 1) {
    const response = await args.octokit.rest.pulls.listFiles({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullRequestNumber,
      per_page: 100,
      page,
    });
    files.push(...response.data);

    if (response.data.length < 100) {
      break;
    }
  }

  return files;
}
