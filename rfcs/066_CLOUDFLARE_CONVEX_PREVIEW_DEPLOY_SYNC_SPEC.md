# 066 Cloudflare + Convex Preview Deploy Sync Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-04-01
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/025_MULTI_WORKTREE_OAUTH_BROKER_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `rfcs/062_NETLIFY_REMOVAL_AND_CLOUDFLARE_ONLY_HOSTING_SPEC.md`

## Summary

Cloudflare Pages preview deployments must create matching Convex preview
deployments per branch instead of reusing one shared Convex cloud dev
deployment.

Preview Convex deployments must also behave like `make anon` in the one place
that matters for operator preview workflows:

1. seed the fixed password account
2. seed the `DEV_SEED_*` provider connections
3. expose the password autofill UI by default on preview pages

`?prod-ui` remains the explicit operator override to hide the dev-like auth UI
on a preview page without changing backend auth state.

## Why this spec exists

Current behavior is close but not correct:

1. Cloudflare already creates preview frontend deploys.
2. Noter already provisions a Convex production deployment plus a Cloudflare
   Pages project.
3. Noter does not currently create a true Convex preview deployment per preview
   branch.
4. Even if preview backend seeding existed, the current landing page only shows
   password auth in Vite dev mode.

That means current Cloudflare previews do not match local `make anon` behavior
for the preview sign-in path.

## Audit Findings (2026-04-01)

The repo currently has three different environment-parity buckets, and they
should not be conflated:

1. `devAuth:seedPasswordAccount` only reads the five `DEV_SEED_*` variables:
   - `DEV_SEED_GITHUB_API_KEY`
   - `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`
   - `DEV_SEED_CONVEX_TEAM_ID`
   - `DEV_SEED_CLOUDFLARE_API_KEY`
   - `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`
2. ChatFab is a separate runtime dependency. `chat/actions.ts` runs the agent
   graph, `agent/graph.ts` uses the Anthropic provider by default, and the
   installed AI SDK resolves `ANTHROPIC_API_KEY` from the environment.
3. `make anon` copies a broader worktree allowlist into local anonymous env:
   `ANTHROPIC_API_KEY` plus several `DAYTONA_*` vars. Those are not part of the
   provider-seed contract, but they do matter for local feature parity when the
   corresponding features are used.
4. Hosted OAuth and consent flows depend on `AUTH_GOOGLE_*`,
   `PROVIDER_*_OAUTH_*`, `PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL`, and
   `SITE_URL`/`CONVEX_SITE_URL`. Those are broader hosted-feature concerns, not
   the minimal preview seed contract.

## Current Gaps In Repo

1. `apps/noter/convex/infraProvisioning.ts` currently treats “preview Convex” as
   a single reusable `dev` deployment plus a deployment-scoped deploy key. That
   is not a Convex preview deployment model.
2. `apps/noter/convex/infraProvisioning.ts` currently configures Cloudflare with
   `npx convex deploy --cmd 'pnpm run build'`, which does not pass
   `--preview-create` for Cloudflare previews and does not explicitly map
   Convex's build-time URL to `VITE_CONVEX_URL`.
3. `apps/noter/convex/hostingProviders.ts` currently writes a fixed
   `VITE_CONVEX_URL` into Cloudflare Pages env config. Preview URLs should be
   branch-specific and owned by the Convex deploy step, not pre-baked as one
   shared preview URL.
4. `apps/noter/convex/auth.ts` enables password auth for local/dev/anonymous
   cases, but not `preview:` deployments.
5. `apps/noter/src/SignInForm.tsx` only shows password auth when
   `import.meta.env.DEV` is true.

## Locked Decisions

1. One Cloudflare preview branch maps to one Convex preview deployment.
2. Cloudflare preview builds use a Convex preview deploy key created at the
   project level via `POST /projects/:project_id/create_preview_deploy_key`.
   They must not use a deployment-scoped `dev` deploy key.
3. Cloudflare production builds keep using a production deploy key.
4. Preview deployment naming uses the raw `CF_PAGES_BRANCH` value so Cloudflare
   preview behavior matches Convex's documented branch-based preview model.
5. Cloudflare Pages preview config is shared across preview branches. Branch
   specificity must therefore come from `CF_PAGES_BRANCH` during the build, not
   from branch-specific Cloudflare config.
6. Preview Convex deployments must seed the same `DEV_SEED_*` provider inputs
   used by the `make anon` flow:
   - `DEV_SEED_GITHUB_API_KEY`
   - `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`
   - `DEV_SEED_CONVEX_TEAM_ID`
   - `DEV_SEED_CLOUDFLARE_API_KEY`
   - `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`
7. Preview deployments intended to support ChatFab must also inherit
   `ANTHROPIC_API_KEY` on `dev` and `preview` deployments.
8. Preview deployments are dev-like for auth:
   - backend password auth is enabled on `preview:` deployments
   - frontend password auth UI is shown on preview deployments by default
   - `?prod-ui` hides the dev-like UI on preview pages
9. Cloudflare Pages should stop owning `VITE_CONVEX_URL` as a static env var.
   The Convex deploy step is the source of truth for that build-time value.

## Design

### 1. Replace “preview dev deployment” with a true Convex preview deploy key

Replace the current `ensureConvexPreviewResources` shape with a narrower
`ensureConvexPreviewDeployKey` flow:

