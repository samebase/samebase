# Noter PR Preview Cleanup

Use this during `clean` for a shipped branch, after `clean vaults` and before
deleting the remote branch. This is a Codex/operator workflow, not a repo
script.

The scope is only preview resources created for the `noter.md` app build:

- Cloudflare Worker preview versions, when they can be proven
- the Convex preview deployment for the merged branch

Do not change Cloudflare deploy behavior, add preview tags, add cleanup scripts,
or touch temporary Noter-managed vault infrastructure as part of this workflow.

## Safety Rules

1. Continue only after the branch's GitHub PR is merged.
2. Delete nothing from Cloudflare unless each exact Worker version is tied to
   the merged branch or PR by provider or GitHub metadata.
3. Delete no active Cloudflare Worker version and never delete the Worker
   itself.
4. Delete no Convex deployment unless it is a `preview` deployment for the exact
   branch.
5. If metadata is missing, ambiguous, or credentials are unavailable, skip that
   provider and report the skip.

## 1. Confirm The Merged PR

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"
gh pr view --head "$branch" --json number,url,state,mergedAt,headRefName,headRefOid
```

If the local branch is already gone and the cleanup is being run by PR number,
start from the PR instead:

```bash
pr_number="<merged-pr-number>"
gh pr view "$pr_number" --json number,url,state,mergedAt,headRefName,headRefOid
branch="<headRefName from the PR JSON>"
```

Continue only when `headRefName` equals `$branch` and `mergedAt` is not `null`.
Keep the PR number, URL, branch, and head SHA visible while inspecting provider
resources.

## 2. Inspect Cloudflare Worker Previews

List recent Worker versions and active deployments:

```bash
CLOUDFLARE_API_TOKEN="$DEV_SEED_CLOUDFLARE_API_KEY" pnpm --dir apps/noter exec wrangler versions list --name "$CLOUDFLARE_WORKER_NAME" --json
CLOUDFLARE_API_TOKEN="$DEV_SEED_CLOUDFLARE_API_KEY" pnpm --dir apps/noter exec wrangler deployments list --name "$CLOUDFLARE_WORKER_NAME" --json
```

Also inspect GitHub checks and PR comments for Cloudflare preview metadata:

```bash
pr_number="<merged-pr-number>"
gh pr checks "$pr_number"
gh pr view "$pr_number" --json comments,statusCheckRollup
```

Cloudflare may create multiple preview Worker versions for the same branch.
Treat each matching inactive version as its own candidate. In current Workers
preview metadata, branch previews can appear as `workers/alias` with slashes
replaced by dashes, such as `codex-logo-striped-face` for
`codex/logo-striped-face`.

Delete Cloudflare Worker versions only when all of these are true for each
version:

1. the exact version ID is known
2. the version alias, version metadata, preview URL, or GitHub metadata is tied
   to the merged PR, branch, or head SHA
3. the version ID is not present in the active deployments output

If Wrangler output is not enough, inspect the Worker versions API before
deciding:

```bash
curl --fail-with-body --request GET \
  --url "https://api.cloudflare.com/client/v4/accounts/$DEV_SEED_CLOUDFLARE_ACCOUNT_ID/workers/workers/$CLOUDFLARE_WORKER_NAME/versions" \
  --header "Authorization: Bearer $DEV_SEED_CLOUDFLARE_API_KEY"
```

Follow pagination if the response is paginated.

Delete only proven inactive versions:

```bash
version_id="<matching-worker-version-id>"
curl --fail-with-body --request DELETE \
  --url "https://api.cloudflare.com/client/v4/accounts/$DEV_SEED_CLOUDFLARE_ACCOUNT_ID/workers/workers/$CLOUDFLARE_WORKER_NAME/versions/$version_id" \
  --header "Authorization: Bearer $DEV_SEED_CLOUDFLARE_API_KEY"
```

If there is no exact version match, leave Cloudflare alone.

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
2. the deployment reference is `preview/<branch>` or equivalent metadata names
   the exact branch
3. the deployment belongs to the `noter` project resolved above

Delete only the matching preview deployment:

```bash
deployment_name="<matching-convex-preview-deployment-name>"
curl --fail-with-body --request POST \
  --url "https://api.convex.dev/v1/deployments/$deployment_name/delete" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

Never delete a `prod`, `dev`, or local Convex deployment during Noter PR preview
cleanup.

## 4. Report The Result

In the final `clean` response, include:

- the merged PR URL
- any Cloudflare Worker version IDs deleted, or why Cloudflare was skipped
- any Convex deployment name deleted, or why Convex was skipped
- the remaining local cleanup actions
