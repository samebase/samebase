# Worker Previews defaults, September 29, 2026

## Release status

Cloudflare announced Worker Previews on September 22, 2026. New Workers Builds projects use
`npx wrangler preview` as their preview command. This is now a public feature, rather than access
limited to the earlier private beta. Wrangler still labels the command as open beta.

Sources:
[launch announcement](https://developers.cloudflare.com/changelog/post/2026-09-22-worker-previews/),
[new-project defaults](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#automatic-configuration-for-new-projects),
[Wrangler command status](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.135.0/packages/wrangler/src/preview/preview.ts#L16-L22).

The September 29 screenshot shows Preview builds enabled during application creation, with
`pnpm run build`, `npx wrangler deploy`, and `npx wrangler preview`. The documentation confirms the
default preview model. It does not establish that the enable switch starts on for every account.

## Existing projects

Existing Workers keep their previous preview model until the operator completes the one-time switch
under Settings > Builds > Set up Worker Previews. Cloudflare states that this switch cannot be
reversed. It replaces the preview command with `npx wrangler preview`. After switching, restore
`pnpm run deploy:preview` to keep the Samebase package-script interface.

Source:
[existing-project migration](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds).

## Changes needed after the rebase

The rebase preserves the earlier implementation. It does not complete the changes for the public
release:

- Upgrade Wrangler to at least `4.135.0`. Samebase and the sidebars example currently pin `4.92.0`.
  The starter lockfile resolves `4.118.0`.
- Add the required `previews` block to each Wrangler configuration. It can be empty when the Worker
  only needs top-level settings such as static assets.
- Put preview runtime variables and bindings in that block. Copy dashboard-generated configuration
  into the file. Runtime secrets remain outside the file. Changes to Base secrets affect new
  Previews, not existing ones.
- Replace the Worker-name adapter with a direct `wrangler preview` package script after upgrading.
  Wrangler `4.135.0` reads `WRANGLER_CI_OVERRIDE_NAME` itself. For a local command, use its
  `--worker-name` option.
- Replace the old advice to ignore the setup banner with the current migration procedure. Verify one
  actual branch deployment and its pull-request comment after the switch.

Sources: [required version](https://developers.cloudflare.com/workers/previews/get-started/),
[preview configuration](https://developers.cloudflare.com/workers/previews/configuration/),
[Worker-name resolution](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.135.0/packages/deploy-helpers/src/preview/shared.ts#L344-L362).

## Builds API and Convex keys

The Builds API still has separate production and preview triggers, each with its own build variables
and secrets. Both triggers use `deploy_command` for their respective deployment command. Keep the
same `CONVEX_DEPLOY_KEY` variable name with different values in the two triggers. The production
trigger uses the production deployment key. The preview trigger uses the Convex project Preview key.
These are build secrets, distinct from Worker runtime Base secrets.

Source:
[Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/#manage-build-environment-variables).