1. resolve the Convex project
2. create or reuse a project-scoped Convex preview deploy key
3. store that preview deploy key in Cloudflare's shared preview environment

Do not pre-create or reuse one shared cloud `dev` deployment for all previews.
Convex preview deployments should be created on demand by `npx convex deploy`
inside the Cloudflare preview build.

### 2. Move preview branch selection into the build command

Cloudflare preview config is shared across all preview branches, so the build
command must select the Convex preview deployment at build time from
`CF_PAGES_BRANCH`.

Use a repo-owned build script instead of an inline shell string. The build
script should receive the repo default branch as an explicit argument and choose
between production and preview behavior.

Required behavior:

- On the production branch:
  - run `npx convex deploy`
  - pass `--cmd-url-env-var-name VITE_CONVEX_URL`
  - build with `VITE_NOTER_DEPLOY_CONTEXT=production`
- On non-production branches:
  - run `npx convex deploy --preview-create "$CF_PAGES_BRANCH"`
  - run `--preview-run 'devAuth:seedPasswordAccount'`
  - pass `--cmd-url-env-var-name VITE_CONVEX_URL`
  - build with `VITE_NOTER_DEPLOY_CONTEXT=preview`

Representative shape:

```sh
# production branch
npx convex deploy \
  --cmd-url-env-var-name VITE_CONVEX_URL \
  --cmd 'VITE_NOTER_DEPLOY_CONTEXT=production pnpm run build'

# preview branch
npx convex deploy \
  --preview-create "$CF_PAGES_BRANCH" \
  --preview-run 'devAuth:seedPasswordAccount' \
  --cmd-url-env-var-name VITE_CONVEX_URL \
  --cmd 'VITE_NOTER_DEPLOY_CONTEXT=preview pnpm run build'
```

### 3. Seed preview deployments with the full dev seed set

`devAuth:seedPasswordAccount` is already the canonical runtime seeding entry
point for local anonymous worktrees. Preview deployments should reuse the same
entry point.

This is intentionally more than just password sign-in:

1. it creates or updates the fixed password account
2. it upserts provider connections from `DEV_SEED_*` values
3. it gives preview pages the same preconnected GitHub/Convex/Cloudflare state
   expected from local operator workflows

Use Convex project default environment variables for preview and development
deployments so newly created preview deployments inherit the `DEV_SEED_*` values
automatically.

Important constraint from Convex docs:

- project default env vars apply when a new preview/development deployment is
  created
- they do not retroactively update existing preview deployments

Operational consequence:

- after enabling this design, old branch previews may need to be recreated or
  patched manually if they were created before the defaults existed

### 4. Make preview auth behave like dev auth

Backend:

- treat `preview:` deployments as dev-like for password auth enablement
- do not restrict password auth to only `dev:` and anonymous/local deployments

Frontend:

- show password auth when either:
  - `import.meta.env.DEV` is true, or
  - `import.meta.env.VITE_NOTER_DEPLOY_CONTEXT === "preview"`
- keep `?prod-ui` as the explicit hide switch

This makes preview pages operator-friendly by default while preserving a clean
way to inspect the production-style landing shell.

## Required Code Changes

1. `apps/noter/convex/infraProvisioning.ts`
   - replace shared-dev preview provisioning with preview deploy key creation
   - switch Cloudflare build command to a repo-owned preview-aware build script
2. `apps/noter/convex/hostingProviders.ts`
   - stop writing static `VITE_CONVEX_URL`
   - keep `CONVEX_DEPLOY_KEY` as the Cloudflare-owned input
3. `apps/noter/convex/auth.ts`
   - enable password auth on `preview:` deployments
4. `apps/noter/src/SignInForm.tsx`
   - show password auth on preview deploys, not only Vite dev
5. `scripts/`
   - add one repo-owned Cloudflare/Convex build orchestrator script

## Validation

1. Pushing a PR branch creates a new Cloudflare preview deploy and a matching
   Convex preview deployment for that branch.
2. The preview build embeds that branch's Convex URL into `VITE_CONVEX_URL`.
3. The preview landing page shows `Autofill & sign in` by default.
4. Clicking `Autofill & sign in` succeeds against the seeded preview backend.
5. The seeded preview account has GitHub, Convex, and Cloudflare provider
   connections from `DEV_SEED_*`.
6. Adding `?prod-ui` to the preview URL hides the password auth UI.
7. Production deploys continue to target the production Convex deployment and do
   not show preview/dev auth UI.
8. ChatFab can answer in preview deployments when `ANTHROPIC_API_KEY` is
   present.

## Follow-Up Boundary

This RFC keeps the minimal preview-sync contract focused on seeded auth,
provider connections, branch-aware Convex preview deploys, and ChatFab parity.

If Noter later decides that preview deployments must also support Daytona,
Google sign-in, provider OAuth reconnect flows, or waitlist email end to end,
that should be tracked as a follow-up hosted-env decision instead of being
silently folded into the seed-only `DEV_SEED_*` contract.

## References

- [Convex CLI](https://docs.convex.dev/cli)
- [Convex create preview deploy key](https://docs.convex.dev/management-api/create-preview-deploy-key)
- [Convex environment variables](https://docs.convex.dev/production/environment-variables)
- [Convex Netlify preview guide](https://docs.convex.dev/production/hosting/netlify)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Cloudflare Pages Wrangler preview config note](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
