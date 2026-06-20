# Samebase Rebrand Execution Plan

Status: draft execution plan; inventory last checked 2026-06-20

Purpose: give an operator-facing order of operations for rebranding `noter.md` to Samebase. Boxes
below mean actual work to do. Ownership of a domain, GitHub org, or npm org is not represented as a
completed checkbox.

## Recommended Starting Point

Start with a code hard-rename PR, not with Cloudflare.

The current production Worker `noter-worker` deploys the current repo and app shape. Renaming or
moving Cloudflare first would still serve code, assets, machine scripts, OAuth metadata, and copy
that say Noter. The first useful step is to make the repo build a Samebase app with no Noter
compatibility paths, then deploy that build to a new Samebase Cloudflare Worker and move domains.

First implementation PR:

- [ ] Rename the monorepo app from `apps/noter` to `apps/samebase`.
- [ ] Rename workspace package names and imports from Noter names to Samebase names.
- [ ] Rename public machine paths from `/noter.ts` and `/noter-connect.json` to `/samebase.ts` and
      `/samebase-connect.json`.
- [ ] Rename machine state/config names from `~/.noter`, `noter-sync`, `noter-origin:v1`, and
      `noter.md` config to Samebase names.
- [ ] Replace public app metadata, landing copy, legal copy, sitemap, robots, social URLs, and tests
      with Samebase-only names.
- [ ] Delete old public assets/routes instead of adding aliases.
- [ ] Prove old Noter machine paths do not work in the Samebase build.

## Final Names

These are decisions, not completed work:

| Surface                | Final name                 |
| ---------------------- | -------------------------- |
| Product                | `Samebase`                 |
| Public app             | `https://samebase.com`     |
| API/MCP/OAuth origin   | `https://api.samebase.com` |
| Main GitHub repo       | `samebase/samebase`        |
| Starter repo           | `samebase/app`             |
| Monorepo app path      | `apps/samebase`            |
| npm scope              | `@samebase`                |
| App package            | `samebase`                 |
| Root package           | `samebase-monorepo`        |
| Sync package           | `@samebase/sync`           |
| Sync binary            | `samebase-sync`            |
| Hosted machine script  | `/samebase.ts`             |
| Machine connect config | `/samebase-connect.json`   |
| Local machine state    | `~/.samebase`              |
| PR marker              | `samebase-origin:v1`       |
| Repo config file       | `samebase.md`              |

Keep `samebase/app` for the starter repository. Do not create `samebase/template`; the current
external shape is already `notermd/app`, and `app` is the clearer object being exported.

## Non-Negotiables

- Do not keep Noter machine/API/package/config compatibility.
- Do not add `noter.ts`, `noter-connect.json`, `noter-sync`, `@noter-md/*`, `~/.noter`, or
  `noter-origin:v1` aliases.
- Do not redirect `api.noter.md` to `api.samebase.com`.
- Do not preserve old paths or query strings when redirecting `noter.md`.
- Do keep `https://noter.md` and `https://www.noter.md` as human-facing relocation redirects to
  `https://samebase.com/`.

## Current External Inventory

Cloudflare:

- `noter-worker` currently serves `https://noter.md`.
- `nicu-chiciuc-samebase-86xc0t` currently serves `https://samebase.com` with the old minimal
  Samebase page.
- `samebase.com` has only one DNS record: apex `samebase.com` pointing at
  `nicu-chiciuc-samebase-86xc0t`.
- `samebase.com` does not have `www.samebase.com`, `api.samebase.com`, or mail records.
- `noter.md` has apex Worker DNS for `noter-worker`, `www.noter.md` redirect placeholder DNS,
  `api.noter.md` and `cloud.noter.md` Convex CNAMEs, Convex verification TXT records, and Cloudflare
  Email Routing records.
- `noter.md` has one active 302 redirect rule from `www` to apex. It does not yet have the final
  redirect to Samebase.
- `noter.md` and `samebase.com` have no Workers Routes; the app bindings are custom-domain Worker
  records.
- `noter-solid` is a Cloudflare Pages project connected to `noter-md/noter`. It has no custom
  domains but automatic deployments are enabled.
- `samebase-domains` is separate and only handles `*.json.md/*` and `*.xml.md/*`; it is not the app
  Worker.

GitHub and npm:

- Current visible repos are `noter-md/noter` and `notermd/app`.
- Target repos are `samebase/samebase` and `samebase/app`.
- Public npm currently has no published `@noter-md/*` or `@samebase/*` packages found by registry
  checks. If private npm packages exist, handle those separately.

Convex and API:

- `api.noter.md` currently serves MCP/OAuth metadata from Convex.
- `cloud.noter.md` currently serves the plain Convex deployment response.
- `api.samebase.com` does not currently resolve.

## Execution Order

### 1. Code Hard Rename

Goal: the repo builds a Samebase app and no longer emits Noter operational names.

