# Noter PR Preview Cleanup

Use this during `clean` for a branch whose PR is merged or closed, after `clean vaults` and before
deleting the remote branch. This is a Codex/operator workflow, not a repo script.

Any GitHub PR for the branch, including a draft PR, is enough evidence that Noter preview resources
exist. Treat both the Cloudflare Worker preview and the Convex preview deployment as mandatory
cleanup targets once the PR is terminal. Missing local environment files or inherited credentials do
not change that assumption; they only block cleanup until the credentials are available.

The scope is only preview resources created for the `noter.md` app build:

- Cloudflare Worker preview versions, when they can be proven
- the Convex preview deployment for the exact branch

Do not change Cloudflare deploy behavior, add preview tags, add cleanup scripts, or touch temporary
Noter-managed vault infrastructure as part of this workflow.

## Safety Rules

1. Continue only after the branch's GitHub PR is no longer open: `state` is `MERGED` or `CLOSED`.
2. Delete nothing from Cloudflare unless each exact Worker version is tied to the branch or PR by
   provider or GitHub metadata.
3. Delete no active Cloudflare Worker version and never delete the Worker itself.
4. Delete no Convex deployment unless it is a `preview` deployment for the exact branch.
5. Load cleanup credentials from the repo seed env before using inherited shell values. Missing
   values in the inherited shell environment alone are not a reason to stop.
6. If the repo seed env is missing or incomplete, locate the correct cleanup credentials from the
   primary checkout, the operator-provided environment, or the configured secret source before
   continuing. Do not treat missing local env as evidence that previews do not exist.
7. If credentials or resource identity still cannot be resolved, stop with `clean` blocked. Do not
   delete the local branch, remote branch, or checkout-local machine state while Cloudflare or
   Convex preview cleanup is incomplete.

## 0. Load Cleanup Credentials

Run cleanup commands from the repo root. The cleanup credentials normally live in
`apps/noter/.env.anon-seed.local`, not in the inherited shell environment. Load that file before
checking Cloudflare or Convex, and do not print the values:

```bash
test -f apps/noter/.env.anon-seed.local
set -a
. apps/noter/.env.anon-seed.local
set +a
export CLOUDFLARE_WORKER_NAME="${CLOUDFLARE_WORKER_NAME:-noter-worker}"

: "${DEV_SEED_CLOUDFLARE_ACCOUNT_ID:?missing DEV_SEED_CLOUDFLARE_ACCOUNT_ID}"
: "${DEV_SEED_CLOUDFLARE_API_KEY:?missing DEV_SEED_CLOUDFLARE_API_KEY}"
: "${DEV_SEED_CONVEX_MANAGEMENT_API_KEY:?missing DEV_SEED_CONVEX_MANAGEMENT_API_KEY}"
: "${DEV_SEED_CONVEX_TEAM_ID:?missing DEV_SEED_CONVEX_TEAM_ID}"
```

If this preflight fails because the file or a value is missing, cleanup is blocked until the correct
credentials are available from another trusted source. Do not skip Cloudflare or Convex preview
cleanup for a branch that has a PR.

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
number, URL, state, branch, and head SHA visible while inspecting provider resources.

## 2. Inspect Cloudflare Worker Previews

List recent Worker versions and active deployments:

```bash
CLOUDFLARE_API_TOKEN="$DEV_SEED_CLOUDFLARE_API_KEY" pnpm --dir apps/noter exec wrangler versions list --name "$CLOUDFLARE_WORKER_NAME" --json
CLOUDFLARE_API_TOKEN="$DEV_SEED_CLOUDFLARE_API_KEY" pnpm --dir apps/noter exec wrangler deployments list --name "$CLOUDFLARE_WORKER_NAME" --json
```

Also inspect GitHub checks and PR comments for Cloudflare preview metadata:

```bash
pr_number="<pr-number>"
gh pr checks "$pr_number"
gh pr view "$pr_number" --json comments,statusCheckRollup
```

Cloudflare may create multiple preview Worker versions for the same branch. Treat each matching
inactive version as its own candidate. In current Workers preview metadata, branch previews can
appear as `workers/alias` with slashes replaced by dashes, such as `codex-logo-striped-face` for
`codex/logo-striped-face`.

Delete Cloudflare Worker versions only when all of these are true for each version:

1. the exact version ID is known
2. the version alias, version metadata, preview URL, or GitHub metadata is tied to the PR, branch,
   or head SHA
3. the version ID is not present in the active deployments output

If Wrangler output is not enough, or the matching branch is absent from the Wrangler list, inspect
the paginated Worker versions API before deciding which version to delete:

```bash
curl --fail-with-body --request GET \
  --url "https://api.cloudflare.com/client/v4/accounts/$DEV_SEED_CLOUDFLARE_ACCOUNT_ID/workers/workers/$CLOUDFLARE_WORKER_NAME/versions?per_page=100" \
  --header "Authorization: Bearer $DEV_SEED_CLOUDFLARE_API_KEY"
```

Follow pagination until every Worker version has been inspected.

Delete only proven inactive versions:

```bash
version_id="<matching-worker-version-id>"
curl --fail-with-body --request DELETE \
  --url "https://api.cloudflare.com/client/v4/accounts/$DEV_SEED_CLOUDFLARE_ACCOUNT_ID/workers/workers/$CLOUDFLARE_WORKER_NAME/versions/$version_id" \
  --header "Authorization: Bearer $DEV_SEED_CLOUDFLARE_API_KEY"
```

If there is still no exact version match, stop with `clean` blocked and report the lookup evidence.
Do not treat a missing first-pass match as permission to skip Cloudflare preview cleanup.

## 3. Inspect Convex Preview Deployments

Resolve the `noter` project:

```bash
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/teams/$DEV_SEED_CONVEX_TEAM_ID/projects/noter" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

Use the returned project ID to list deployments:

```bash
project_id="<noter-project-id>"
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/projects/$project_id/list_deployments" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

Delete a Convex deployment only when all of these are true:

1. `deploymentType` is `preview`
2. the deployment reference is `preview/<branch>` or equivalent metadata names the exact branch
3. the deployment belongs to the `noter` project resolved above

Delete only the matching preview deployment:

```bash
deployment_name="<matching-convex-preview-deployment-name>"
curl --fail-with-body --request POST \
  --url "https://api.convex.dev/v1/deployments/$deployment_name/delete" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

Never delete a `prod`, `dev`, or local Convex deployment during Noter PR preview cleanup. If the
preview deployment for the exact branch cannot be identified, stop with `clean` blocked and report
the lookup evidence.

## 4. Report The Result

In the final `clean` response, include:

- the PR URL and terminal state
- any Cloudflare Worker version IDs deleted, or the blocker that prevented deletion
- any Convex deployment name deleted, or the blocker that prevented deletion
- the remaining local cleanup actions, only after provider preview cleanup completed
