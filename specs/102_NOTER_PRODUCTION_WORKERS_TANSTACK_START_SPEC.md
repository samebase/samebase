# Noter Production Workers And TanStack Start Migration Spec

## Document Control

- Status: Accepted implementation plan
- Owner: Noter production hosting
- Created: 2026-05-16
- Related:
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `research/2026-05-05-cloudflare-pages-workers-direction.md`
  - `research/2026-05-15-notermd-workers-provisioning-migration.md`

## Summary

Move the Noter production app from the current Cloudflare Pages static Vite deploy to Cloudflare
Workers Static Assets and TanStack Start in one rollout.

The easiest acceptable migration is a single app cutover:

1. convert the production app from TanStack Router-only Vite to TanStack Start SPA mode
2. add a Workers-owned deploy contract with `wrangler.jsonc`
3. keep the browser app client-first and keep Convex as the backend
4. validate a shadow Worker before touching the `noter.md` production hostname
5. switch the hostname from Pages to Workers during a short operator window

The rollout may include a brief outage because the app is operator-only today. The implementation
should still minimize downtime by proving the Worker on its own URL before the hostname change.

## Decision

Do the framework and hosting migration together.

Do not first adopt TanStack Start while still deploying Noter production to Cloudflare Pages. That
path already failed in practice, and the current target stack is Workers Static Assets. Splitting
the work would create a temporary combination that is not the desired production platform and would
need its own debugging surface.

Use TanStack Start in SPA mode for the first production migration. Do not add SSR, server functions,
or Worker runtime handlers in this phase. Noter already uses Convex for application state and
browser-side auth flows, so the Worker can serve static assets only.

Keep the app universal enough that the same route and component tree can also run as Worker SSR on
the stable `ssr` branch. Production staying SPA-first is a deploy-safety choice, not evidence that
the app cannot render on the server. Browser-only compatibility code needed to preserve that choice
belongs in small named isomorphic utilities, not scattered route or component guards.

## Target Stack

1. React app built by TanStack Start SPA mode
2. Convex backend deployed before the frontend build when a deploy key is present
3. Cloudflare Workers Static Assets serving `dist/client`
4. Workers SPA fallback serving `/index.html` for client routes
5. repo-owned deploy scripts for production and preview-version uploads
6. Workers Builds connected to the repository after the code path is proven

## Implementation Notes

Use exact package pins for the first cutover:

1. `@tanstack/react-start@1.167.65`
2. `@tanstack/react-router@1.169.2`
3. `@tanstack/router-plugin@1.167.35`
4. `wrangler@4.90.0`

Newer package versions existed on 2026-05-16, but the repo's package freshness policy rejected the
newest `@tanstack/react-start` and `wrangler` releases. The selected versions were old enough for
the package manager policy and passed local build/dry-run validation. Because `wrangler@4.90.0`
bundles a local runtime that supports compatibility dates through 2026-05-14, `wrangler.jsonc` uses
`2026-05-14` until the pinned Wrangler version can be advanced.

Keep the app's current `@/*` import alias for this migration. TanStack Start has no required alias
convention, and shadcn is configured through `apps/noter/components.json` with `@/components`,
`@/lib/utils`, and `@/hooks`. Changing to package imports or another alias can be evaluated as a
separate repo-wide cleanup, but it is not part of the hosting cutover.

Workers Builds injects `WORKERS_CI`, `WORKERS_CI_COMMIT_SHA`, and `WORKERS_CI_BRANCH`. The app build
script uses `WORKERS_CI_BRANCH` to choose between `PROD_CONVEX_DEPLOY_KEY` on `main` and
`PREVIEW_CONVEX_DEPLOY_KEY` on non-production branches. The build environment must not set a generic
`CONVEX_DEPLOY_KEY`; the script passes the selected split key to Convex under that generic name only
for the child process.

### Exact Root SSG Prerendering

TanStack Start SPA mode produces the client assets and a server entry. Its built-in SPA shell is the
right primitive for direct client-route loads and must remain in `dist/client/index.html`, because
Workers Static Assets uses that file as the SPA fallback for client routes. Noter also needs the
root route's real landing HTML for exact `/`, so the production build writes that prerendered route
HTML to a separate `dist/client/ssg-index.html` asset.

The production build therefore runs `node ./scripts/prerender-spa-index.ts` after `vp build`. The
script imports `dist/server/server.js`, clears `TSS_SHELL` for that import/render, fetches `/` from
the built server handler, requires an OK HTML response, and writes that full route HTML to
`dist/client/ssg-index.html`. `wrangler.jsonc` still deploys only `dist/client` with
`assets.not_found_handling = "single-page-application"`, and `dist/client/index.html` stays the
normal TanStack SPA shell.

