# Samebase Rebrand Rollout Plan

Status: draft plan; external-state inventory updated 2026-06-20

Goal: rebrand `noter.md` to Samebase with `https://samebase.com` as the public app origin,
`samebase/samebase` as the main repository identity, `samebase/app` as the starter template source,
and `@samebase/*` as the npm package scope.

## Core Decision

- [x] `https://samebase.com` is the canonical app origin.
- [x] `https://www.samebase.com` redirects to `https://samebase.com`.
- [x] `https://noter.md` and `https://www.noter.md` redirect to `https://samebase.com` as a
      human-facing relocation signpost.
- [x] `noter.md` does not remain an operational compatibility surface.
- [x] Old machine, package, API, callback, config, state, and marker names are not maintained.
- [x] Historical docs keep historical names unless the document is still an active runbook or
      source-of-truth contract.

The redirect from `noter.md` is for people who knew the previous name. It must not imply support for
old operational paths such as `/noter.ts`, `/noter-connect.json`, `noter-sync`, `@noter-md/sync`,
`~/.noter`, `noter-origin:v1`, or `noter.md` as a repo config filename.

Use a permanent host-level relocation from every `noter.md` and `www.noter.md` path to
`https://samebase.com/`, discarding the old path and query. This keeps the human relocation signal
while preventing legacy paths from becoming supported Samebase URLs by accident.

## Target Identifier Map

- [x] Product name: `Samebase`.
- [x] Public app domain: `samebase.com`.
- [x] Browser UI origin: `https://samebase.com`.
- [x] Protocol/API origin: `https://api.samebase.com`.
- [x] Main GitHub repository: `samebase/samebase`.
- [x] Starter template GitHub repository: `samebase/app`.
- [x] Monorepo app directory: `apps/samebase`.
- [x] npm scope: `@samebase`.
- [x] App workspace package: `samebase`.
- [x] Root workspace package: `samebase-monorepo`.
- [x] Public machine package: `@samebase/sync`.
- [x] Public machine binary: `samebase-sync`.
- [x] Hosted machine script: `/samebase.ts`.
- [x] Machine connect config: `/samebase-connect.json`.
- [x] Machine state directory: `~/.samebase`.
- [x] PR automation marker: `samebase-origin:v1`.
- [x] Repo config filename: `samebase.md`.

Naming rationale: use `samebase/samebase` for the product monorepo and `samebase/app` for the
starter repository. Keep `apps/samebase` inside the monorepo. Do not introduce `samebase/template`:
the existing external shape is already `notermd/app`, and `app` is the clearer object being
exported.

## Phase 0: Freeze The Cutover Topology

- [x] Use `https://api.samebase.com` for MCP/OAuth protocol endpoints. Current production already
      uses the split origin `https://api.noter.md`, so Samebase should keep the same topology with
      the new hostname.
- [x] Use `samebase-worker` as the target public app Worker name. If the current production Worker
      cannot be renamed in-place, deploy a new `samebase-worker` and move the hostnames to it.
- [x] Rename `apps/noter` to `apps/samebase` in the same implementation pass as workspace package
      renames so app-local paths, package filters, and Cloudflare root-directory settings move
      together.
- [ ] Confirm the new support/legal contact address.
- [ ] Confirm the public social account URLs to replace `notermd` links.
- [ ] Confirm the logo/social-card direction before regenerating assets.
- [ ] Record the cutover window for Cloudflare, Convex, OAuth, Polar, and GitHub changes.

## Phase 1: Current External State

- [x] `noter.md` is Cloudflare-managed and currently serves the Noter app with HTTP 200. Nameservers
      observed: `brady.ns.cloudflare.com` and `frida.ns.cloudflare.com`.