- [ ] Rename `apps/noter` to `apps/samebase`.
- [ ] Rename root package metadata from `noter-monorepo` to `samebase-monorepo`.
- [ ] Rename app package metadata from `noter` to `samebase`.
- [ ] Rename internal packages from `@noter-md/*` to `@samebase/*`.
- [ ] Update all imports, package filters, lockfile entries, CI filters, and scripts.
- [ ] Rename `packages/sync/noter.ts` and generated public script output to `samebase.ts`.
- [ ] Rename connect config generation from `noter-connect.json` to `samebase-connect.json`.
- [ ] Rename sync binary from `noter-sync` to `samebase-sync`.
- [ ] Rename local state from `~/.noter` to `~/.samebase`.
- [ ] Rename PR marker from `noter-origin:v1` to `samebase-origin:v1`.
- [ ] Rename repo config from `noter.md` to `samebase.md`.
- [ ] Remove fallback reads for old config, state, script, and connect names.
- [ ] Update tests so old names fail instead of silently working.

### 2. Public App Rename

Goal: the shipped app presents only Samebase identity.

- [ ] Replace root metadata, canonical URLs, Open Graph/Twitter tags, and structured data.
- [ ] Replace page titles, descriptions, footer/social links, legal copy, and closed-signup copy.
- [ ] Replace production host detection from `noter.md` to `samebase.com`.
- [ ] Replace prerender origin from `https://noter.md` to `https://samebase.com`.
- [ ] Update `manifest.webmanifest`, `sitemap.xml`, and `robots.txt`.
- [ ] Rename or regenerate logo, install icon, social card, and profile banner assets.
- [ ] Add only one human-facing note where useful: `Samebase was previously noter.md`.
- [ ] Do not mention old machine commands or old operational URLs in new user-facing copy.

### 3. Starter Repo Rename

Goal: new app creation exports from `samebase/app`.

- [ ] Rename or create GitHub repo `samebase/app` from current `notermd/app`.
- [ ] Update starter export source from `notermd/app` to `samebase/app`.
- [ ] Rename `scripts/export-notermd-app-manifest.ts`.
- [ ] Rename `NOTER_TEMPLATE_GITHUB_TOKEN` to a Samebase-specific env var.
- [ ] Regenerate starter seed manifest from `samebase/app`.
- [ ] Rename generated manifest version prefix from `notermd-app-*`.
- [ ] Update starter-template specs and runbooks that are still active.

### 4. Main Repo And Publishing Rename

Goal: the source and package identities match Samebase before production cutover.

- [ ] Rename GitHub repo `noter-md/noter` to `samebase/samebase`.
- [ ] Update local remotes and branch protection/integration settings.
- [ ] Update Cloudflare Workers Builds repository connection after the repo rename.
- [ ] Update GitHub Actions secrets and environments whose names or values contain Noter.
- [ ] Publish or prepare `@samebase/*` packages.
- [ ] If private `@noter-md/*` packages exist, delete or deprecate them; do not ship compatibility
      wrappers.

### 5. New Samebase Cloudflare App Worker

Goal: have a Samebase app deployment ready before moving domains.

- [ ] Create or deploy `samebase-worker` from the renamed `samebase/samebase` repo.
- [ ] Configure Workers Builds root directory to `apps/samebase`.
- [ ] Configure build/deploy/version commands to match the current app Worker flow.
- [ ] Rename Cloudflare build environment variables that still contain Noter names or origins.
- [ ] Deploy `samebase-worker` without moving `samebase.com` yet.
- [ ] Verify the Worker preview URL serves Samebase app metadata, assets, sitemap, robots, and
      `/samebase.ts`.
- [ ] Verify the Worker preview URL does not serve working `/noter.ts` or `/noter-connect.json`.

### 6. Convex, API Domain, And OAuth

Goal: protocol endpoints move to `api.samebase.com` without supporting `api.noter.md`.

- [ ] Add Convex custom domain for `api.samebase.com`.
- [ ] Add required `api.samebase.com` CNAME and Convex verification TXT records in Cloudflare.
- [ ] Set production Convex `SITE_URL=https://samebase.com`.
- [ ] Set Convex/Auth issuer and protocol origin to `https://api.samebase.com`.
- [ ] Update Google/Convex Auth authorized origins and callbacks.
- [ ] Update GitHub provider OAuth callback URL.
- [ ] Update Convex provider OAuth callback URL.
- [ ] Update Cloudflare MCP OAuth callback URL.
- [ ] Update Polar checkout return URLs and webhook endpoint.
- [ ] Update PostHog allowed origins or project naming if configured.
- [ ] Decide whether `cloud.noter.md` has a current purpose. If not, plan to delete it after
      `api.samebase.com` passes smoke tests.

### 7. Move `samebase.com` To The New App

Goal: make Samebase production serve the rebranded app.

