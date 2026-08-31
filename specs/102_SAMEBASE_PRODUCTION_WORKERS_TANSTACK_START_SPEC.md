# Samebase Production Workers And TanStack Start Migration Spec

## Document Control

- Status: Accepted implementation plan
- Owner: Samebase production hosting
- Created: 2026-05-16
- Last updated: 2026-08-28
- Related:
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `research/2026-05-05-cloudflare-pages-workers-direction.md`
  - `research/2026-05-15-samebase-workers-provisioning-migration.md`
  - `apps/samebase/scripts/generate-cloudflare-redirects.ts`
  - `apps/samebase/scripts/strip-public-prerender-modulepreloads.ts`

## Summary

Move the Samebase production app from the current Cloudflare Pages static Vite deploy to Cloudflare
Workers Static Assets and TanStack Start in one rollout.

The easiest acceptable migration is a single app cutover:

1. convert the production app from TanStack Router-only Vite to TanStack Start SPA mode
2. add a Workers-owned deploy contract with `wrangler.jsonc`
3. keep the browser app client-first and keep Convex as the backend
4. validate a shadow Worker before touching the `samebase.com` production hostname
5. switch the hostname from Pages to Workers during a short operator window

The rollout may include a brief outage because the app is operator-only today. The implementation
should still minimize downtime by proving the Worker on its own URL before the hostname change.

## Decision

Do the framework and hosting migration together.

Do not first adopt TanStack Start while still deploying Samebase production to Cloudflare Pages.
That path already failed in practice, and the current target stack is Workers Static Assets.
Splitting the work would create a temporary combination that is not the desired production platform
and would need its own debugging surface.

Use TanStack Start in SPA mode for the first production migration. Do not add SSR, server functions,
or Worker runtime handlers in this phase. Samebase already uses Convex for application state and
browser-side auth flows, so the Worker can serve static assets only.

For the public landing route, prefer SSG over request-time SSR and over a plain SPA shell. SSG keeps
hosting cheaper and operationally simpler than SSR while still giving exact `/` useful first-load
HTML instead of waiting for the browser to boot the SPA before the headline appears.

Keep the app universal enough that the same route and component tree can also run as request-time
Worker SSR on the stable `ssr` branch. Production staying prerendered-SPA-first is a deploy-safety
choice, not evidence that the app cannot render on the server. Browser-only compatibility code
needed to preserve that choice belongs in small named isomorphic utilities, not scattered route or
component guards.

## Target Stack

1. React app built by TanStack Start SPA mode
2. Convex backend deployed before the frontend build when a deploy key is present
3. Cloudflare Workers Static Assets serving `dist/client`
4. Workers SPA fallback serving `/index.html` for client routes
5. repository-owned deploy scripts for production and preview-version uploads
6. Workers Builds connected to the repository after the code path is proven

## Implementation Notes

Use exact package pins for the first cutover:

1. `@tanstack/react-start@1.167.65`
2. `@tanstack/react-router@1.169.2`
3. `@tanstack/router-plugin@1.167.35`
4. `wrangler@4.90.0`

Newer package versions existed on 2026-05-16, but the repository's package freshness policy rejected
the newest `@tanstack/react-start` and `wrangler` releases. The selected versions were old enough
for the package manager policy and passed local build/dry-run validation. Because `wrangler@4.90.0`
bundles a local runtime that supports compatibility dates through 2026-05-14, `wrangler.jsonc` uses
`2026-05-14` until the pinned Wrangler version can be advanced.

Keep the app's current `@/*` import alias for this migration. TanStack Start has no required alias
convention, and shadcn is configured through `apps/samebase/components.json` with `@/components`,
`@/lib/utils`, and `@/hooks`. Changing to package imports or another alias can be evaluated as a
separate repository-wide cleanup, but it is not part of the hosting cutover.

Workers Builds injects `WORKERS_CI`, `WORKERS_CI_COMMIT_SHA`, and `WORKERS_CI_BRANCH`. The app build
script uses `WORKERS_CI_BRANCH` to choose the production or preview deployment. Each Builds trigger
provides its scoped value as `CONVEX_DEPLOY_KEY`. The script keeps `PREVIEW_CONVEX_DEPLOY_KEY` as a
temporary fallback for an old shared dashboard configuration. Preview builds must require a
preview-scoped key. The Workers Builds variable table does not store `VITE_CONVEX_URL`;
`convex deploy --cmd` supplies the selected production or preview deployment URL to the child build
command. After building the app and immediately before Convex pushes functions, the command compares
`WORKERS_CI_COMMIT_SHA` with the current remote head of `WORKERS_CI_BRANCH`. A stale build must fail
without deploying Convex. This protects both production and named branch previews from an older
concurrent Workers Build finishing after a newer one. The guard adds one authenticated
`git ls-remote` request per provider build. It is not an atomic compare-and-swap: a branch can still
advance in the short interval between the Git check and Convex's internal push. Eliminating that
residual race requires provider-side serialization or a Convex source-commit concurrency primitive.