This is build-time prerendering for a static SPA deploy, not request-time SSR. It gives the landing
page immediate HTML when Cloudflare rewrites exact `/` HTML navigations to `/ssg-index.html`,
without adding a Worker request handler to production. If that zone rule is absent or disabled, the
site falls back to the normal SPA shell instead of serving stale landing HTML for every route.

The landing slogan list remains dynamic in source. The prerender step selects one slogan during the
build render, so the deployed exact-root SSG asset varies per build rather than per browser refresh.
Changing that back to per-request randomness requires request-time SSR; changing it to client-only
mutation would risk hydration or layout movement.

Do not replace this with copied static shell markup. Public, legal, static, or prerendered output
must come from the canonical React route tree, as specified in
`specs/087_WORKSPACE_LAYOUT_V2_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`.

### SSR And Data Boundaries

The `ssr` branch exists to prove the same app can run with Worker SSR enabled by config-level
change. Keep it rebased on the SPA-first branch and keep the SSR delta small.

Do not server-render browser-geometry-dependent workspace layout variants unless mobile and desktop
produce the same HTML structure and only CSS changes the presentation. If exact server and client
HTML cannot be guaranteed, prefer a fast client shell for that surface over a server-rendered layout
that visibly jumps during hydration.

Convex subscriptions and client-side large-file preservation remain separate from the SPA index
prerender. If the app later needs SSR data hydration, use the official Convex and TanStack Query
integration path for serializable query data. Do not remove app-owned large-file client cache code
unless the replacement preserves its current reason for existing: avoiding repeated large file
fetches on the client.

## Current Production Baseline

`apps/noter` currently builds as a Vite static app:

1. `vite.config.ts` uses `tanstackRouter`, `react`, and an explicit `index.html` Rollup input.
2. `src/main.tsx` manually mounts React and wraps the app providers around `RouterProvider`.
3. `src/lib/appRouter.ts` manually creates the TanStack Router instance.
4. Cloudflare build scripts branch on `CF_PAGES_BRANCH`.
5. README deployment instructions still describe Cloudflare Pages.

Generated user apps already use the Workers-shaped template. This spec applies the same direction to
Noter production itself.

## Implementation Requirements

### TanStack Start App Shell

1. Add `@tanstack/react-start`.
2. Replace the TanStack Router Vite plugin with the TanStack Start Vite plugin configured for SPA
   mode.
3. Keep TanStack Start's SPA output at `/index.html` so Workers Static Assets can use the standard
   SPA fallback.
4. Write the exact-root landing prerender to `/ssg-index.html`; route exact `/` there with a
   Cloudflare URL Rewrite Rule outside the Worker asset config.
5. Preserve the existing virtual route config and generated route tree shape.
6. Preserve router options:
   - `defaultPreload: false`
   - `notFoundMode: "root"`
   - custom `parseSearch`
   - custom `stringifySearch`
7. Move the existing provider stack into the Start root/document path without changing app behavior:
   - `AppBootErrorBoundary`
   - `OptionalThemeProvider`
   - `ConvexAuthProvider`
   - `QueryProvider`
8. Preserve font-load waiting and app boot recovery before client hydration.

### Workers Deploy Contract

1. Add `apps/noter/wrangler.jsonc`.
2. Use a current compatibility date for this migration.
3. Enable preview URLs.
4. Serve assets from `./dist/client`.
5. Set `assets.not_found_handling` to `single-page-application`.
6. Keep runtime bindings empty for this phase.
7. Do not hard-code secrets in source or config.

### Build And Deploy Scripts

1. Replace Pages branch detection with Workers build detection.
2. Keep a local app build script that runs typecheck/codegen and TanStack Start build without
   deploying Convex.
3. Keep a Cloudflare build script that:
   - rejects generic `CONVEX_DEPLOY_KEY` in the parent build environment
   - deploys Convex production from `PROD_CONVEX_DEPLOY_KEY` when `WORKERS_CI_BRANCH` is `main`
   - creates a Convex preview deployment from `PREVIEW_CONVEX_DEPLOY_KEY` when `WORKERS_CI_BRANCH`
     is a non-production branch
   - falls back to a frontend-only build for local dry runs without a deploy key
4. Add production deploy and preview upload scripts around Wrangler.
5. Use the Worker name supplied by Workers Builds when available, with one local override for
   dry-run validation.