- [x] `www.noter.md` resolves through Cloudflare and currently redirects to `https://noter.md/`.
- [x] `noter.md/noter.ts` currently serves the machine installer as TypeScript.
- [x] `noter.md/noter-connect.json` currently serves the machine connect config as JSON.
- [x] `samebase.com` is Cloudflare-managed and currently serves a separate minimal page with title
      `samebase.com` and visible copy `Lovable for devs` from the existing
      `nicu-chiciuc-samebase-86xc0t` Worker. Nameservers observed: `jaziel.ns.cloudflare.com` and
      `phoenix.ns.cloudflare.com`.
- [x] `samebase.com/robots.txt`, `samebase.com/sitemap.xml`, `samebase.com/noter.ts`, and
      `samebase.com/samebase.ts` currently fall through to that Samebase page or SPA shell instead
      of serving the rebranded app assets.
- [x] `www.samebase.com` does not currently resolve.
- [x] `api.noter.md` resolves through `convex.domains` and serves MCP/OAuth metadata advertising
      resource `https://api.noter.md/mcp`, issuer `https://api.noter.md`, authorize endpoint
      `https://api.noter.md/oauth/mcp/authorize`, token endpoint
      `https://api.noter.md/oauth/mcp/token`, and registration endpoint
      `https://api.noter.md/oauth/mcp/register`.
- [x] `cloud.noter.md` resolves through `convex.domains` and currently returns the plain Convex
      deployment response. The repo has no live references to this hostname, so treat it as an
      external Convex custom-domain inventory item to remove or replace deliberately.
- [x] `api.samebase.com` does not currently resolve.
- [x] The app Worker config in `apps/noter/wrangler.jsonc` owns Static Assets, SPA fallback, and
      preview URLs, but does not store a Worker name or custom domain route. The deploy wrapper
      reads `WRANGLER_CI_OVERRIDE_NAME` from Workers Builds or `CLOUDFLARE_WORKER_NAME` for local
      runs.
- [x] The public production build still injects `NOTER_PRERENDER_ORIGIN=https://noter.md` on main.
- [x] Cloudflare dashboard confirms the live production app Worker is `noter-worker`, not just a
      cleanup fallback.
- [x] The separate `samebase-domains` Worker is already named in `apps/domain-router/wrangler.jsonc`
      and only routes `*.json.md/*` and `*.xml.md/*`; it is not the `samebase.com` app Worker.
- [x] The `samebase-domains` Workers Builds trigger is documented with root directory
      `apps/domain-router`, build command `pnpm run build`, deploy command `pnpm run deploy`,
      version command `pnpm run build:preview`, and production branch `main`.
- [x] GitHub currently has private `noter-md/noter` and private `notermd/app` repositories visible
      to this checkout.
- [x] `samebase/samebase`, `samebase/app`, and `samebase/template` do not currently resolve through
      `gh repo view` from this checkout, so create or rename to `samebase/samebase` and
      `samebase/app`; do not create `samebase/template`.
- [x] Public npm registry checks return 404 for `@noter-md/sync`, `@noter-md/dependent`,
      `@noter-md/domain-router`, `@samebase/sync`, `@samebase/dependent`, and
      `@samebase/domain-router`. Public npm package compatibility/deprecation work is therefore not
      required unless private npm state exists outside the public registry.
- [x] The current workspace package names are `noter-monorepo`, `noter`, `@noter-md/dependent`,
      `@noter-md/sync`, `@noter-md/domain-router`, `@noter-md/agent-context`, and
      `@noter-md/onboarding-video-tools`; `@samebase/sure` is already in the Samebase scope.
- [x] Cloudflare Pages project `noter-solid` still exists, is connected to `noter-md/noter`, has
      automatic deployments enabled, and has no custom domain attached.
- [x] No provider credential, token, or secret was copied into this plan or PR text.

### Live Cloudflare Dashboard Inventory

Read-only dashboard inventory from the operator's logged-in Chrome session on 2026-06-20 confirms
these Cloudflare objects without storing account IDs, token IDs, cookies, or raw provider payloads:

