# Cloudflare Workers Builds

This app deploys through Cloudflare Workers Builds. The Cloudflare dashboard runs these stable
repository commands:

| Builds stage | Production branch | Other branches            |
| ------------ | ----------------- | ------------------------- |
| Build        | `pnpm run build`  | `pnpm run build`          |
| Deploy       | `pnpm run deploy` | `pnpm run deploy:preview` |

The repository owns the implementation under these names. Outside Workers Builds,
`pnpm run build` runs only the app build.

## Build Variables

`CONVEX_DEPLOY_KEY` is a build secret. The Convex CLI needs it before Wrangler uploads the Worker.
Use one key name with a different value on each Workers Builds trigger:

| Workers Builds trigger | Secret name         | Secret value                      |
| ---------------------- | ------------------- | --------------------------------- |
| Production             | `CONVEX_DEPLOY_KEY` | Convex production deploy key      |
| Preview                | `CONVEX_DEPLOY_KEY` | Convex project Preview deploy key |

In the dashboard, put the production value under **Settings > Builds > Production**. Put the
preview value under **Settings > Builds > Previews Base**. The **Previews Base** tab in the Builds
section is the preview trigger's build configuration.

Samebase-managed setup writes each secret through its trigger API. It writes the readable
`SAMEBASE_CONVEX_PROJECT` marker only to the production trigger. Samebase reads that marker to
identify the Convex project declared by the Worker. The app does not read it.

Do not add `VITE_CONVEX_URL`. Convex supplies the selected deployment URL to the frontend command
that runs through `convex deploy --cmd`.

Do not add a Convex deploy key under **Runtime variables and secrets**. That section configures the
running Worker. It does not provide variables to the Workers Builds process. Putting a deploy key
there does not fix the build and exposes a deploy credential to Worker code.

Existing apps can still have `PREVIEW_CONVEX_DEPLOY_KEY` or a preview marker. The current scripts do
not read those values, and Samebase does not remove them. Use the starter changelog to migrate an
existing repository and delete the old values from Cloudflare.

## Build Ordering

Non-production builds pass `WORKERS_CI_BRANCH` to Convex as the stable preview name. The Convex
deploy and every Convex Auth environment command use the same explicit preview name. Repeated
commits reuse one preview deployment, URL, and data.

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
pnpm run deploy:dry-run
```

Worker Previews has no dry-run mode. For a local Preview deploy, set
`CLOUDFLARE_WORKER_NAME` and run `pnpm run deploy:preview`.

## Worker Previews

`pnpm run deploy:preview` runs:

```sh
wrangler preview --worker-name <connected-worker-name>
```

Wrangler uses the Git branch as the Preview name. Its `--name` option names the Preview, not the
Worker. The small repository adapter reads `WRANGLER_CI_OVERRIDE_NAME` and passes the Worker through
`--worker-name`. This avoids a hard-coded name in `wrangler.jsonc`.

Worker Previews is a private beta. The Cloudflare account must have access to use the preview
deploy command.

Configure safe runtime variables, secrets, and bindings in Previews Base before you share a Preview
URL. A new Preview copies the Base settings when it is created. A later Base change does not update
an existing Preview. Production runtime settings do not become Preview settings automatically.

## References

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Cloudflare Worker Previews documentation pull request](https://github.com/cloudflare/cloudflare-docs/pull/31775)
