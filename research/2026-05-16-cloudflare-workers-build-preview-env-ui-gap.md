# Cloudflare Workers Builds Preview Env UI Gap

## Status

- Date: 2026-05-16
- Owner: Noter production hosting and generated app hosting
- Superseded on 2026-09-01 by
  [the Worker Previews contract audit](./2026-08-31-cloudflare-worker-previews-contract.md).
- Historical outcome: Use the conventional `CONVEX_DEPLOY_KEY` for production builds and
  `PREVIEW_CONVEX_DEPLOY_KEY` for preview builds; Samebase-managed Workers Builds setup writes both
  names onto every trigger so the Cloudflare dashboard's visible build-variable table shows the full
  pair.
- Current outcome: The dashboard exposes separate **Builds > Production** and **Builds > Previews
  Base** tabs. Both triggers use `CONVEX_DEPLOY_KEY` with their scoped values.

## Finding

Cloudflare Workers Builds supports environment variables per build trigger in the API. The official
API docs show separate production and preview trigger UUIDs and a
`PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables` endpoint for
setting different values on each trigger.

The dashboard UI observed for the Noter production Worker did not expose that trigger split in the
Build variables drawer. The drawer showed variable name, value, and encryption controls only.
Because the same dashboard table feeds both production and non-production builds, a single
`CONVEX_DEPLOY_KEY` secret in the dashboard can be accidentally used by the wrong branch path.

## Historical decision

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

The 2026-09-01 dashboard check found the expected split under **Worker Settings > Builds**. The
**Production** tab has the production build command and variables. The **Previews Base** tab has the
preview build command and variables. Samebase removed the legacy fallback from active code.

## Sources

- Cloudflare Workers Builds API reference:
  https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
- Cloudflare Workers Builds configuration:
  https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