- [x] Worker `noter-worker` is a Static Assets Worker connected to `noter-md/noter`. Its public
      production target is `https://noter.md`, it has custom domain `noter.md`, the
      `noter-worker.nicuchiciuc.workers.dev` production URL and preview URL pattern are public,
      Workers Logs are enabled, Workers Traces are disabled, and it has zero bindings.
- [x] Worker `nicu-chiciuc-samebase-86xc0t` is a separate Static Assets Worker connected to
      `nicu-chiciuc/samebase`. Its public production target is `https://samebase.com`, it has custom
      domain `samebase.com`, it was manually deployed with Wrangler, and both Workers Logs and
      Workers Traces are disabled.
- [x] Worker `samebase-domains` exists separately from the app and still owns `*.json.md/*` and
      `*.xml.md/*` routes only.
- [x] Cloudflare Pages project `noter-solid` is still connected to `noter-md/noter`; the dashboard
      shows `noter-solid.pages.dev` and no custom domains. Automatic deployments are enabled.
- [x] Zone `samebase.com` has exactly one DNS record: apex `samebase.com` as a proxied Worker record
      pointing at `nicu-chiciuc-samebase-86xc0t`. There is no `www.samebase.com`,
      `api.samebase.com`, MX, SPF, DKIM, or DMARC record.
- [x] Zone `noter.md` has 11 DNS records: apex `noter.md` as a proxied Worker record pointing at
      `noter-worker`; `www.noter.md` as a proxied placeholder A record created by the existing
      Cloudflare `www` redirect template; `api.noter.md` and `cloud.noter.md` CNAME records to
      `convex.domains`; three Cloudflare Email Routing MX records; one SPF TXT record; one DKIM TXT
      record; and two Convex custom-domain verification TXT records.
- [x] Zone `noter.md` has one active Redirect Rule, `Redirect from WWW to root [Template]`, which
      currently sends `https://www.*` to the same URL without `www` using a 302. It also has one
      disabled URL Rewrite Rule named `Noter exact root SSG`.
- [x] Zone `samebase.com` has no active Redirect Rules, URL Rewrite Rules, Configuration Rules,
      Origin Rules, Transform Rules, Cache Rules, Compression Rules, Page Rules, or Workers Routes.
- [x] Zones `noter.md` and `samebase.com` both show no Workers Routes; the app bindings are
      custom-domain Worker records, not route-pattern entries.
- [x] Cloudflare dashboard recommends adding `www.samebase.com` DNS plus a redirect to
      `samebase.com`, and recommends MX/SPF/DKIM/DMARC if `@samebase.com` email should receive mail.

External provider state still requiring provider-console reads before implementation: Convex custom
domain attachments for `api.noter.md` and `cloud.noter.md`, OAuth app callback settings, Polar
checkout/webhook URLs, PostHog allowed origins if configured, private npm organization state, and
GitHub organization rename settings.

## Phase 2: Public App Identity

- [ ] Replace public metadata, structured data, canonical URLs, and social URLs in
      `apps/noter/src/lib/rootHead.ts`.
- [ ] Replace page titles, descriptions, site name, canonical origin, and social image path in
      `apps/noter/src/lib/pageMetadata.ts`.
- [ ] Replace production host detection in `apps/noter/src/lib/prodUiMode.ts`.
- [ ] Replace prerender origin injection in `apps/noter/scripts/build-cloudflare.ts`.
- [ ] Replace PWA manifest name and short name in `apps/noter/public/manifest.webmanifest`.
- [ ] Replace sitemap URLs in `apps/noter/public/sitemap.xml`.
- [ ] Replace robots sitemap URL in `apps/noter/public/robots.txt`.
- [ ] Replace public landing copy in English and Romanian landing preview content.
- [ ] Add a short human-facing relocation line to the public landing surface, such as
      `Samebase was previously noter.md`, without preserving old machine/API behavior.
