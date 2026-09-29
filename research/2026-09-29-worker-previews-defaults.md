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

## Repository update

The follow-up update changes the starter, Samebase, the Sidebars example, and the two auxiliary
Workers. It also supplies one migration guide for the connected-app rollout:

- Pin Wrangler to `4.136.2`, the latest release that met the repository's seven-day package-age
  policy when this update started. The required minimum is `4.135.0`.
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

## Builds API changes

The older Builds guide still documents trigger APIs. The current Cloudflare OpenAPI schema adds a
worker-level API at `/accounts/{account_id}/builds/workers/{script_tag}`. Its GET and PATCH
operations use `production_settings`, `previews_base_config`, and `previews_enabled`. Both settings
objects contain build-time environment variables. This `previews_base_config` is distinct from the
runtime configuration in the Workers API.

The `migrate_to_previews` operation removes the legacy non-production trigger. Samebase must stop
requiring that preview trigger UUID for discovery, configuration, key rotation, and deletion. The
production trigger still has a role in manual production builds and build-history matching. Preview
build settings have their own per-Preview APIs. Updating Base settings has an explicit
`patch_existing_previews` option, which matters when rotating keys for existing Previews.

Keep one `CONVEX_DEPLOY_KEY` name with different production and preview values. Keep
`SAMEBASE_CONVEX_PROJECT` in production build settings only. Neither value belongs in Worker runtime
secrets.

Read-only requests for Scout and the base Worker returned HTTP 403 with the local Wrangler OAuth
login. That login does not provide Workers CI access. No provider configuration was changed. The
worker-level API response and migrated lifecycle still need validation with suitable read access
before the Samebase provider change can be called complete.

Source:
[older Builds guide](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/#manage-build-environment-variables),
[current Cloudflare OpenAPI](https://github.com/cloudflare/api-schemas/blob/main/openapi.json).
