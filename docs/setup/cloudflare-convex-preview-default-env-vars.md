# Convex Preview Default Environment Variables

Use this runbook when a Noter-managed repo relies on Cloudflare preview deploys
and Convex preview deployments.

Until Noter provisions these defaults automatically, set them once at the Convex
project level so each newly created preview deployment inherits the same inputs
used by the local `make anon` flow and the preview chat runtime.

This audit found three different parity levels:

- seed parity: fixed password account plus seeded GitHub/Convex/Cloudflare
  provider connections
- ChatFab parity: the preview backend can answer chat requests
- optional hosted-feature parity: preview deploys can also exercise Google
  login, provider OAuth flows, Daytona-backed features, and waitlist email

## Where to set them

In the [Convex dashboard](https://dashboard.convex.dev/), open the project and
add project default environment variables for development and preview
deployments.

Set these at the project-default level, not only on one existing preview
deployment. Preview deployments are created fresh per branch, so new deployments
need to inherit the values automatically.

## Required project defaults

Set these defaults on both `dev` and `preview` deployments:

| Goal                                             | Env vars                                                                                                                                                    | Why                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Seeded password account and provider connections | `DEV_SEED_GITHUB_API_KEY`, `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`, `DEV_SEED_CONVEX_TEAM_ID`, `DEV_SEED_CLOUDFLARE_API_KEY`, `DEV_SEED_CLOUDFLARE_ACCOUNT_ID` | Consumed by `devAuth:seedPasswordAccount` and the auto-seed auth path.    |
| ChatFab / editor chat                            | `ANTHROPIC_API_KEY`                                                                                                                                         | The chat runtime uses the Anthropic provider through `@ai-sdk/anthropic`. |

If you want preview deployments to match current local operator behavior for the
seeded preview path and ChatFab, set the full six-variable set above.

## Pairing rules

- `DEV_SEED_CONVEX_MANAGEMENT_API_KEY` and `DEV_SEED_CONVEX_TEAM_ID` must be set
  together.
- If you set `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`, also set
  `DEV_SEED_CLOUDFLARE_API_KEY`.

## Related preview inputs

This runbook covers Convex project defaults only. Some preview inputs belong in
other config surfaces:

- `CONVEX_DEPLOY_KEY`: set this in Cloudflare Pages preview environment config
  so the preview build can run `npx convex deploy --preview-create ...`.
- `VITE_CONVEX_URL`: do not pre-bake this as a static preview default. The
  Convex deploy step should inject the branch-specific value at build time.

## Full `make anon` env-copy parity

The local `make anon` bootstrap copies a slightly broader allowlist than the
preview seed/auth path itself consumes. Beyond the six required vars above, the
worktree bootstrap also mirrors these `DAYTONA_*` values from the source cloud
dev deployment when they exist:

- `DAYTONA_API_URL`
- `DAYTONA_API_TOKEN`
- `DAYTONA_API_KEY`
- `DAYTONA_CONVEX_DEPLOY_KEY`
- `DAYTONA_BASE_IMAGE`
- `DAYTONA_REGISTRY_URL`
- `DAYTONA_REGISTRY_USERNAME`
- `DAYTONA_REGISTRY_PASSWORD`
- `DAYTONA_REGISTRY_PROJECT`
- `DAYTONA_REGISTRY_NAME`
- `DAYTONA_REGISTRY_SET_DEFAULT`
- `DAYTONA_ORGANIZATION_ID`

Only add those to Convex project defaults if preview deployments are also
expected to exercise Daytona-backed features.

## Hosted envs beyond `make anon`

Some hosted features depend on extra env vars that are not part of the local
worktree allowlist and should be treated as a separate preview-hosting decision:

- Google sign-in: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- GitHub OAuth connect: `PROVIDER_GITHUB_OAUTH_CLIENT_ID`,
  `PROVIDER_GITHUB_OAUTH_CLIENT_SECRET`, `PROVIDER_GITHUB_OAUTH_REDIRECT_URL`
- Convex OAuth connect: `PROVIDER_CONVEX_OAUTH_CLIENT_ID`,
  `PROVIDER_CONVEX_OAUTH_CLIENT_SECRET`, `PROVIDER_CONVEX_OAUTH_REDIRECT_URL`
- Cloudflare MCP OAuth connect: `PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL`
- Waitlist email notifications: `RESEND_API_KEY`

Be careful with app-origin settings such as `SITE_URL` and `CONVEX_SITE_URL`.
Some hosted OAuth and MCP consent flows read them directly, but a single static
value may not be the right fit for branch-specific preview URLs.

## Important caveat

Convex project default environment variables only apply when a new development
or preview deployment is created. They do not backfill older preview
deployments.

After adding or changing these defaults:

1. recreate any older preview deployments that were created before the change,
   or
2. patch those existing preview deployments manually before relying on them

## References

- [Convex environment variables](https://docs.convex.dev/production/environment-variables)
- [Convex preview deployments](https://docs.convex.dev/production/hosting/preview-deployments)
- [Convex Vercel preview deployment guide](https://docs.convex.dev/production/hosting/vercel)