- [ ] Replace closed-signup and footer social links.
- [ ] Replace legal and policy copy, including operator name and contact address.
- [ ] Replace route editor examples and tests that show `https://noter.md`.
- [ ] Rename social-card and profile-banner assets or regenerate them with Samebase naming.
- [ ] Update tests that assert the old titles, canonical URLs, social URLs, or hostnames.

## Phase 3: Operational Hard Rename

- [ ] Rename `packages/sync/noter.ts` to the Samebase script name.
- [ ] Rename hosted public script output from `apps/noter/public/noter.ts` to the Samebase path.
- [ ] Update the public script mirror source in `apps/noter/noterSyncPublicScript.ts`.
- [ ] Rename `/noter.ts` constants to `/samebase.ts`.
- [ ] Rename `/noter-connect.json` constants to `/samebase-connect.json`.
- [ ] Rename `NOTER_STATE_DIRNAME` and related config path behavior to `.samebase`.
- [ ] Rename public npm package name from `@noter-md/sync` to `@samebase/sync`.
- [ ] Rename package binary from `noter-sync` to `samebase-sync`.
- [ ] Update machine-connect UI copy and commands to use only Samebase names.
- [ ] Update machine-connect tests and sync package tests.
- [ ] Delete the old public `noter.ts` asset rather than serving it as an alias.
- [ ] Delete old route/config aliases rather than redirecting or proxying them.
- [ ] Confirm `https://samebase.com/noter.ts` and `https://samebase.com/noter-connect.json` do not
      serve working legacy installer behavior.

## Phase 4: Repo, Package, And Starter Identity

- [ ] Rename root `package.json` package name and description.
- [ ] Rename `apps/noter/package.json` package name.
- [ ] Rename internal `@noter-md/*` package names to `@samebase/*`.
- [ ] Keep `@samebase/sure` unchanged except for import-path cleanup caused by neighboring package
      renames.
- [ ] Update all imports from `@noter-md/dependent` and related subpaths.
- [ ] Update root package scripts and `pnpm --filter` selectors.
- [ ] Update CI workflow package filters.
- [ ] Regenerate `pnpm-lock.yaml`.
- [ ] Rename `apps/noter` to `apps/samebase`.
- [ ] Update path helpers and tracked-file-path generated output after any app directory rename.
- [ ] Rename `scripts/export-notermd-app-manifest.ts`.
- [ ] Change starter export source from `notermd/app` to `samebase/app`.
- [ ] Rename `NOTER_TEMPLATE_GITHUB_TOKEN` to a Samebase-specific environment variable.
- [ ] Regenerate `apps/noter/convex/starterSeedManifest.generated.ts` from `samebase/app`.
- [ ] Rename generated manifest version prefix from `notermd-app-*`.
- [ ] Update starter template specs and runbooks that remain source-of-truth.
- [ ] Update GitHub canonical repository URLs in build config and metadata.
- [ ] After GitHub repo rename, update local remotes from `noter-md/noter` to `samebase/samebase`.

## Phase 5: Product Config And Internal Model Names

- [ ] Rename root `noter.md` to `samebase.md`.
- [ ] Rename `SIMPLE_VIEW_CONFIG_PATH` from `noter.md` to `samebase.md`.
- [ ] Update simple-view tests and fixtures.
- [ ] Do not read `noter.md` as a fallback config path.
- [ ] Rename user-facing `Noter-managed` copy to `Samebase-managed`.
- [ ] Rename app-internal identifiers such as `isNoterManaged` only after checking data shape and
      API blast radius.
- [ ] Add a direct Convex migration if any persisted field names need to change.
- [ ] Update dashboard, vault deletion, provisioning, and MCP/tool runtime tests after any internal
      model rename.

## Phase 6: External Provider Cutover

- [ ] Deploy the rebranded app as `samebase-worker` from the renamed main repository.
- [ ] Move `samebase.com` from `nicu-chiciuc-samebase-86xc0t` to `samebase-worker`.
- [ ] Retire or delete `nicu-chiciuc-samebase-86xc0t` after `samebase.com` is verified on
      `samebase-worker`.
