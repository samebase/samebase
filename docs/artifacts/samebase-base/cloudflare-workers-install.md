# Cloudflare Workers Install Trace

Use this note when regenerating or auditing the `samebase/base` teaching artifact. It records the
current Cloudflare Workers Git setup shape so a future agent can repeat the browser walkthrough and
spot dashboard changes.

Observed on 2026-05-14 in the Cloudflare Workers dashboard. Rechecked on 2026-09-01 against the live
**Builds > Production** and **Builds > Previews Base** settings and Wrangler 4.118.0.

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
- `Preview command`, defaulting to `npx wrangler preview`.
- `Enable Preview builds`, off by default.
- `Protect with Cloudflare Access`, off by default.
- `Advanced settings`.

Expanding `Advanced settings` shows:

- `Path`, defaulting to `/`.
- `API token`, either a generated Workers Builds token or a previously created token.
- Build variable fields: `Variable name`, `Variable value`, and `Encrypt`.

## Field Meanings

Cloudflare Workers Builds runs two commands for connected repositories:

1. The dashboard `Build command` compiles the project.
2. The dashboard `Deploy command` uploads and deploys the Worker.

For production, the default deploy command is `npx wrangler deploy`. That runs Wrangler in the
repository and deploys the Worker using `wrangler.jsonc`.

For non-production branches, `npx wrangler preview` creates or updates a named Preview resource.
Worker Previews is a private beta, and the account must have access.

For an existing Worker, Cloudflare can show an **Enable Worker Previews** banner. Cloudflare
documents this button as a change from the old Preview command to `npx wrangler preview`. The Builds
trigger API has no separate Worker Previews flag. When the repository uses the stable
`pnpm run deploy:preview` wrapper, keep that command because the wrapper already runs
`wrangler preview`.

Cloudflare inferred `pnpm run build` only after it read the exact `build` script from the pushed
default branch. It did not infer the package's `deploy` or `deploy:preview` script names. Samebase
must set those two fields explicitly.

For a reusable artifact template, do not hard-code `name` in `wrangler.jsonc`. `wrangler deploy`
reads `WRANGLER_CI_OVERRIDE_NAME` from Workers Builds. `wrangler preview` does not use that value to
select the target, so the repository Preview adapter passes it as `--worker-name`.

The `Path` field is the repository root used for build and deploy commands. It should stay `/` while
the app lives at the repository root.

Build variables and secrets are available only during the Workers build. The template needs a Convex
deploy key before it can produce static assets. Samebase-managed setup stores the production and
preview values under the same `CONVEX_DEPLOY_KEY` name on their separate triggers. It writes
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` only to the production
trigger. The app does not consume that marker. Samebase reads it from Cloudflare to identify the
declared project without storing a Worker-to-project relationship.

Cloudflare exposes the production trigger under **Settings > Builds > Production**. It exposes the
preview trigger under **Settings > Builds > Previews Base**. Each tab has its own build command,
deploy command, token, and variables and secrets. Put the project Preview deploy key in the
**Previews Base** Builds tab.

When Cloudflare first enables Worker Previews, it can copy the production build variables into
**Previews Base**. Before you start a branch build, replace the copied production key with the
project Preview key. Delete the copied `SAMEBASE_CONVEX_PROJECT` marker from **Previews Base**.

The top-level **Runtime variables and secrets** section is separate. Do not put a Convex deploy key
there. The value would not reach the build command and would expose a deploy credential to Worker
code.

`CONVEX_DEPLOY_KEY` must contain a Convex production deploy key with exactly these permissions:

- `deployment:deploy`
- `deployment:env:view`
- `deployment:env:write`
- `deployment:data:view`

Do not grant `deployment:data:write`, function-run permissions, logs, backups, or integrations to
this key. The preview trigger value must contain Convex's project-level Preview deploy key from
project settings. Preview deploy keys use their own flow and do not take the production permission
list.

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
```

`pnpm run deploy` runs `wrangler deploy`. `pnpm run deploy:preview` uses a small cross-platform
adapter around `wrangler preview --worker-name <worker>`. In Workers Builds, the adapter reads
`WRANGLER_CI_OVERRIDE_NAME`. Locally, it requires `CLOUDFLARE_WORKER_NAME`. The `--name` option
names the Preview, not the Worker. Wrangler Preview does not support `--dry-run`.

Keep `build`, `deploy`, and `deploy:preview` as the stable Samebase repository interface. The
repository can change their implementation without changing the Cloudflare settings.

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
- Preview builds: enabled for non-production branches.
- Build command: keep `pnpm run build`.
- Deploy command: `pnpm run deploy`.
- Non-production branch deploy command: `pnpm run deploy:preview`.
- Path: keep `/`.
- Production build secret: add `CONVEX_DEPLOY_KEY` with the production key that has only
  `deployment:deploy`, `deployment:env:view`, `deployment:env:write`, and `deployment:data:view`.
- Production build variable: add `SAMEBASE_CONVEX_PROJECT` with
  `version=1&teamId=<teamId>&projectId=<projectId>`. Do not encrypt it.
- Previews Base build secret: add `CONVEX_DEPLOY_KEY` with the project Preview deploy key.

For Samebase-managed setup, write the matching `CONVEX_DEPLOY_KEY` value to each trigger. Write the
marker only to the production trigger. Existing apps remove `PREVIEW_CONVEX_DEPLOY_KEY` and the old
preview marker through the starter changelog migration.

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
