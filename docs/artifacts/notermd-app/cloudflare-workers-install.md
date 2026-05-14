# Cloudflare Workers Install Trace

Use this note when regenerating or auditing the `notermd/app` teaching artifact.
It records the current Cloudflare Workers Git setup shape so a future agent can
repeat the browser walkthrough and spot dashboard changes.

Observed on 2026-05-14 in the Cloudflare Workers dashboard.

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
- `Build command`, marked optional, defaulting to `pnpm run build` for this pnpm
  repo.
- `Deploy command`, defaulting to `npx wrangler deploy`.
- `Builds for non-production branches`, checked by default.
- `Advanced settings`.

Expanding `Advanced settings` shows:

- `Non-production branch deploy command`, defaulting to
  `npx wrangler versions upload`.
- `Path`, defaulting to `/`.
- `API token`, either a generated Workers Builds token or a previously created
  token.
- Build variable fields: `Variable name`, `Variable value`, and `Encrypt`.

## Field Meanings

Cloudflare Workers Builds runs two commands for connected repositories:

1. The dashboard `Build command` compiles the project.
2. The dashboard `Deploy command` uploads and deploys the Worker.

For production, the default deploy command is `npx wrangler deploy`. That runs
Wrangler in the repository and deploys the Worker using `wrangler.jsonc`.

For non-production branches, the default command is
`npx wrangler versions upload`. It uploads a Worker version and preview URL
without promoting it to the active production deployment.

The Worker name in Cloudflare must match `name` in `wrangler.jsonc` for the
selected root path. If the dashboard project name defaults to the repository
name, either change the dashboard project name to match `wrangler.jsonc` or
change `wrangler.jsonc` before deploying.

The `Path` field is the repository root used for build and deploy commands. It
should stay `/` while the app lives at the repository root.

Build variables and secrets are available only during the Workers build. The
template needs `CONVEX_DEPLOY_KEY` as a build secret so Cloudflare can deploy
Convex before producing static assets.

## Template Decision

Use the dashboard default build command:

```sh
pnpm run build
```

In the artifact repo, make `build` delegate to the Cloudflare-aware build script
so users do not need to type a special command in the Cloudflare dashboard. Keep
the plain static build visible as a separate script, such as `build:app`.

Use the dashboard default deploy command:

```sh
npx wrangler deploy
```

Keep `wrangler.jsonc` because it still owns the Worker name, static assets
directory, SPA fallback, and local Wrangler deploy/dry-run behavior. Do not
claim that the Cloudflare Git build command comes only from `wrangler.jsonc`;
the dashboard `Build command` is a real setting in Workers Builds.

Recommended dashboard values for the artifact:

- Project name: match `wrangler.jsonc` `name`.
- Build command: keep `pnpm run build`.
- Deploy command: keep `npx wrangler deploy`.
- Non-production branch deploy command: keep `npx wrangler versions upload`.
- Path: keep `/`.
- Build secret: add `CONVEX_DEPLOY_KEY`.

## Sources

- Cloudflare Workers Builds configuration:
  <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- Cloudflare Workers Builds overview:
  <https://developers.cloudflare.com/workers/ci-cd/builds/>
- Cloudflare Wrangler custom builds:
  <https://developers.cloudflare.com/workers/wrangler/custom-builds/>
