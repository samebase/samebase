# Cloudflare Workers Builds

This app deploys through Cloudflare Workers Builds. The Cloudflare dashboard runs
`pnpm run build`, then runs `pnpm run deploy` for the production branch or
`pnpm run deploy:preview` for other branches.

## Build Variables

`CONVEX_DEPLOY_KEY` is a build secret. The Convex CLI needs it before Wrangler uploads the Worker.
Use one key name with a different value on each Workers Builds trigger:

| Workers Builds trigger | Secret name         | Secret value                      |
| ---------------------- | ------------------- | --------------------------------- |
| Production             | `CONVEX_DEPLOY_KEY` | Convex production deploy key      |
| Preview                | `CONVEX_DEPLOY_KEY` | Convex project Preview deploy key |

Samebase-managed setup writes the secret through the trigger API. It also writes the same readable
`SAMEBASE_CONVEX_PROJECT` marker to both triggers.

Do not add `VITE_CONVEX_URL`. Convex supplies the selected deployment URL to the frontend command
that runs through `convex deploy --cmd`.

Do not add a Convex deploy key under **Settings > Variables and secrets > Previews Base**. That
section configures the running Worker. It does not provide variables to the Workers Builds process.
Putting a deploy key there does not fix the build and exposes a deploy credential to Worker code.

### Shared dashboard compatibility

Some dashboard setup paths still show one shared build-variable table. In that view, use the old
two-name layout:

- `CONVEX_DEPLOY_KEY` contains the production key.
- `PREVIEW_CONVEX_DEPLOY_KEY` contains the project Preview key.

The build script supports both layouts:

1. It reads `WORKERS_CI_BRANCH`.
2. It reads `CONVEX_DEPLOY_KEY` when the branch is `main`.
3. For another branch, it reads `PREVIEW_CONVEX_DEPLOY_KEY` first and then
   `CONVEX_DEPLOY_KEY`.
4. It passes only the selected value to the Convex deploy subprocess as
   `CONVEX_DEPLOY_KEY`.

Update the script before you migrate the provider settings. Then set the canonical key on each
trigger and delete `PREVIEW_CONVEX_DEPLOY_KEY`. This order prevents a preview build from reading the
production key during the change.

## Build Ordering

Non-production builds pass `WORKERS_CI_BRANCH` to Convex as the stable preview
name, so repeated commits reuse one preview deployment, URL, and data.

Cloudflare may build more than one commit from the same branch concurrently.
Stable naming does not order those builds: without another check, an older build
that finishes last can replace newer Convex functions. After building the app
and immediately before Convex pushes functions, this template compares the
checked-out Git commit with the remote head of `WORKERS_CI_BRANCH`. A stale
build fails without deploying Convex. The checkout is authoritative because a
manual Workers Build can report the branch name in `WORKERS_CI_COMMIT_SHA`. The
check applies to `main` too, where the same overlap could otherwise roll
production back.

The check adds one authenticated `git ls-remote` request to each provider build.
It is not an atomic compare-and-swap. A branch can still advance in the short
interval between the Git check and Convex's internal push. Eliminating that
residual race requires provider-side serialization or a Convex source-commit
concurrency primitive.

## Local Checks

Local dry-runs can validate the Worker package without build secrets:

```sh
CLOUDFLARE_WORKER_NAME=my-worker vp run deploy:dry-run
CLOUDFLARE_WORKER_NAME=my-worker vp run deploy:preview:dry-run
```

If you set either deploy key locally, also set `WORKERS_CI_BRANCH` so the
script can choose the intended deployment target.

## Worker Previews Private Beta

`pnpm run deploy:preview` uses `wrangler versions upload`. It remains the default because it works
for accounts without Worker Previews access.

If Cloudflare enabled Worker Previews for the account, set the preview deploy command to:

```sh
pnpm run deploy:worker-preview
```

This command runs `wrangler preview --worker-name <worker>`. Wrangler uses the Git branch as the
Preview name. A manual `--name` value names the Preview, not the Worker. Wrangler Preview does not
support `--dry-run`.

Configure safe runtime variables, secrets, and bindings in Previews Base before you share a Preview
URL. A new Preview copies the Base settings when it is created. A later Base change does not update
an existing Preview. Production runtime settings do not become Preview settings automatically.

## References

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Cloudflare Worker Previews documentation pull request](https://github.com/cloudflare/cloudflare-docs/pull/31775)
