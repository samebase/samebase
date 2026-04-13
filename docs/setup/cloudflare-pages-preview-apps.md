# Cloudflare Pages Preview Apps

This repo now keeps the Cloudflare Pages PR-preview wiring in code instead of
only in the dashboard.

## What is repo-owned now

1. `scripts/cloudflare-pages-apps.ts` is the source of truth for each deployable
   Pages app:
   - project name
   - root directory
   - build command
   - build watch paths
   - production branch
   - which Convex deploy-key env vars it expects
2. `scripts/cloudflare-pages-sync.ts` creates or updates the Git-integrated
   Pages projects from that manifest.
3. `scripts/cloudflare-pages-build.ts` is the build wrapper Cloudflare runs
   inside each app:
   - it lets `npx convex deploy` pick the correct production or preview backend
   - it syncs `SITE_URL` / `CONVEX_SITE_URL` onto the exact Convex deployment
     that matches the current Pages build
   - it exports `VITE_CONVEX_SITE_URL` for the frontend build when the app needs
     a live site origin

## Required operator env vars

Set these before running the sync:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
export NOTER_CONVEX_PRODUCTION_DEPLOY_KEY=...
export NOTER_CONVEX_PREVIEW_DEPLOY_KEY=...
export NOTER_STARTER_TEMPLATE_CONVEX_PRODUCTION_DEPLOY_KEY=...
export NOTER_STARTER_TEMPLATE_CONVEX_PREVIEW_DEPLOY_KEY=...
```

Optional but recommended:

```bash
export NOTER_SITE_URL=https://noter.md
```

If `NOTER_SITE_URL` is omitted, production sync falls back to Cloudflare’s
current deployment URL. That still works, but it means Convex auth/OAuth
redirects will target the Pages hostname instead of the canonical custom domain.

The sync script resolves the GitHub repo id through `gh api`, so it expects a
working `gh` login for the repo owner account.

`--dry-run` still needs the Convex deploy-key env vars because the rendered
payload includes the managed Pages env surface, but it does not require
Cloudflare API credentials.

## Automatic sync on `main`

The repo now ships `.github/workflows/cloudflare-pages-sync.yml`. On every push
to `main`, it re-applies the repo-owned Pages project configuration so preview
deploys keep following the manifest even if dashboard settings drift. The
workflow can also be run manually, but it only applies config from `main`.

Configure these GitHub repository secrets for the workflow:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
NOTER_CONVEX_PRODUCTION_DEPLOY_KEY
NOTER_CONVEX_PREVIEW_DEPLOY_KEY
NOTER_STARTER_TEMPLATE_CONVEX_PRODUCTION_DEPLOY_KEY
NOTER_STARTER_TEMPLATE_CONVEX_PREVIEW_DEPLOY_KEY
```

Optional but recommended:

```text
Repository variable: NOTER_SITE_URL=https://noter.md
```

The local sync command remains useful for dry-runs, first-time setup, and
repairing drift before the next `main` push.

## Usage

Dry-run first:

```bash
pnpm cloudflare:pages:sync -- --dry-run
```

Sync all configured apps:

```bash
pnpm cloudflare:pages:sync
```

Sync only one app:

```bash
pnpm cloudflare:pages:sync -- --app noter
```

## Current shipped apps

1. `noter`
2. `noter-starter-template`

## Why the build wrapper exists

Cloudflare Pages already gives each build `CF_PAGES_BRANCH` and `CF_PAGES_URL`.
The current Convex CLI can infer preview branch names in Cloudflare Pages, so
the Pages project build command can stay simple:

1. Cloudflare injects the correct production or preview `CONVEX_DEPLOY_KEY` into
   the build environment.
2. `npx convex deploy --cmd ...` selects or creates the matching Convex
   deployment.
3. The wrapped build script derives the active deployment from `VITE_CONVEX_URL`
   and syncs the live site URL into that deployment before the frontend build
   runs.

That keeps the frontend bundle, Convex backend, and auth redirect origin aligned
for both production and PR previews without manual dashboard edits on every new
branch.
