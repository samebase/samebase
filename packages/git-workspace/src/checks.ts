import type { Octokit } from "@octokit/rest";

/** Read GitHub's first page of checks and statuses. */
export async function readCommitChecks(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref: string;
}) {
  const [checks, statuses] = await Promise.all([
    args.octokit.checks.listForRef({
      owner: args.owner,
      repo: args.repo,
      ref: args.ref,
    }),
    args.octokit.repos.getCombinedStatusForRef({
      owner: args.owner,
      repo: args.repo,
      ref: args.ref,
    }),
  ]);
  return { check_runs: checks.data.check_runs, statuses: statuses.data.statuses };
}