- [ ] Disable or delete the `noter-solid` Cloudflare Pages project unless a current owner can name a
      Samebase purpose for it.
- [ ] Configure `www.samebase.com` DNS and redirect it to `https://samebase.com/`.
- [ ] Configure `api.samebase.com` to the Convex HTTP origin that replaces current
      `api.noter.md -> convex.domains`.
- [ ] Configure the Convex verification TXT record required for `api.samebase.com`.
- [ ] Inspect the Convex custom-domain reason for `cloud.noter.md`; if the product only needs
      `api.samebase.com`, delete `cloud.noter.md` and its verification TXT instead of creating
      `cloud.samebase.com`.
- [ ] Configure `noter.md` and `www.noter.md` as redirect-only human-facing relocation routes: every
      path redirects permanently to `https://samebase.com/` with the old path and query discarded.
- [ ] Replace the apex `noter.md` Worker DNS/custom-domain binding to `noter-worker` with a
      redirect-only setup. Use proxied redirect placeholder DNS where Cloudflare requires a record
      to activate the redirect rule.
- [ ] Replace the existing 302 `www.noter.md` to `noter.md` rule with the final permanent `noter.md`
      and `www.noter.md` to `https://samebase.com/` rule.
- [ ] Remove `api.noter.md`, `cloud.noter.md`, and their Convex verification TXT records after the
      Samebase protocol endpoints pass smoke tests.
- [ ] Move or remove Cloudflare Email Routing records for `noter.md` based on the chosen
      support/legal address; do not leave Noter mail active by default.
- [ ] Confirm old `noter.md` path redirects do not create supported legacy operational routes on
      `samebase.com`.
- [ ] Set production Convex `SITE_URL=https://samebase.com`.
- [ ] Set production Convex/Auth issuer domain to `https://api.samebase.com` where the current
      configuration uses `api.noter.md` / `CONVEX_SITE_URL`.
- [ ] Update Google/Convex Auth authorized origins and callbacks.
- [ ] Update GitHub provider OAuth callback URL.
- [ ] Update Convex provider OAuth callback URL.
- [ ] Update Cloudflare MCP OAuth callback URL.
- [ ] Update Polar checkout return URLs and webhook endpoint.
- [ ] Update Cloudflare Workers Builds environment variables that still contain Noter names or
      origins.
- [ ] Update Cloudflare Workers Builds root directory from `apps/noter` to `apps/samebase` if the
      dashboard trigger still stores the old path.
- [ ] Update Cloudflare Workers Builds project/repository wiring after the GitHub org and repo
      rename from `noter-md/noter` to `samebase/samebase`.
- [ ] Update any PostHog allowed origins or project naming if configured externally.
- [ ] Verify Cloudflare redirect status codes before and after traffic flip.

## Phase 7: Active Docs And Specs

- [ ] Update `AGENTS.md` and active operator workflow docs.
- [ ] Update active Cloudflare production and Workers specs.
- [ ] Update active connected-machine specs to Samebase-only names.
- [ ] Update active starter-template strategy spec.
- [ ] Update active PWA/installability spec.
- [ ] Update active landing and logo identity specs.
- [ ] Update active Convex production-read docs if URLs or command examples change.
- [ ] Update PR preview cleanup runbook if Worker names or cleanup defaults change.
- [ ] Do not bulk-rewrite dated `research/`, `rfcs/`, `archive/`, or incident notes.
- [ ] Add a short note to historical docs only when a reader would otherwise perform a stale
      operational action.

## Phase 8: Assets, Snapshots, And Checks

- [ ] Regenerate logo, install icon, social card, and profile banner assets.
- [ ] Rename asset files whose filenames contain `noter` when they are part of the shipped Samebase
      identity.
