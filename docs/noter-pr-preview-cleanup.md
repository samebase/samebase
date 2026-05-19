# Noter PR Preview Cleanup

Use this during `clean` after the branch PR is merged and before deleting the
remote branch. This removes Noter app preview resources for `noter.md` itself:
the Cloudflare Worker preview version and the Convex preview deployment created
by the branch build.

Do not use this for temporary Noter-managed vaults. Run `clean vaults`
separately for those.

## Required Inputs

- Current branch name
- `CLOUDFLARE_WORKER_NAME`
- `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`
- `DEV_SEED_CLOUDFLARE_API_KEY`
- `DEV_SEED_CONVEX_TEAM_ID`
- `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`

If a provider's credentials are not available, skip that provider and report the
skip. Do not infer deletion targets from another provider.

## 1. Prove The Branch Is Merged

Run this from the worktree before deleting the branch:

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"
gh pr view --head "$branch" --json number,url,state,mergedAt,headRefName
```

Continue only when `headRefName` exactly equals `$branch` and `mergedAt` is not
null.

## 2. Compute The Expected Preview Tag

The Cloudflare preview upload attaches a deterministic branch tag. Compute the
expected tag directly from the branch name:

```bash
preview_hash="$(printf '%s' "$branch" | shasum -a 256 | awk '{ print substr($1, 1, 12) }')"
preview_tag="noter-pr-preview:$preview_hash"
preview_message="noter.md PR preview for $branch"
printf 'tag=%s\nmessage=%s\n' "$preview_tag" "$preview_message"
```

Keep the printed `tag` and `message` visible while inspecting Cloudflare. The
preview alias also ends with the same hash, unless the Worker name leaves no
safe DNS room for an alias.

## 3. Inspect Cloudflare Before Deleting

List Worker versions and active deployments with the same account token that
owns the Noter Worker:

```bash
CLOUDFLARE_API_TOKEN="$DEV_SEED_CLOUDFLARE_API_KEY" pnpm --dir apps/noter exec wrangler versions list --name "$CLOUDFLARE_WORKER_NAME" --json
CLOUDFLARE_API_TOKEN="$DEV_SEED_CLOUDFLARE_API_KEY" pnpm --dir apps/noter exec wrangler deployments list --name "$CLOUDFLARE_WORKER_NAME" --json
```

The Cloudflare deletion candidate must satisfy all of these checks:

1. its version `Tag` or `workers/tag` exactly equals the computed
   `noter-pr-preview:<hash>` tag
2. its message, preview URL, or alias points back to the same branch
3. its version ID does not appear in the active deployments output

If Wrangler does not show the tagged version, list versions through the API and
inspect the JSON response:

```bash
curl --fail-with-body --request GET \
  --url "https://api.cloudflare.com/client/v4/accounts/$DEV_SEED_CLOUDFLARE_ACCOUNT_ID/workers/workers/$CLOUDFLARE_WORKER_NAME/versions" \
  --header "Authorization: Bearer $DEV_SEED_CLOUDFLARE_API_KEY"
```

Follow `result_info` pagination if Cloudflare returns more pages.

Delete only the matching inactive version ID:

```bash
version_id="<matching-worker-version-id>"
curl --fail-with-body --request DELETE \
  --url "https://api.cloudflare.com/client/v4/accounts/$DEV_SEED_CLOUDFLARE_ACCOUNT_ID/workers/workers/$CLOUDFLARE_WORKER_NAME/versions/$version_id" \
  --header "Authorization: Bearer $DEV_SEED_CLOUDFLARE_API_KEY"
```

Never delete the Worker itself.

## 4. Inspect Convex Before Deleting

Resolve the Noter project under the production team:

```bash
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/teams/$DEV_SEED_CONVEX_TEAM_ID/projects/noter" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

Use the returned project `id` to list deployments:

```bash
project_id="<noter-project-id>"
curl --fail-with-body --request GET \
  --url "https://api.convex.dev/v1/projects/$project_id/list_deployments" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

The Convex deletion candidate must satisfy all of these checks:

1. `deploymentType` is `preview`
2. the deployment reference is `preview/<branch>` or the deployment metadata
   otherwise names the exact branch
3. the deployment belongs to the `noter` project resolved above

Delete only the matching preview deployment name:

```bash
deployment_name="<matching-convex-preview-deployment-name>"
curl --fail-with-body --request POST \
  --url "https://api.convex.dev/v1/deployments/$deployment_name/delete" \
  --header "Authorization: Bearer $DEV_SEED_CONVEX_MANAGEMENT_API_KEY"
```

Never delete `prod`, `dev`, or local Convex deployments during PR preview
cleanup.

## 5. Report The Result

In the final `clean` response, include:

- the merged PR URL
- any Cloudflare Worker version ID deleted, or why Cloudflare was skipped
- any Convex deployment name deleted, or why Convex was skipped
- the remaining local cleanup actions
