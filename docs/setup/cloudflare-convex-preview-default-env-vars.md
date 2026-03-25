# Convex Preview Default Environment Variables

Use this runbook when a Noter-managed repo relies on Cloudflare preview deploys
and Convex preview deployments.

Until Noter provisions these defaults automatically, set them once at the Convex
project level so each newly created preview deployment inherits the same seed
inputs as the local `make anon` flow.

Noter reads these values during `devAuth:seedPasswordAccount` to:

- create or update the fixed password account
- seed GitHub, Convex, and Cloudflare provider connections inside the preview
  backend

## Where to set them

In the [Convex dashboard](https://dashboard.convex.dev/), open the project and
add project default environment variables for development and preview
deployments.

Set these at the project-default level, not only on one existing preview
deployment. Preview deployments are created fresh per branch, so new deployments
need to inherit the values automatically.

## Variables to set

- `DEV_SEED_GITHUB_API_KEY`: GitHub API token to seed into the preview account.
- `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`: Convex management API key for the seeded
  Convex connection.
- `DEV_SEED_CONVEX_TEAM_ID`: Convex team ID paired with
  `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`.
- `DEV_SEED_CLOUDFLARE_API_KEY`: Cloudflare API token for the seeded Cloudflare
  connection.
- `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID paired with
  `DEV_SEED_CLOUDFLARE_API_KEY`.

For preview deployments that should match local operator behavior, set the full
five-variable set.

## Pairing rules

- `DEV_SEED_CONVEX_MANAGEMENT_API_KEY` and `DEV_SEED_CONVEX_TEAM_ID` must be set
  together.
- If you set `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`, also set
  `DEV_SEED_CLOUDFLARE_API_KEY`.

## Important caveat

Convex project default environment variables only apply when a new development
or preview deployment is created. They do not backfill older preview
deployments.

After adding or changing these defaults:

1. recreate any older preview deployments that were created before the change,
   or
2. patch those existing preview deployments manually before relying on them

## Related preview input

This runbook covers Convex project defaults only. The Cloudflare preview build
still needs `CONVEX_DEPLOY_KEY` set to a Convex preview deploy key in the
hosting provider's preview environment.

## References

- [Convex environment variables](https://docs.convex.dev/production/environment-variables)
- [Convex preview deployments](https://docs.convex.dev/production/hosting/preview-deployments)
- [Convex Vercel preview deployment guide](https://docs.convex.dev/production/hosting/vercel)
