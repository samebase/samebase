# Cloudflare Workers Install Trace

Use this note when regenerating or auditing the `samebase/base` teaching artifact. It records the
current Cloudflare Workers Git setup shape so a future agent can repeat the browser walkthrough and
spot dashboard changes.

Observed on 2026-05-14 in the Cloudflare Workers dashboard. Rechecked on 2026-08-31 against the
Worker Previews private-beta documentation and current Wrangler command surface.

## Current Dashboard Flow

Start at Workers & Pages and choose to create a Worker.

The first modal is titled `Create a Worker` and has these methods:

- `Continue with GitHub`
- `Connect GitLab`
- `Start with Hello World!`
- `Select a template`
- `Upload your static files`

Choose `Continue with GitHub`.

The next step is `Select a repository`:

- `GitHub account`
- `Search`
- repository list
- `Clone a public repository via Git URL`
- `Back`
- `Next`

Select the artifact repository and continue.

The next step is `Set up your application`:

- `Project name`, defaulting to the repository name.
- `Build command`, marked optional, defaulting to `pnpm run build` for this pnpm repo.
- `Deploy command`, defaulting to `npx wrangler deploy`.
- `Builds for non-production branches`, checked by default.
- `Advanced settings`.

Expanding `Advanced settings` shows:

- `Non-production branch deploy command`, defaulting to `npx wrangler versions upload`.
- `Path`, defaulting to `/`.
- `API token`, either a generated Workers Builds token or a previously created token.
- Build variable fields: `Variable name`, `Variable value`, and `Encrypt`.

## Field Meanings

Cloudflare Workers Builds runs two commands for connected repositories:

1. The dashboard `Build command` compiles the project.
2. The dashboard `Deploy command` uploads and deploys the Worker.

For production, the default deploy command is `npx wrangler deploy`. That runs Wrangler in the
repository and deploys the Worker using `wrangler.jsonc`.

For non-production branches, the default command is `npx wrangler versions upload`. It uploads a
Worker version and preview URL without promoting it to the active production deployment.

An account with Worker Previews access can use `npx wrangler preview` instead. That command creates
or updates a named Preview resource. New Worker Previews copy their runtime values, secrets, and
bindings from Previews Base.

If `wrangler.jsonc` contains `name`, Cloudflare requires that value to match the Worker name in the
dashboard. For a reusable artifact template, do not hard-code `name` in `wrangler.jsonc`; let
Samebase automation own the Worker name and pass it to Wrangler from a deploy script.

The `Path` field is the repository root used for build and deploy commands. It should stay `/` while
the app lives at the repository root.