- [ ] Remove or replace the current `samebase.com` binding on `nicu-chiciuc-samebase-86xc0t`.
- [ ] Attach `samebase.com` to `samebase-worker`.
- [ ] Add `www.samebase.com` DNS.
- [ ] Add a permanent `www.samebase.com` to `https://samebase.com/` redirect.
- [ ] Verify `https://samebase.com/`, `/home`, `/privacy`, `/terms`, `/sitemap.xml`, `/samebase.ts`,
      and `/samebase-connect.json`.
- [ ] Retire or delete `nicu-chiciuc-samebase-86xc0t` after the new app is verified.

### 8. Convert `noter.md` To Redirect-Only

Goal: keep the human relocation signal and remove old operational surfaces.

- [ ] Remove `noter.md` from the app Worker binding.
- [ ] Replace apex `noter.md` Worker DNS with redirect-only Cloudflare DNS if Cloudflare needs a
      proxied record to trigger the redirect rule.
- [ ] Replace the existing 302 `www.noter.md` to `noter.md` rule with one permanent redirect rule
      for both `noter.md` and `www.noter.md`.
- [ ] Redirect every `noter.md` and `www.noter.md` path to exactly `https://samebase.com/`.
- [ ] Discard old paths and query strings in that redirect.
- [ ] Remove `api.noter.md`, `cloud.noter.md`, and their Convex verification TXT records after
      `api.samebase.com` passes smoke tests.
- [ ] Move or remove Noter Email Routing records based on the chosen Samebase support/legal address.
      Do not leave Noter mail active by default.

### 9. Delete Stale Cloudflare Objects

Goal: remove provider objects that would keep Noter alive accidentally.

- [ ] Disable or delete `noter-solid` unless a current Samebase purpose exists.
- [ ] Confirm `samebase-domains` still only handles `*.json.md/*` and `*.xml.md/*`.
- [ ] Delete old preview resources that only exist for Noter-era branches.
- [ ] Update PR preview cleanup docs if Worker names or cleanup defaults changed.

### 10. Docs, Specs, And Operator Workflows

Goal: current operational docs tell people to use Samebase.

- [ ] Update `AGENTS.md` and active operator workflow docs.
- [ ] Update active Cloudflare production and Workers specs.
- [ ] Update active connected-machine specs.
- [ ] Update active starter-template strategy spec.
- [ ] Update active PWA/installability spec.
- [ ] Update active landing/logo identity specs.
- [ ] Update Convex production-read docs if URLs or command examples change.
- [ ] Do not bulk-rewrite dated `research/`, old `rfcs/`, `archive/`, or incident notes.
- [ ] Add a note to historical docs only when a reader would otherwise perform a stale operational
      action.

### 11. Final Validation

Goal: prove the rebrand is complete and old operational paths are gone.

- [ ] Run `pnpm check`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm test:visual:linux`.
- [ ] Run a fresh Samebase machine-connect install path using `/samebase.ts`.
- [ ] Confirm a fresh machine does not read or write `~/.noter`.
- [ ] Confirm old machine install commands fail instead of working.
- [ ] Confirm `https://samebase.com/noter.ts` does not serve a working legacy installer.
- [ ] Confirm `https://noter.md/noter.ts` redirects to `https://samebase.com/` and does not serve a
      working legacy installer.
- [ ] Confirm `https://noter.md/noter-connect.json` redirects to `https://samebase.com/` and does
      not serve a working legacy config.
- [ ] Confirm `https://api.noter.md/.well-known/oauth-authorization-server` no longer advertises
      Noter endpoints.
- [ ] Confirm `https://cloud.noter.md/` no longer serves the Convex deployment unless an explicit
      Samebase replacement was chosen.
- [ ] Confirm `https://api.samebase.com/.well-known/oauth-protected-resource` advertises
      `https://api.samebase.com/mcp`.
- [ ] Confirm `https://api.samebase.com/.well-known/oauth-authorization-server` advertises issuer,
      authorize, token, and registration endpoints on `https://api.samebase.com`.

## Final Search

Run this before calling the rebrand complete:

```sh
rg -n "noter\\.md|www\\.noter\\.md|api\\.noter\\.md|cloud\\.noter\\.md|preview\\.noter\\.md|notermd|noter-md|@noter-md|noter-sync|noter\\.ts|noter-connect|\\.noter|noter-origin|Noter-managed|noter-managed|\\bNoter\\b|\\bnoter\\b" \
  --glob '!node_modules/**' \
  --glob '!**/.git/**' \
  --glob '!**/dist/**' \
  --glob '!**/build/**'
```

Expected remaining matches:

- historical docs that intentionally describe old Noter-era behavior
- the `noter.md` relocation redirect configuration and tests
- third-party URLs that are genuinely outside the product rename

Every remaining live-code match needs a reason in the final PR description.
