# Cloudflare Workers Install Trace

Use this note when regenerating or auditing the `samebase/base` teaching artifact. It records the
current Cloudflare Workers Git setup shape so a future agent can repeat the browser walkthrough and
spot dashboard changes.

Observed on 2026-05-14 in the Cloudflare Workers dashboard. Rechecked on 2026-09-01 against the live
**Builds > Production** and **Builds > Previews Base** settings. Updated on 2026-09-29 from the
provided setup screenshot and Cloudflare's September 22 Worker Previews release documentation.

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
- `Enable Preview builds`, enabled in the September 29 screenshot. Verify the setting during setup.
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
Worker Previews is a public open beta. New Workers Builds projects use this preview model by
default. The project must use Wrangler `4.135.0` or later.

Existing Workers keep the previous preview model until the one-time switch. Open **Settings >
Builds**, then select **Set up Worker Previews**. The switch cannot be reversed. It replaces the
Preview command with `npx wrangler preview`. After the switch, restore the Samebase command
`pnpm run deploy:preview` and check the preview build key before a branch build.

Cloudflare inferred `pnpm run build` only after it read the exact `build` script from the pushed
default branch. It did not infer the package's `deploy` or `deploy:preview` script names. Samebase
must set those two fields explicitly.

For a reusable artifact template, do not hard-code `name` in `wrangler.jsonc`. `wrangler deploy` and
the supported `wrangler preview` both read `WRANGLER_CI_OVERRIDE_NAME` from Workers Builds. No
repository adapter is needed to pass the connected Worker name.

The `Path` field is the repository root used for build and deploy commands. It should stay `/` while
the app lives at the repository root.

Build variables and secrets are available only during the Workers build. The template needs a Convex
deploy key before it can produce static assets. Samebase-managed setup stores the production and
preview values under the same `CONVEX_DEPLOY_KEY` name in their separate build settings. It writes
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` only to the production
build configuration. The app does not consume that marker. Samebase reads it from Cloudflare to
identify the declared project without storing a Worker-to-project relationship.

Cloudflare exposes production build settings under **Settings > Builds > Production** and preview
build settings under **Settings > Builds > Previews Base**. Each tab has its own build command,
deploy command, token, and variables and secrets. Put the project Preview deploy key in the
**Previews Base** Builds tab.

Before you start a branch build, check the variables under **Builds > Previews Base**. If that scope
contains a copied production key, replace it with the project Preview key. Keep
`SAMEBASE_CONVEX_PROJECT` only under **Production**. Remove a copied preview marker after the
migration passes its deployment checks.

The top-level **Runtime variables and secrets** section is separate. Do not put a Convex deploy key
there. The value would not reach the build command and would expose a deploy credential to Worker
code.

`CONVEX_DEPLOY_KEY` must contain a Convex production deploy key with exactly these permissions:

- `deployment:deploy`
- `deployment:env:view`
- `deployment:env:write`
- `deployment:data:view`

Do not grant `deployment:data:write`, function-run permissions, logs, backups, or integrations to
this key. The Previews Base value must contain Convex's project-level Preview deploy key from
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

`pnpm run deploy` runs `wrangler deploy`. `pnpm run deploy:preview` runs `wrangler preview`.
Wrangler selects the connected Worker from the build environment. Locally, use
`pnpm run deploy:preview --worker-name <actual-worker-name>`. The `--name` option selects the
Preview name. Wrangler Preview does not support `--dry-run`.

Keep `build`, `deploy`, and `deploy:preview` as the stable Samebase repository interface. The
repository can change their implementation without changing the Cloudflare settings.

Keep helper scripts runnable by plain `node` in the Workers Builds image. Pin Node 24 with
`.node-version` or `NODE_VERSION` so the build can run the repository's TypeScript automation.

Keep `wrangler.jsonc` because it still owns the static assets directory, SPA fallback, preview
settings, and local Wrangler deploy/dry-run behavior. Do not put `name` or `build.command` in the
reusable template `wrangler.jsonc`, and do not claim that the Cloudflare Git build command comes
from `wrangler.jsonc`; the dashboard `Build command` is a real setting in Workers Builds.

Add the required `previews` block. Use `previews: {}` when the app serves only static assets. Put
preview runtime variables and bindings in that block when the app needs them. Copy any
dashboard-generated configuration into the file. Store runtime secrets in Previews Base, outside the
repository. A later Base secret change affects new Previews only.

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

For Samebase-managed setup, write the matching `CONVEX_DEPLOY_KEY` value to each build
configuration. Write the marker only to Production. Existing apps remove `PREVIEW_CONVEX_DEPLOY_KEY`
and the old preview marker manually after the starter changelog migration passes preview and
production checks. Use the
[existing-app migration runbook](../../existing-app-cloudflare-workers-migration.md#migrate-to-worker-previews)
to apply and verify that update in each repository.

## Sources

- Cloudflare Workers Builds configuration:
  <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- Cloudflare Workers Builds API reference:
  <https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/>
- Cloudflare Workers Builds overview: <https://developers.cloudflare.com/workers/ci-cd/builds/>
- Cloudflare Wrangler custom builds:
  <https://developers.cloudflare.com/workers/wrangler/custom-builds/>
- [Cloudflare Worker Previews setup](https://developers.cloudflare.com/workers/previews/get-started/)
- [Cloudflare Worker Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Existing Workers Builds migration](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds)
- [Worker Previews release](https://developers.cloudflare.com/changelog/post/2026-09-22-worker-previews/)