Build variables and secrets are available only during the Workers build. The template needs a Convex
deploy key before it can produce static assets. Samebase-managed setup stores the production and
preview values under the same `CONVEX_DEPLOY_KEY` name on their separate triggers. It also writes
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` as a readable build
variable. The app does not consume that marker. Samebase reads it from Cloudflare to identify the
project declared by the two Builds triggers without storing a separate Worker-to-project
relationship.

Cloudflare Workers Builds has two build triggers under the hood: one for the production branch and
one for preview branches. The stable Builds API sets build variables per trigger. The production
trigger stores the production deploy key as `CONVEX_DEPLOY_KEY`. The preview trigger stores the
project Preview deploy key under the same name.

Some manual dashboard paths still show one shared build-variable table. The compatibility layout
stores the production key as `CONVEX_DEPLOY_KEY` and the project Preview key as
`PREVIEW_CONVEX_DEPLOY_KEY`. `scripts/build-cloudflare.ts` reads `WORKERS_CI_BRANCH`. A preview
build prefers the legacy key and then reads the canonical key. Samebase-managed setup uses only the
canonical name and deletes the legacy variable from both triggers.

Previews Base is not a Builds scope. It supplies runtime configuration to Worker code. Do not put a
Convex deploy key there. The value would not reach the build command and would expose a deploy
credential to the Worker runtime.

`CONVEX_DEPLOY_KEY` must contain a Convex production deploy key with exactly these permissions:

- `deployment:deploy`
- `deployment:env:view`
- `deployment:env:write`
- `deployment:data:view`

Do not grant `deployment:data:write`, function-run permissions, logs, backups, or integrations to
this key. The preview trigger value, or the compatibility `PREVIEW_CONVEX_DEPLOY_KEY`, must contain
Convex's project-level Preview deploy key from project settings. Preview deploy keys use their own
flow and do not take the production permission list.

## Template Decision

Use the dashboard default build command:

```sh
pnpm run build
```

In the artifact repo, make `build` delegate to the Cloudflare-aware build script so users do not
need to type a special command in the Cloudflare dashboard. Keep the plain static build visible as a
separate script, such as `build:app`.

Use repo-owned deploy commands:

```sh
pnpm run deploy
pnpm run deploy:preview
pnpm run deploy:worker-preview
```

`pnpm run deploy` should wrap `wrangler deploy --name <worker>`, which uploads a new version and
promotes it to production. `pnpm run deploy:preview` should wrap
`wrangler versions upload --name <worker>`, which uploads a version without promoting it. In Workers
Builds, the wrapper can read `WRANGLER_CI_OVERRIDE_NAME`; locally, it can require
`CLOUDFLARE_WORKER_NAME`. For local checks, the deploy wrapper can run the Cloudflare build path
before Wrangler. During Workers Builds, it should skip that internal build because the dashboard
`Build command` has already run.

`pnpm run deploy:worker-preview` should remain an explicit private-beta option. It wraps
`wrangler preview --worker-name <worker>`. The `--name` option names the Preview. Wrangler Preview
does not support `--dry-run`.

Keep helper scripts runnable by plain `node` in the Workers Builds image. Cloudflare defaults
Workers Builds to Node 22.16.0, which does not run `.ts` files through `node` by default. If the
artifact keeps Node-invoked helpers in TypeScript, pin Node 24 with `.node-version` or
`NODE_VERSION`; otherwise use plain ESM JavaScript helpers or an explicit TypeScript runner.

Keep `wrangler.jsonc` because it still owns the static assets directory, SPA fallback, preview URL
preference, and local Wrangler deploy/dry-run behavior. Do not put `name` or `build.command` in the
reusable template `wrangler.jsonc`, and do not claim that the Cloudflare Git build command comes
from `wrangler.jsonc`; the dashboard `Build command` is a real setting in Workers Builds.

Recommended dashboard values for the artifact:

- Project name: any valid Worker name.
- Build command: keep `pnpm run build`.
- Deploy command: `pnpm run deploy`.
- Non-production branch deploy command: `pnpm run deploy:preview`.
- Path: keep `/`.
- Build secret: add `CONVEX_DEPLOY_KEY` with the production key that has only `deployment:deploy`,
  `deployment:env:view`, `deployment:env:write`, and `deployment:data:view`.
- Build secret: add `PREVIEW_CONVEX_DEPLOY_KEY` with the project Preview deploy key.
- Build variable: add `SAMEBASE_CONVEX_PROJECT` with
  `version=1&teamId=<teamId>&projectId=<projectId>`. Do not encrypt it.

For Samebase-managed setup, write only `CONVEX_DEPLOY_KEY` and the marker to each trigger. Use the
matching deploy-key value for that trigger. Delete `PREVIEW_CONVEX_DEPLOY_KEY` after the app script
supports the canonical preview key.

## Sources

- Cloudflare Workers Builds configuration:
  <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- Cloudflare Workers Builds API reference:
  <https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/>
- Cloudflare Workers Builds overview: <https://developers.cloudflare.com/workers/ci-cd/builds/>
- Cloudflare Wrangler custom builds:
  <https://developers.cloudflare.com/workers/wrangler/custom-builds/>
- Cloudflare Workers Preview URLs:
  <https://developers.cloudflare.com/workers/configuration/previews/>
- Cloudflare Worker Previews private-beta documentation:
  <https://github.com/cloudflare/cloudflare-docs/pull/31775>
