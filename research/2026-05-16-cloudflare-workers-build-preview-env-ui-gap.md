# Cloudflare Workers Builds Preview Env UI Gap

## Status

- Date: 2026-05-16
- Owner: Noter production hosting
- Outcome: Use split Convex deploy-key names for dashboard-managed Workers
  builds.

## Finding

Cloudflare Workers Builds supports environment variables per build trigger in
the API. The official API docs show separate production and preview trigger
UUIDs and a
`PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables`
endpoint for setting different values on each trigger.

The dashboard UI observed for the Noter production Worker did not expose that
trigger split in the Build variables drawer. The drawer showed variable name,
value, and encryption controls only. Because the same dashboard table feeds both
production and non-production builds, a single `CONVEX_DEPLOY_KEY` secret in the
dashboard can be accidentally used by the wrong branch path.

## Decision

For dashboard-managed Noter production builds, do not store `CONVEX_DEPLOY_KEY`
directly.

Use:

- `PROD_CONVEX_DEPLOY_KEY`
- `PREVIEW_CONVEX_DEPLOY_KEY`

The build script selects the correct secret from `WORKERS_CI_BRANCH`, then
passes it to the Convex CLI as `CONVEX_DEPLOY_KEY` only inside the child
process. This is not hard secret isolation because both dashboard secrets are
still visible to both build types, but it removes accidental use in our build
script without requiring API-only configuration.

Workers Builds API-managed triggers can keep per-trigger env isolation. That
path should be evaluated separately from manual dashboard setup.

## Monitoring

Recheck this when Cloudflare changes Workers Builds dashboard settings. The
specific UI change to look for is a production/preview, branch, or trigger
selector inside Worker Settings > Build > Variables and secrets.

If Cloudflare adds that dashboard selector, revisit whether manual projects
should set per-trigger `CONVEX_DEPLOY_KEY` values instead of split names.

## Sources

- Cloudflare Workers Builds API reference:
  https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
- Cloudflare Workers Builds configuration:
  https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