- [ ] Update Playwright visual snapshots for public landing, legal routes, machine connect, logo,
      and dashboard surfaces that changed.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm test:visual:linux` for visual acceptance.
- [ ] Run a fresh Samebase machine-connect install path using `/samebase.ts`.
- [ ] Confirm a fresh machine does not read or write `~/.noter`.
- [ ] Confirm old machine install commands fail rather than silently working.

## Phase 9: Cutover Smoke Tests

- [ ] `https://samebase.com/` loads the public app.
- [ ] `https://samebase.com/home` loads the authenticated app route.
- [ ] `https://samebase.com/privacy` and `/terms` show Samebase legal copy.
- [ ] `https://samebase.com/sitemap.xml` contains Samebase URLs.
- [ ] `https://www.samebase.com/` redirects to `https://samebase.com/`.
- [ ] `https://noter.md/` redirects to `https://samebase.com/`.
- [ ] `https://noter.md/some/path` redirects to `https://samebase.com/`, not to a preserved path.
- [ ] `https://samebase.com/samebase.ts` serves the current installer.
- [ ] `https://samebase.com/samebase-connect.json` serves the current connect config.
- [ ] `https://samebase.com/noter.ts` does not serve a working legacy installer.
- [ ] `https://noter.md/noter.ts` redirects to `https://samebase.com/` and does not serve a working
      legacy installer.
- [ ] `https://noter.md/noter-connect.json` redirects to `https://samebase.com/` and does not serve
      a working legacy connect config.
- [ ] `https://api.noter.md/.well-known/oauth-authorization-server` no longer advertises Noter
      endpoints; the DNS record is removed or the request fails closed.
- [ ] `https://cloud.noter.md/` no longer serves the Convex deployment unless a deliberate
      Samebase-equivalent hostname was chosen.
- [ ] Google sign-in returns to Samebase.
- [ ] GitHub provider OAuth returns to Samebase.
- [ ] Convex provider OAuth returns to Samebase.
- [ ] Cloudflare MCP OAuth returns to Samebase.
- [ ] `https://api.samebase.com/.well-known/oauth-protected-resource` advertises
      `https://api.samebase.com/mcp`.
- [ ] `https://api.samebase.com/.well-known/oauth-authorization-server` advertises issuer,
      authorize, token, and registration endpoints on `https://api.samebase.com`.
- [ ] Polar checkout and portal return to Samebase.
- [ ] Polar webhook is delivered to the expected endpoint.
- [ ] New Samebase-managed app creation exports from `samebase/app`.
- [ ] Vault deletion cleanup removes resources created after the rebrand.

## Phase 10: Post-Cutover Cleanup

- [ ] Remove old Noter-named code paths that survived only to stage the cutover.
- [ ] Remove old Noter-named tests and fixtures once Samebase equivalents cover the behavior.
- [ ] Deprecate old public npm packages if any were published.
- [ ] Archive or rename old GitHub repositories after redirects and references have settled.
- [ ] Update local development worktree and thread naming expectations.
- [ ] Confirm no shipped public asset, metadata tag, or command example still uses Noter except the
      explicit `noter.md` relocation redirect.
- [ ] Close this rollout plan or promote stable decisions into accepted specs.

## Validation Search Commands

Run these before calling the rebrand complete:

```sh
rg -n "noter\\.md|www\\.noter\\.md|api\\.noter\\.md|cloud\\.noter\\.md|preview\\.noter\\.md|notermd|noter-md|@noter-md|noter-sync|noter\\.ts|noter-connect|\\.noter|noter-origin|Noter-managed|noter-managed|\\bNoter\\b|\\bnoter\\b" \
  --glob '!node_modules/**' \
  --glob '!**/.git/**' \
  --glob '!**/dist/**' \
  --glob '!**/build/**'
```

Expected remaining matches after completion:

- historical docs that intentionally describe old Noter-era behavior
- the `noter.md` relocation redirect configuration and its tests
- third-party URLs that are genuinely outside the product rename

Every remaining live-code match needs a reason in the final PR description.