### Documentation

1. Update production deployment docs from Pages to Workers.
2. Document the exact build and deploy commands:
   - build command: `pnpm run build`
   - production deploy command: `pnpm run deploy`
   - non-production deploy command: `pnpm run deploy:preview`
3. Document the cutover window and validation checklist.

## Rollout Plan

### Phase 1: Local Build Migration

Convert `apps/noter` to TanStack Start SPA mode and keep local preview behavior working.

Validation:

1. `pnpm dev:worktree`
2. `pnpm --filter noter check`
3. `pnpm --filter noter build`
4. browser smoke test of `/`, `/home`, `/vault/$`, `/noter.ts`, and `/noter-connect.json`

### Phase 2: Worker Dry Run

Add Workers config and deploy scripts.

Validation:

1. `CLOUDFLARE_WORKER_NAME=noter-next pnpm --filter noter deploy:dry-run`
2. `CLOUDFLARE_WORKER_NAME=noter-next pnpm --filter noter deploy:preview:dry-run`
3. inspect generated `dist/client/index.html` and `dist/client/ssg-index.html`

Current implementation result:

1. `pnpm --filter noter build:ci` passes.
2. `CLOUDFLARE_WORKER_NAME=noter-workers-migration-test pnpm --filter noter deploy:dry-run` passes
   locally.
3. `CLOUDFLARE_WORKER_NAME=noter-workers-migration-test WORKERS_CI=1 pnpm --filter noter deploy:preview:dry-run`
   passes locally.
4. Wrangler reads `apps/noter/dist/client` as the Worker Static Assets upload directory.

### Phase 3: Shadow Worker

Deploy the migrated app to a temporary Worker such as `noter-next`.

Validation:

1. unauthenticated landing routes load
2. auth redirects keep the intended origin
3. connected-machine files serve as static assets
4. Convex subscriptions connect
5. branch-preview URLs can be surfaced without Pages-only parsing

### Phase 4: Production Cutover

During a short operator window:

1. pause Pages production deploys
2. deploy the Worker production version
3. attach the production hostname to the Worker
4. remove the conflicting Pages hostname if Cloudflare requires it
5. validate the production app
6. keep the Pages project untouched until Worker production is proven

Rollback is the inverse hostname switch back to the Pages project. If the backend deploy changed
during the build, rollback must account for Convex compatibility before moving traffic.

### Phase 5: Pages Cleanup

After the Worker serves production reliably:

1. delete Pages production docs and scripts
2. remove Pages-specific preview fixtures and parser paths that are no longer used
3. close or migrate old Pages resource rows as an operator cleanup task

## Risks

### Auth Origin Mismatch

OAuth callbacks, Convex Auth site URL settings, and browser environment variables must agree with
the final production hostname. This is the main cutover risk.

Mitigation: validate the shadow Worker on its Worker URL first, then validate the production
hostname immediately after attaching it.

### Preview Metadata Drift

Current branch-preview metadata still includes Pages comment parsing. Workers Builds preview URLs
need their own source of truth before Pages code is fully deleted.

Mitigation: keep preview cleanup scoped until production hosting is proven.

### Convex Deploy Coupling

Cloudflare builds can deploy Convex before the Worker receives traffic.

Mitigation: keep backend changes backward-compatible during the cutover branch. If a breaking Convex
deploy is required, accept the operator outage explicitly and perform frontend/backend cutover in
one window.

### TanStack Start Release Candidate Churn

TanStack Start remains a release-candidate framework in the Convex docs.

Mitigation: pin exact package versions for this migration and avoid optional Start features outside
SPA mode.

## External References

1. Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
2. Cloudflare Workers SPA routing:
   https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
3. Cloudflare Workers Builds configuration:
   https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
4. Cloudflare Workers best practices:
   https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
5. TanStack Start SPA mode: https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode
6. TanStack Start hosting: https://tanstack.com/start/latest/docs/framework/react/guide/hosting
7. TanStack Start path aliases:
   https://tanstack.com/start/latest/docs/framework/react/guide/path-aliases
8. Convex with TanStack Start: https://docs.convex.dev/client/tanstack/tanstack-start/
9. shadcn `components.json` aliases: https://ui.shadcn.com/docs/components-json

## Summary

This migration should be implemented as one production-app move to TanStack Start SPA mode on
Cloudflare Workers Static Assets. The safe path is not a Pages bridge; it is a shadow Worker, a
short hostname cutover window, and then Pages cleanup after production is stable.