### Static Page Prerendering And SPA Shell

TanStack Start SPA mode produces the client assets, an SPA shell, and static prerenders for selected
routes during `vp build`. The SPA shell is written to `dist/client/index.html`. The public landing
route is prerendered to `dist/client/_landing.html`, and non-root public pages are prerendered to
their route `index.html` files, such as `dist/client/terms/index.html`,
`dist/client/privacy/index.html`, and `dist/client/logo/index.html`.

The production build does not run request-time SSR and does not run a separate root-prerender
helper. All static HTML comes from the canonical TanStack route tree at build time. Cloudflare
Workers Static Assets deploys only `dist/client`, and the tagged generated block in
`apps/samebase/public/_redirects` owns the exact prerender aliases. User-owned exact redirects may
live outside that block. Unknown app-route navigations use Workers' `single-page-application`
fallback to the SPA shell at `/index.html`.

For a fallback request such as `/repo/samebase/samebase`, Cloudflare sends `dist/client/index.html`
without changing the URL in the browser. TanStack built this file from `/`, so it contains the
workspace shell for `/` and no route page. React's first browser render must create that same
content. If the first render immediately uses `/repo/samebase/samebase`, the URL field, workspace
data, and route page differ from the built HTML. React then reports a hydration error and replaces
the page.

Samebase therefore uses `/` for the URL field and route-dependent workspace data during the first
browser render of the SPA shell. It also omits the requested route page. After React attaches to the
existing HTML, Samebase uses the real browser URL and renders the requested route page. A public
route with its own prerendered HTML does not use this fallback sequence.

Generated prerender file names are not page URLs. Each direct file URL redirects to the canonical
route before a `200` alias serves the file. For example, `/terms/index.html` redirects to `/terms`,
and `/_landing.html` redirects to `/`. This keeps the browser route equal to the route that produced
the HTML.

`apps/samebase/e2e/spa-shell-hydration.spec.ts` serves the built shell at a real fallback route and
fails when React reports hydration recovery.

As TanStack Start writes each configured public prerender, its success hook removes
`<link rel="modulepreload">` hints. Cold public visits should let HTML and CSS reach first paint
before hydration chunks compete for bandwidth. The hook must preserve the module entry script that
hydrates the page, must fail if any `modulepreload` reference remains in public prerendered HTML,
and must not run for the separate SPA mask page at `dist/client/index.html`.

This section describes the production branch. The stable `ssr` proof branch keeps request-time
Worker SSR enabled for unmatched app routes, but it should still prerender public routes at build
time. The SSR branch must not reuse the production SPA shell or the production `_redirects` aliases:
its root prerender should emit `dist/client/index.html`, and Cloudflare Static Assets should serve
matching prerendered files before falling through to the Worker.

Cloudflare Workers `_redirects` rules are first-match and are followed even when an asset exists, so
the `_redirects` file must not include a broad `/*` fallback or generated-asset pass-through rules.
Those routes caused deployed Workers to proxy hashed CSS and JavaScript requests to HTML. Keep the
generated `_redirects` block limited to exact prerender aliases and let Workers Static Assets serve
matching files directly.

Disable Workers Static Assets `html_handling` for this deploy shape. The `_redirects` rules proxy to
explicit `.html` files, and the default HTML handling redirects those targets back to extensionless
paths before the proxy can serve the intended asset.

The landing slogan list remains dynamic in source. The build/prerender step selects one slogan
during the build, so the deployed exact-root SSG asset varies per build rather than per browser
refresh. The selection is derived from the app build identity and injected through the typed build
config constant so the client bundle and prerendered HTML agree. The SPA runtime uses the same
build-selected slogan and must not rerun slogan selection in route loaders, hydration, client
navigation, or browser refreshes. Changing that back to per-request randomness requires request-time
SSR; changing it to client-only mutation would risk hydration or layout movement.

