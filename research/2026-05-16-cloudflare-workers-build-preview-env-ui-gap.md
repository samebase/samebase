# Cloudflare Workers Builds Preview Env UI Gap

## Status

- Date: 2026-05-16
- Owner: Noter production hosting and generated app hosting
- Outcome: Use the conventional `CONVEX_DEPLOY_KEY` for production builds and
  `PREVIEW_CONVEX_DEPLOY_KEY` for preview builds; Samebase-managed Workers Builds setup writes both
  names onto every trigger so the Cloudflare dashboard's visible build-variable table shows the full
  pair.

## Finding

Cloudflare Workers Builds supports environment variables per build trigger in the API. The official
API docs show separate production and preview trigger UUIDs and a
`PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables` endpoint for
setting different values on each trigger.

The dashboard UI observed for the Noter production Worker did not expose that trigger split in the
Build variables drawer. The drawer showed variable name, value, and encryption controls only.
Because the same dashboard table feeds both production and non-production builds, a single
`CONVEX_DEPLOY_KEY` secret in the dashboard can be accidentally used by the wrong branch path.

## Decision

For dashboard-managed Samebase production builds, user-managed template builds, and
Samebase-provisioned generated app builds, store the production deploy key under the conventional
name and require a separate preview deploy key.

Use:

- `CONVEX_DEPLOY_KEY`
- `PREVIEW_CONVEX_DEPLOY_KEY`

The build script selects the correct secret from `WORKERS_CI_BRANCH`, then passes it to the Convex
CLI as `CONVEX_DEPLOY_KEY` in the child process. This is not hard secret isolation when both
dashboard secrets are stored in the generic variables table, but it keeps preview builds from
falling back to the production key without requiring API-only configuration.

Workers Builds API-managed triggers can store variables per trigger, but Samebase-managed setup
should still write both names onto every trigger. That makes the production trigger's visible
dashboard table show the preview key too, while the build script continues to select the correct
secret from `WORKERS_CI_BRANCH`.

## Monitoring

Recheck this when Cloudflare changes Workers Builds dashboard settings. The specific UI change to
look for is a production/preview, branch, or trigger selector inside Worker Settings > Build >
Variables and secrets.

If Cloudflare adds that dashboard selector, the API-managed per-trigger layout can become the
dashboard-managed setup path too. Until then, preserving one contract across all three setup paths
is more valuable than using generic per-trigger names in API-managed triggers.

## Sources

- Cloudflare Workers Builds API reference:
  https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
- Cloudflare Workers Builds configuration:
  https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
