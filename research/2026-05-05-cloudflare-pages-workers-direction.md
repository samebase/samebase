# Cloudflare Pages To Workers Direction Research

## Document Control

- Status: Draft research
- Owner: Noter hosting, app provisioning, and recommended stack
- Created: 2026-05-05
- Related specs and references:
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `archive/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `archive/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
  - `archive/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `archive/062_NETLIFY_REMOVAL_AND_CLOUDFLARE_ONLY_HOSTING_SPEC.md`
  - `research/2026-04-08-root-route-framework-discussion-summary.md`

## Prompt

Investigate whether Cloudflare is pushing developers from Pages to Workers, especially because
TanStack Start moved from Pages-oriented Cloudflare support to Workers-oriented support, and because
the $5 Workers Paid plan does not unlock concurrent Pages builds. Capture the findings before
deciding whether Noter should migrate its app provisioning and recommended stack from Cloudflare
Pages to Workers.

## Current Finding

Cloudflare's public product direction is Workers-first, Pages-supported.

There is no public Pages removal date or deprecation notice. Pages remains documented, available on
all plans, and still receives build-image maintenance. However, Cloudflare's own product messaging
says new investment, optimization, and feature work are going into Workers. Treat Pages as a
supported but strategically aging surface until Cloudflare proves otherwise.

Do not start a Noter transition directly from this finding. The next step is a manual compatibility
pass against a real Cloudflare Workers Static Assets app because Noter currently relies on
Pages-specific provisioning, preview URLs, GitHub PR comments, dashboard links, deployment logs, and
user-facing setup copy.

## External Evidence

### Cloudflare Direction

Cloudflare's April 2025 Workers announcement is the strongest signal. It says Workers now supports
static assets and server-side rendering, developers should start with Workers, Pages will continue
to be supported, and future investment, optimizations, and feature work will be dedicated to
Workers.

That post also frames Workers Static Assets as Cloudflare bringing the best parts of Pages into
Workers: static assets, `_headers`, `_redirects`, GitHub and GitLab integration through Workers
Builds, preview URLs, and framework support.

The current migration guide is similarly direct:

1. it is named "Migrate from Pages to Workers"
2. it says static asset requests on Workers are free like Pages
3. it says Pages Functions invocations are charged at the same rate as Workers
4. it tells framework users to switch Pages-specific adapters to Workers equivalents
5. it includes an AI-assistant prompt for Pages-to-Workers migration

The compatibility matrix in that guide also shows why this is not a trivial rename. Workers has
advantages such as the Cloudflare Vite plugin, gradual deployments, Workers Logs, Logpush, Tail
Workers, source maps, Cron Triggers, Queue consumers, Image Resizing, and rate limiting. Pages still
has important advantages or differences, including custom branch aliases, more branch deploy
control, custom domains outside Cloudflare zones, and Pages plugin/file-routing behavior.

### Pricing Split

The $5 Workers Paid plan and the Cloudflare zone/site plans are separate. Cloudflare's Workers
pricing fine print says the Workers Paid plan is separate from Free, Professional, and Business
plans. Workers Builds on paid plans get 6 concurrent builds and 6,000 included build minutes.

Pages build concurrency is not unlocked by the $5 Workers plan:

1. Pages Free has 1 build at a time and 500 builds per month.
2. Pages Pro has 5 concurrent builds and 5,000 builds per month.
3. Pages Business has 20 concurrent builds and 20,000 builds per month.
4. Pages Pro is listed as $20/month billed annually or $25/month billed monthly.

So the support answer in the original discussion is materially correct: paying $5 for Workers can be
useful, but it does not buy concurrent Git-connected Pages builds. That product split creates
pressure to move projects from Pages Builds to Workers Builds if build concurrency is the pain.

### TanStack Signal

Current TanStack Start hosting docs list Cloudflare as an official hosting partner, but the deploy
target is Cloudflare Workers, not Pages.

Relevant TanStack repo history:

1. 2025-07-06: `docs(start): update hosting docs to reflect vite migration` changed the Cloudflare
   section from Pages to Workers.
2. 2025-08-02: `docs(start): fix cloudflare-workers deployment using wrangler.toml` moved the config
   away from `pages_build_output_dir` toward a Worker `main` plus static assets.
3. 2025-09-24: `Docs(Start): remove target from hosting docs` changed the deployment list from
   `cloudflare-pages` to `cloudflare-workers`.

This appears to be TanStack following Cloudflare's platform direction, not an isolated documentation
accident.

## Noter Impact

This does not only affect the current Noter frontend deployment. It affects the stack Noter
recommends and the app provisioning workflow it automates.

Current Pages-shaped dependencies include:

1. `apps/noter/convex/infraProvisioning.ts`
   - provisions Cloudflare Pages during the `ensure_cloudflare` step
   - records `cloudflare_pages_default` domain records
   - logs Pages-specific provisioning messages
2. `apps/noter/convex/hostingProviders.ts`
   - calls Cloudflare Pages APIs
   - triggers Pages deployments
   - derives fallback production URLs as `<project>.pages.dev`
3. `apps/noter/convex/cloudflarePreviewComment.ts`
   - parses Cloudflare Pages PR comments for preview URL, branch preview URL, status, logs URL, and
     commit SHA
4. `apps/noter/convex/schema.ts`
   - stores Cloudflare preview metadata and Pages-oriented domain source values
5. `apps/noter/src/content/landing-preview.md`
   - teaches users to create Cloudflare Pages deployments and explicitly avoid Workers
6. dashboard and fixture copy
   - labels project links and destructive cleanup as Cloudflare Pages actions
7. specs and RFCs
   - accepted and proposed behavior currently assumes Pages projects, Pages preview comments, Pages
     logs, and Pages deployment URLs

The migration surface is therefore:

1. provisioning APIs
2. deployment configuration
3. environment variables and secret handling
4. production URL shape
5. preview URL shape
6. PR comment/check parsing
7. dashboard links and logs
8. cleanup and deletion
9. user onboarding and recommended-stack copy
10. specs/RFCs that define current behavior

## Manual Check Plan

Before writing a transition spec, run a real throwaway Worker deployment and record the sharp edges.

Use a temporary project name such as `tmp-3bf8-workers-stack-check`.

### 1. Static App Baseline

Create a small Vite + React + TanStack Router + Convex app or reuse the current starter template.
Deploy it to Workers Static Assets using:

1. `@cloudflare/vite-plugin`
2. `wrangler.jsonc`
3. `assets.not_found_handling` for SPA routing when needed
4. Workers Builds connected to GitHub

Verify whether static navigations and static asset requests avoid Worker invocations. If the app
needs middleware or `run_worker_first`, record the request-cost impact.

### 2. Convex Environment Model

Verify how Workers Builds handles:

1. production `CONVEX_DEPLOY_KEY`
2. preview `PREVIEW_CONVEX_DEPLOY_KEY`
3. `VITE_CONVEX_URL` or generated Convex URL behavior
4. per-branch or per-environment secrets
5. build commands equivalent to `pnpm run build:cloudflare`

Noter should not migrate until production and preview Convex deploy-key wiring is at least as
reliable as the Pages path.

### 3. GitHub PR Preview Surface

Open a pull request against the throwaway app and inspect:

1. whether Workers Builds posts a PR comment
2. whether the comment has stable preview URL, branch preview URL, status, logs, and commit fields
3. whether the bot identity remains `cloudflare-workers-and-pages[bot]`
4. whether the check-run API exposes equivalent metadata
5. whether logs URLs are stable and useful for Noter's approval-gated tools

If Workers does not emit a stable PR comment, Noter should switch from parsing comments to a
first-party Cloudflare API or GitHub check-run source as part of the migration.

### 4. URL And Domain Parity

Compare Pages and Workers behavior for:

1. production URL shape
2. immutable deployment URL shape
3. branch preview URL shape
4. custom domains
5. custom branch aliases
6. custom domains outside Cloudflare zones
7. non-root routes

The Cloudflare compatibility matrix currently says Workers does not yet match Pages for every
domain/branch feature. Those gaps matter because Noter stores and displays branch previews as
product state.

### 5. Provisioning API Parity

Check whether Cloudflare's current API or MCP OAuth surface can create and manage Workers Builds
projects end to end:

1. create Worker
2. connect GitHub repository
3. set build command and output config
4. set secrets and variables
5. enable preview or non-production branch builds
6. trigger builds
7. fetch deployment status and logs
8. delete the Worker and related resources

This is the key blocker for Noter's one-click app creation. Manual dashboard success is not enough
if Noter cannot safely automate the same lifecycle.

### 6. Dashboard And Cleanup Flow

Confirm the operator-facing Cloudflare dashboard URLs for:

1. Worker overview
2. Workers Builds history
3. build logs
4. observability/logs
5. settings for Git integration and secrets
6. deletion

Then map every current "Pages project" UI label to the exact Workers concept that should replace it.

### 7. Recommended Stack Copy

If the manual path passes, update the recommended stack away from "Cloudflare Pages + Convex" toward
"Cloudflare Workers Static Assets + Convex". The copy should explain only the actionable path:

1. create or connect the GitHub repo
2. create a Cloudflare Worker from the repo
3. use Workers Builds
4. set Convex production and preview deploy keys
5. rely on free static asset serving when Worker code is not invoked
6. pay $5 for Workers Paid when Workers build concurrency or paid platform features are needed

Avoid presenting Pages as the default unless manual checks show a Workers blocker that is more
serious than the current Pages pricing/product-direction risk.

## Interim Guidance

For new Cloudflare-oriented recommendations, prefer Workers Static Assets once the manual checks
pass.

For existing Noter provisioning, keep Pages until a migration spec covers preview parity,
provisioning API parity, and cleanup. The current system has many Pages-specific assumptions that
should not be changed opportunistically.

For immediate build-concurrency pain on Pages, evaluate these options before a full migration:

1. move builds to GitHub Actions or another CI and use Pages Direct Upload
2. migrate only static sites with simple preview requirements to Workers Builds
3. upgrade Pages zones only when Pages-specific preview/domain behavior is still required and build
   concurrency is worth the $20/month plan

## Open Questions

1. Can Noter create Workers Builds from Cloudflare MCP OAuth with the same confidence as Pages
   projects?
2. Does Workers Builds expose stable PR preview metadata, or should Noter stop parsing Cloudflare
   comments?
3. Are Workers branch previews and custom branch aliases sufficient for the dashboard branch picker?
4. Does Workers support every custom-domain path Noter wants for user apps?
5. What are the exact request billing boundaries for a static Worker app with SPA fallback, headers,
   redirects, and optional API routes?
6. What migration should exist for already-provisioned Pages vaults: leave them alone, offer manual
   conversion, or add a Noter-managed migration?
7. What stack docs and generated starter content should change first if Workers becomes the
   recommended default?

## Sources

- [Cloudflare: Your frontend, backend, and database - now in one Cloudflare Worker](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)
- [Cloudflare Workers: Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Cloudflare Workers: Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Workers: Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare Workers: Limits and pricing for Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Cloudflare Workers: Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Pages: Limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages pricing](https://pages.cloudflare.com/)
- [Cloudflare Pages: Overview](https://developers.cloudflare.com/pages/)
- [Cloudflare changelog: Build image policies for Workers Builds and Cloudflare Pages](https://developers.cloudflare.com/changelog/post/2025-12-01-build-image-policies-dev-plat/)
- [TanStack Start hosting docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [TanStack commit: update hosting docs to reflect Vite migration](https://github.com/TanStack/router/commit/ae2e919ebf844439dec8b24a9f3beeabb2be1109)
- [TanStack commit: fix cloudflare-workers deployment using wrangler.toml](https://github.com/TanStack/router/commit/75615f3994bd2f0f249c3b1dfe5c0cc520a9314c)
- [TanStack commit: remove target from hosting docs](https://github.com/TanStack/router/commit/06839407b9246f406615ba529c35b8fed8e753c1)