Do not replace this with copied static shell markup. Public, legal, static, or prerendered output
must come from the canonical React route tree, as specified in
`specs/087_SIDEBAR_LAYOUT_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`.

### SSR And Data Boundaries

The `ssr` branch exists to prove the same app can run with request-time Worker SSR enabled by
config-level change. Keep it rebased on the SPA-first branch and keep the SSR delta small.

The SSR branch is not a second prerendered-SPA build. It is a hybrid Static Assets plus Worker SSR
proof. Its single config commit must:

1. add `@cloudflare/vite-plugin` to `apps/samebase/vite.config.ts` and register
   `cloudflare({ viteEnvironment: { name: "ssr" } })`;
2. remove the production branch's `spa` TanStack Start option because the Worker handles unmatched
   routes instead of a client-only SPA fallback;
3. keep `pages` and `prerender` enabled for public routes, remapping the root page from the
   production-only `/_landing.html` alias to `/index.html`;
4. remove the copied `dist/client/_redirects` file from the SSR build output so Cloudflare's local
   asset server does not rewrite prerender requests during `vp build`;
5. add `"main": "@tanstack/react-start/server-entry"` and `"compatibility_flags": ["nodejs_compat"]`
   to `apps/samebase/wrangler.jsonc`; and
6. keep `"assets": { "directory": "./dist/client" }`, set `assets.html_handling` to
   `drop-trailing-slash`, and remove `assets.not_found_handling = "single-page-application"` so
   missing app routes invoke the Worker instead of serving a client-only shell.

With the Cloudflare Vite plugin active, the copied production `_redirects` file is applied during
TanStack Start prerendering. If the SSR branch keeps the production exact `/` rewrite, the prerender
request can be sent to `/_landing.html` before that output exists, causing the build to fail with a
`404` for `/`. The fix is to remove that SSR-branch redirect artifact and serve prerendered HTML
through Cloudflare Static Assets, not to disable prerendering.

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

`apps/samebase` currently builds as a Vite static app:

1. `vite.config.ts` uses `tanstackRouter`, `react`, and an explicit `index.html` Rollup input.
2. `src/main.tsx` manually mounts React and wraps the app providers around `RouterProvider`.
3. `src/lib/appRouter.ts` manually creates the TanStack Router instance.
4. Cloudflare build scripts branch on `CF_PAGES_BRANCH`.
5. README deployment instructions still describe Cloudflare Pages.

Generated user apps already use the Workers-shaped template. This spec applies the same direction to
Samebase production itself.

## Implementation Requirements

### TanStack Start App Shell

1. Add `@tanstack/react-start`.
2. Replace the TanStack Router Vite plugin with the TanStack Start Vite plugin configured for SPA
   mode.
3. Keep TanStack Start's SPA shell output at `/index.html` by configuring the installed plugin with
   `spa.maskPath = "/#__noter-spa-shell"` and `spa.prerender.outputPath = "/index"`. The hash marker
   keeps the shell request on the public root route while staying distinct from the explicit `/`
   prerender entry.
4. Prerender production-available public routes through TanStack Start's `pages` config, including
   the public landing route to `/_landing.html` and non-root public routes to route `index.html`
   files.
5. Preserve the existing virtual route config and generated route tree shape.
6. Preserve router options:
   - `defaultPreload: false`
   - `notFoundMode: "root"`
   - custom `parseSearch`
   - custom `stringifySearch`
7. Strip modulepreload hints from configured public prerenders through TanStack Start's prerender
   success hook, while leaving the separate SPA mask page at `dist/client/index.html` unchanged.
8. Move the existing provider stack into the Start root/document path without changing app behavior:
   - `AppBootErrorBoundary`
   - `OptionalThemeProvider`
   - `ConvexAuthProvider`
   - `QueryProvider`
9. Preserve font-load waiting and app boot recovery before client hydration.

### Workers Deploy Contract

1. Add `apps/samebase/wrangler.jsonc`.
2. Use a current compatibility date for this migration.
3. Enable preview URLs.
4. Serve assets from `./dist/client`.
5. Set `assets.not_found_handling = "single-page-application"` so unmatched app-route navigations
   serve the SPA shell from `/index.html` without routing generated assets through `_redirects`.
6. Set `assets.html_handling` to `none` so `_redirects` 200 rewrites can serve explicit `.html`
   files.
7. Generate the exact prerender alias block in `apps/samebase/public/_redirects` from the same
   public prerender page list used by TanStack Start, and preserve user-owned redirects outside the
   tagged block.
