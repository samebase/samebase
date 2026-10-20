# Samebase PR Preview Cleanup

Use this during `clean` for a branch whose PR is merged or closed, after `clean repositories` and
before deleting the remote branch. This is a Codex/operator workflow, not a repo script.

`.github/workflows/preview-cleanup.yml` deletes the branch's Convex preview deployment when its PR
closes and notes the delete in the preview comment on the PR. This runbook confirms that delete, and
performs it by hand when the workflow did not run: a PR closed while it had a merge conflict, a head
commit whose message skips CI, or a missing `CONVEX_PREVIEW_DEPLOY_KEY` secret.

Any GitHub PR for the branch, including a draft PR, is enough evidence that a Convex preview
deployment existed. Missing local environment files or inherited credentials do not change that
assumption; they only block cleanup until the credentials are available.

The scope is only the Convex preview deployment for the exact branch. Do not change deploy behavior,
add cleanup scripts, or touch temporary Samebase-managed repository infrastructure as part of this
workflow.

## Safety Rules

1. Continue only after the branch's GitHub PR is no longer open: `state` is `MERGED` or `CLOSED`.
2. Delete no Convex deployment unless it is a `preview` deployment for the exact branch.
3. Load cleanup credentials from the repo seed env before using inherited shell values. Missing
   values in the inherited shell environment alone are not a reason to stop.
4. If the repo seed env is missing or incomplete, locate the correct cleanup credentials from the
   primary checkout, the operator-provided environment, or the configured secret source before
   continuing. Do not treat missing local env as evidence that the preview does not exist.
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
number, URL, state, branch, and head SHA visible while inspecting the deployments.

## 2. Check The Cleanup Workflow

```bash
gh run list --workflow preview-cleanup.yml --branch "$branch" --json status,conclusion,url,createdAt
```

A run with conclusion `success` after the PR closed deleted the preview, and the preview comment on
the PR ends with "Preview deleted when the pull request closed." Confirm it in the next section
anyway, and delete by hand only when a preview for the branch remains.

## 3. Inspect Convex Preview Deployments

Resolve the `samebase` project:

```bash
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/teams/$DEV_SEED_SAMEBASE_CONVEX_TEAM_ID/projects/samebase" \
  --header "Authorization: Bearer $DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY"
```

Use the returned project ID to list deployments:

```bash
project_id="<samebase-project-id>"
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/projects/$project_id/list_deployments" \
  --header "Authorization: Bearer $DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY"
```

Delete a Convex deployment only when all of these are true:

1. `deploymentType` is `preview`
2. `previewIdentifier` is the exact branch name
3. the deployment belongs to the `samebase` project resolved above

Delete only the matching preview deployment:

```bash
deployment_name="<matching-convex-preview-deployment-name>"
curl --fail-with-body --request POST \
  --url "https://api.convex.dev/v1/deployments/$deployment_name/delete" \
  --header "Authorization: Bearer $DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY"
```

Never delete a `prod`, `dev`, or local Convex deployment during Samebase PR preview cleanup. If a
listed preview for the exact branch cannot be identified with certainty, stop with `clean` blocked
and report the lookup evidence.

## 4. Report The Result

In the final `clean` response, include:

- the PR URL and terminal state
- the Convex deployment name deleted, by the workflow or by hand, or the blocker that prevented
  deletion
- the remaining local cleanup actions, only after the preview cleanup completed
