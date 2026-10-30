# Samebase PR Preview Cleanup

Use this during `clean` for a branch whose PR is merged or closed, after `clean repositories` and
before deleting the remote branch. This is a Codex/operator workflow, not a repo script.

A pull request deploys the Alchemy stage `pr-<number>` of `alchemy.run.ts` at the repository root: a
Convex preview deployment whose preview name is `pr-<number>`, and the state of that stage in the
`alchemy-state-store` project of the Convex team `nicu`. When the PR closes, the `Destroy the preview` job
of `.github/workflows/alchemy.yml` runs `alchemy destroy --stage pr-<number>`, which deletes the
preview deployment and the state of the stage. This runbook confirms that destroy, and runs it by
hand when the job did not run or failed: a PR closed while it had a merge conflict, or a head commit
whose message skips CI.

Any GitHub PR for the branch, including a draft PR, is enough evidence that a Convex preview
deployment existed. Missing local environment files or inherited credentials do not change that
assumption; they only block cleanup until the credentials are available.

The scope is only the Convex preview deployment of the PR and the state of its stage. Do not change
deploy behavior, add cleanup scripts, or touch temporary Samebase-managed repository infrastructure
as part of this workflow.

## Safety Rules

1. Continue only after the branch's GitHub PR is no longer open: `state` is `MERGED` or `CLOSED`.
2. Delete no Convex deployment unless it is a `preview` deployment whose preview name is
   `pr-<number>` of this PR. A PR deployed before `alchemy.yml` existed has a preview named after
   its exact branch instead.
3. Run `alchemy destroy` only with `--stage pr-<number>` of this PR. Never with `--stage prod`: that
   stage holds the production deployment of samebase.com.
4. Load cleanup credentials from the repo seed env before using inherited shell values. Missing
   values in the inherited shell environment alone are not a reason to stop.
5. If credentials or resource identity still cannot be resolved, stop with `clean` blocked. Do not
   delete the local branch, remote branch, or worktree while Convex preview cleanup is incomplete.

## 0. Load Cleanup Credentials

Run cleanup commands from the repo root. The cleanup credentials normally live in
`apps/samebase/.env.anon-seed.local`, not in the inherited shell environment. Load that file before
checking Convex, and do not print the values:

```bash
test -f apps/samebase/.env.anon-seed.local
set -a
. apps/samebase/.env.anon-seed.local
set +a

: "${DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY:?missing DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY}"
: "${DEV_SEED_SAMEBASE_CONVEX_TEAM_ID:?missing DEV_SEED_SAMEBASE_CONVEX_TEAM_ID}"
```

The destroy by hand in section 4 also needs the Convex CLI login (`npx convex login`) of a member of
the team `nicu`, or a team access token in `CONVEX_ACCESS_TOKEN`.

If this preflight fails because the file or a value is missing, cleanup is blocked until the correct
credentials are available from another trusted source. Do not skip Convex preview cleanup for a
branch that has a PR.

## 1. Confirm The PR Is Terminal

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"
gh pr view --head "$branch" --json number,url,state,mergedAt,headRefName,headRefOid
```

If the local branch is already gone and the cleanup is being run by PR number, start from the PR
instead:

```bash
pr_number="<pr-number>"
gh pr view "$pr_number" --json number,url,state,mergedAt,headRefName,headRefOid
branch="<headRefName from the PR JSON>"
```

Continue only when `headRefName` equals `$branch` and `state` is `MERGED` or `CLOSED`. Keep the PR
number, URL, state, branch, and head SHA visible while inspecting the deployments, and set
`stage="pr-<number>"`.

## 2. Check The Destroy Job

```bash
gh run list --workflow alchemy.yml --branch "$branch" --limit 5 --json databaseId,conclusion,url,createdAt
gh run view <databaseId of the run created after the close> --json jobs --jq '.jobs[] | {name, conclusion}'
```

A run created after the PR closed whose `Destroy the preview` job concluded `success` deleted the
preview and the state of the stage. Confirm it in the next section anyway, and destroy by hand only
when a preview of the PR remains.

## 3. Inspect Convex Preview Deployments

Resolve the `alchemy-state-store` project:

```bash
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/teams/$DEV_SEED_SAMEBASE_CONVEX_TEAM_ID/projects/alchemy-state-store" \
  --header "Authorization: Bearer $DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY"
```

Use the returned project ID to list deployments:

```bash
project_id="<samebase-project-id>"
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/projects/$project_id/list_deployments" \
  --header "Authorization: Bearer $DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY"
```

A deployment of the PR is one where all of these are true:

1. `deploymentType` is `preview`
2. `previewIdentifier` is `$stage`, or the exact branch name for a PR deployed before `alchemy.yml`
3. the deployment belongs to the `alchemy-state-store` project resolved above

## 4. Destroy By Hand

For a preview named `$stage`, run the destroy of its stage from the root of a checkout of `main`. It
deletes the preview deployment and the state of the stage, so the repository pages of Samebase no
longer list the stage:

```bash
pnpm exec alchemy destroy --stage "$stage" --yes --no-input
```

For a preview that the stage state does not hold, such as one named after the branch, delete only
the matching deployment:

```bash
deployment_name="<matching-convex-preview-deployment-name>"
curl --fail-with-body --request POST \
  --url "https://api.convex.dev/v1/deployments/$deployment_name/delete" \
  --header "Authorization: Bearer $DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY"
```

Never delete a `prod`, `dev`, or local Convex deployment during Samebase PR preview cleanup. If a
listed preview of the PR cannot be identified with certainty, stop with `clean` blocked and report
the lookup evidence.

## 5. Report The Result

In the final `clean` response, include:

- the PR URL and terminal state
- the Convex deployment name deleted, by the workflow or by hand, or the blocker that prevented
  deletion
- the remaining local cleanup actions, only after the preview cleanup completed