8. Keep runtime bindings empty for this phase.
9. Do not hard-code secrets in source or config.

### Build And Deploy Scripts

1. Replace Pages branch detection with Workers build detection.
2. Keep a local app build script that runs typecheck/codegen and TanStack Start build without
   deploying Convex.
3. Keep a Cloudflare build script that:
   - deploys Convex production from `CONVEX_DEPLOY_KEY` when `WORKERS_CI_BRANCH` is `main`
   - creates or reuses a named Convex preview deployment from the preview trigger's
     `CONVEX_DEPLOY_KEY` when `WORKERS_CI_BRANCH` is a non-production branch
   - accepts `PREVIEW_CONVEX_DEPLOY_KEY` first as a temporary compatibility source on a
     non-production branch
   - runs the idempotent `devAuth:seedPasswordAccount` action after every successful preview deploy,
     including preview reuse, without relying on preview creation
   - uses `DEV_SEED_GITHUB_API_KEY` only in preview deployments to discover the matching GitHub user
     and the configured GitHub App installations that user can manage, without storing the key or a
     GitHub sign-in or user authorization record
   - creates initial memberships for the personal `nicu-chiciuc` owner, the `samebase` organization,
     and the `samebase-live-tests` organization; later seed runs preserve organizations that the
     user connects through the preview UI
   - lets only the exact seeded password account list and connect other manageable installations;
     the backend verifies current management access before it connects an installation, and
     repository access continues to use GitHub App installation authentication
   - lets that account create repositories for the personal `nicu-chiciuc` owner with
     `DEV_SEED_GITHUB_API_KEY`; the backend verifies that the key manages the matching personal
     owner before admission and again during provisioning, and never stores the key as OAuth data
   - attaches the current `DEV_SEED_*` Convex and Cloudflare provider credentials only to
     `samebase-live-tests`
   - attaches the main provider accounts to `samebase` and `nicu-chiciuc`; preview defaults must
     provide `DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY`, `DEV_SEED_SAMEBASE_CONVEX_TEAM_ID`,
     `DEV_SEED_SAMEBASE_CLOUDFLARE_API_KEY`, and `DEV_SEED_SAMEBASE_CLOUDFLARE_ACCOUNT_ID`
   - creates no repositories during seeding
   - rejects non-production builds that are missing the preview trigger's `CONVEX_DEPLOY_KEY`
   - fails before the Convex push when `WORKERS_CI_COMMIT_SHA` is no longer the remote branch head
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
   - Worker Previews private-beta command: `pnpm run deploy:worker-preview`
3. Document the cutover window and validation checklist.

## Rollout Plan

### Phase 1: Local Build Migration

Convert `apps/samebase` to TanStack Start SPA mode and keep local preview behavior working.

Validation:

1. `pnpm dev:worktree`
2. `pnpm --filter samebase check`
3. `pnpm --filter samebase build`
4. browser smoke test of `/`, `/repo`, and `/repo/$`

### Phase 2: Worker Dry Run

Add Workers config and deploy scripts.

Validation:

1. `CLOUDFLARE_WORKER_NAME=noter-next pnpm --filter samebase deploy:dry-run`
2. `CLOUDFLARE_WORKER_NAME=noter-next pnpm --filter samebase deploy:preview:dry-run`
3. inspect generated `dist/client/index.html`, `dist/client/_landing.html`,
   `dist/client/logo/index.html`, `dist/client/terms/index.html`, `dist/client/privacy/index.html`,
   and `dist/client/_redirects`
4. confirm public prerendered HTML contains no `modulepreload` references and
   `dist/client/index.html` remains the SPA fallback shell

Current implementation result:

1. `pnpm --filter samebase build:ci` passes.
2. `CLOUDFLARE_WORKER_NAME=noter-workers-migration-test pnpm --filter samebase deploy:dry-run`
   passes locally.
3. `CLOUDFLARE_WORKER_NAME=noter-workers-migration-test WORKERS_CI=1 pnpm --filter samebase deploy:preview:dry-run`
   passes locally.
4. Wrangler reads `apps/samebase/dist/client` as the Worker Static Assets upload directory.

### Phase 3: Shadow Worker

Deploy the migrated app to a temporary Worker such as `noter-next`.

Validation:

1. unauthenticated landing routes load
2. auth redirects keep the intended origin
3. public documentation and install assets serve as static assets
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
