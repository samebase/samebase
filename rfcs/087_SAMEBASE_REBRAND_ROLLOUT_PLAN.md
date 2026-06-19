# Samebase Rebrand Rollout Plan

Status: draft plan

Goal: rebrand `noter.md` to Samebase with `https://samebase.com` as the public app origin,
`samebase/samebase` as the main repository identity, `samebase/app` as the starter template source,
and `@samebase/*` as the npm package scope.

## Core Decision

- [ ] `https://samebase.com` is the canonical app origin.
- [ ] `https://www.samebase.com` redirects to `https://samebase.com`.
- [ ] `https://noter.md` and `https://www.noter.md` redirect to `https://samebase.com` as a
      human-facing relocation signpost.
- [ ] `noter.md` does not remain an operational compatibility surface.
- [ ] Old machine, package, API, callback, config, state, and marker names are not maintained.
- [ ] Historical docs keep historical names unless the document is still an active runbook or
      source-of-truth contract.

The redirect from `noter.md` is for people who knew the previous name. It must not imply support for
old operational paths such as `/noter.ts`, `/noter-connect.json`, `noter-sync`, `@noter-md/sync`,
`~/.noter`, `noter-origin:v1`, or `noter.md` as a repo config filename.

## Target Identifier Map

- [ ] Product name: `Samebase`.
- [ ] Public app domain: `samebase.com`.
- [ ] Protocol/API origin, if kept split from the app origin: `api.samebase.com`.
- [ ] Main GitHub repository: `samebase/samebase`.
- [ ] Starter template GitHub repository: `samebase/app`.
- [ ] npm scope: `@samebase`.
- [ ] App workspace package: `samebase`.
- [ ] Root workspace package: `samebase-monorepo`.
- [ ] Public machine package: `@samebase/sync`.
- [ ] Public machine binary: `samebase-sync`.
- [ ] Hosted machine script: `/samebase.ts`.
- [ ] Machine connect config: `/samebase-connect.json`.
- [ ] Machine state directory: `~/.samebase`.
- [ ] PR automation marker: `samebase-origin:v1`.
- [ ] Repo config filename: `samebase.md`.

## Phase 0: Freeze The Cutover Topology

- [ ] Confirm whether MCP/OAuth protocol endpoints should use `https://api.samebase.com` or stay on
      `https://samebase.com`.
- [ ] Confirm the Cloudflare Worker name for the public app after the rebrand.
- [ ] Confirm whether the repo directory `apps/noter` should be renamed to `apps/samebase` in the
      same PR as package renames.
- [ ] Confirm the new support/legal contact address.
- [ ] Confirm the public social account URLs to replace `notermd` links.
- [ ] Confirm the logo/social-card direction before regenerating assets.
- [ ] Record the cutover window for Cloudflare, Convex, OAuth, Polar, and GitHub changes.

## Phase 1: Inventory External State

- [ ] Identify the current production Cloudflare Worker that serves the app.
- [ ] Identify the current Cloudflare Workers Builds project and branch settings.
- [ ] Identify current custom domains attached to the app Worker.
- [ ] Identify the Cloudflare zone state for `samebase.com`.
- [ ] Identify the Cloudflare redirect mechanism that will send `noter.md` traffic to
      `samebase.com`.
- [ ] Identify production Convex deployment, preview deployment policy, and current environment
      variables.
- [ ] Record current values that must change without writing secrets into this repo: `SITE_URL`,
      provider OAuth redirect URLs, Polar return URLs, and webhook URLs.
- [ ] Identify Google/Convex Auth authorized origins and callbacks.
- [ ] Identify GitHub provider OAuth callback settings.
- [ ] Identify Convex provider OAuth callback settings.
- [ ] Identify Cloudflare MCP OAuth callback settings.
- [ ] Identify Polar checkout return allowlist and webhook endpoint settings.
- [ ] Identify Resend/domain email setup if Samebase email sending becomes part of launch.
- [ ] Confirm no provider credential, token, or secret is copied into this plan or PR text.

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
- [ ] Update all imports from `@noter-md/dependent` and related subpaths.
- [ ] Update root package scripts and `pnpm --filter` selectors.
- [ ] Update CI workflow package filters.
- [ ] Regenerate `pnpm-lock.yaml`.
- [ ] Decide and execute `apps/noter` to `apps/samebase` directory rename if it is in scope.
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

- [ ] Attach `samebase.com` to the main app Worker.
- [ ] Attach or redirect `www.samebase.com` to the canonical app origin.
- [ ] Configure `noter.md` and `www.noter.md` as redirect-only human-facing relocation routes.
- [ ] Confirm `noter.md` path redirects do not create supported legacy operational routes on
      `samebase.com`.
- [ ] Set production Convex `SITE_URL=https://samebase.com`.
- [ ] Keep or intentionally update `CONVEX_SITE_URL` based on the chosen Convex HTTP origin.
- [ ] Update Google/Convex Auth authorized origins and callbacks.
- [ ] Update GitHub provider OAuth callback URL.
- [ ] Update Convex provider OAuth callback URL.
- [ ] Update Cloudflare MCP OAuth callback URL.
- [ ] Update Polar checkout return URLs and webhook endpoint.
- [ ] Update Cloudflare Workers Builds environment variables that still contain Noter names or
      origins.
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
- [ ] `https://noter.md/` redirects to `https://samebase.com/`.
- [ ] `https://noter.md/some/path` redirects to the corresponding Samebase path or the chosen
      relocation target.
- [ ] `https://samebase.com/samebase.ts` serves the current installer.
- [ ] `https://samebase.com/samebase-connect.json` serves the current connect config.
- [ ] `https://samebase.com/noter.ts` does not serve a working legacy installer.
- [ ] Google sign-in returns to Samebase.
- [ ] GitHub provider OAuth returns to Samebase.
- [ ] Convex provider OAuth returns to Samebase.
- [ ] Cloudflare MCP OAuth returns to Samebase.
- [ ] MCP well-known, authorize, token, and resource checks use the chosen Samebase origin.
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
rg -n "noter\\.md|www\\.noter\\.md|preview\\.noter\\.md|notermd|noter-md|@noter-md|noter-sync|noter\\.ts|noter-connect|\\.noter|noter-origin|Noter-managed|noter-managed|\\bNoter\\b|\\bnoter\\b" \
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
