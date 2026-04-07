# 084 Cloudflare Pages Monorepo Preview Autodeploy Spec

## Document Control

- Status: Draft
- Owner: Local repo deploy workflow
- Last updated: 2026-04-08
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
- Related RFCs:
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `rfcs/072_CLOUDFLARE_TUNNEL_LOCAL_ANON_PREVIEW_RESEARCH.md`

## Summary

Automate Cloudflare Pages project setup for deployable apps inside this monorepo
so each app gets its own Pages project and PR preview URL without manual
dashboard work.

At the same time, avoid burning Pages build quota on unrelated pushes by making
build triggering path-aware.

## Problem

Today repo-app preview setup is manual.

That creates two issues:

1. preview projects drift from repo reality because the source of truth lives in
   the Cloudflare dashboard
2. naive Git-integrated Pages projects in a monorepo can all build on the same
   push, even when only one app changed

The free Pages plan currently allows 500 builds per month per account, so this
needs an explicit quota-aware design.

## Initial Direction

1. Keep Git-integrated Pages projects so PR comments and branch preview URLs
   continue to work.
2. Store deployable-app config in repo and sync it to Cloudflare through an
   idempotent script.
3. Use Pages root-directory and path-filter configuration so unrelated pushes
   skip builds.
4. Treat GitHub Action-driven direct upload as a fallback only if Git
   integration cannot express the needed controls.

## Verified Constraints

### Cloudflare behavior

1. Cloudflare Pages supports multiple projects connected to the same repository
   with different root directories and build commands.
2. In a monorepo, Cloudflare will otherwise trigger all connected Pages projects
   on every repo push by default.
3. Build watch paths can include and exclude path patterns so Pages skips builds
   when a push does not touch relevant files.
4. Preview branch controls can stay `all`, disable previews entirely, or switch
   to `custom` include/exclude patterns.
5. Cloudflare currently allows up to 5 Pages projects per repository by default.
6. Cloudflare's Free plan currently allows up to 500 builds per month per
   account.

### Cloudflare edge cases that still matter

Build watch paths are not a perfect quota cap. Pages bypasses path matching and
builds anyway when:

1. the push event has 0 file changes
2. the push event has 3000+ file changes
3. the push event has 20+ commits

That means large rebases, large merges, or intentional empty pushes can still
spend quota even with correct path filters.

## Investigation Log

- 2026-04-08: Checked current Noter Cloudflare provisioning. The existing
  `apps/noter/convex/hostingProviders.ts` flow already sets
  `preview_deployment_setting: "all"` for noter-managed vault repos, but that
  path is user-vault provisioning, not monorepo app preview automation.
- 2026-04-08: Checked repo automation. `.github/workflows/ci.yml` has CI only;
  there is no repo-owned Pages project sync or deploy workflow yet.
- 2026-04-08: Checked repo structure. The immediately relevant deployable app
  roots are `apps/noter` and `apps/noter-starter-template`, so monorepo-aware
  build filtering already matters.
- 2026-04-08: Verified Cloudflare monorepo behavior. Multiple projects can share
  one repo, but Cloudflare will build every connected project on each push
  unless root-specific watch settings are added.
- 2026-04-08: Verified Cloudflare API coverage. The Pages create/update project
  API supports `build_config.root_dir`, `source.config.path_includes`,
  `source.config.path_excludes`, `source.config.preview_branch_includes`,
  `source.config.preview_branch_excludes`, and
  `source.config.preview_deployment_setting`, so this does not need to stay a
  dashboard-only manual step.

## Problems Encountered And Attempts

### 1. Manual dashboard setup drifts from the repo

Problem:

- Today the Cloudflare dashboard is the source of truth for repo-app preview
  setup.

Attempt:

- Searched the repo for an existing sync workflow or Cloudflare Pages project
  manifest.

Outcome:

- None exists for monorepo app previews yet, so project settings can drift from
  code and from each other.

### 2. Root directory alone is not enough

Problem:

- A first guess was that per-app `root_dir` might be sufficient.

Attempt:

- Checked Cloudflare monorepo docs and existing repo setup.

Outcome:

- Rejected. Cloudflare explicitly documents that in a monorepo every connected
  project will build on any push by default. `root_dir` controls where the build
  runs, but not whether the build should trigger.

### 3. Direct Upload looked tempting, but breaks the current preview model

Problem:

- GitHub Actions path filters plus Direct Upload would be easy to reason about.

Attempt:

- Compared that option against how Noter already discovers preview URLs.

Outcome:

- Rejected as the primary path. Current branch preview UX depends on
  Cloudflare's Git-integrated PR comments, and the accepted dashboard preview
  spec is built around parsing those comments. A direct-upload-only flow would
  move us away from that source of truth and add more custom glue.

### 4. "Only deploy when the app changes" is wider than the app folder

Problem:

- For this repo, an app build depends on more than files under `apps/<name>`.

Attempt:

- Traced `apps/noter` build-time inputs in the repo.

Outcome:

- `apps/noter` already reads shared and root-owned inputs such as
  `packages/sync/noter.js`, `scripts/readPackageVersion.js`, and root content
  like `slogans.md`. So watch paths cannot be just `apps/noter/*`; they need a
  conservative shared-input list or we risk stale previews after real app
  changes.

### 5. Path filters reduce spend, but do not fully bound it

Problem:

- The user goal is to stay under the Free-plan 500-build budget.

Attempt:

- Read the current Cloudflare Pages limits and build-watch-path rules.

Outcome:

- Path filters are necessary, but not sufficient as a hard cap because large or
  unusual push shapes bypass them.

## Recommendation

Use Git-integrated Cloudflare Pages projects, managed by a repo-owned manifest
and an idempotent sync script.

### Proposed repo shape

1. Add a small manifest describing deployable repo apps, for example:
   - app identifier
   - Cloudflare project name
   - root directory
   - build command
   - destination directory
   - path include/exclude lists
   - preview branch controls
2. Add a sync script that reads the manifest and ensures each Pages project
   exists and matches repo config through the Cloudflare API.
3. Treat that manifest as the source of truth instead of ad hoc dashboard
   clicks.

### Why this shape

1. It preserves Git-integrated PR comments and per-project preview URLs.
2. It keeps the configuration reviewable in Git.
3. It uses Cloudflare's native monorepo controls instead of rebuilding them in
   GitHub Actions.
4. It stays compatible with the existing Noter preview-link model for
   Cloudflare-backed previews.

### Recommended defaults

1. Start with `preview_deployment_setting: "all"` and control spend primarily
   with path filters.
2. Add custom preview branch include/exclude rules only if branch volume, not
   path volume, becomes the dominant source of waste.
3. Prefer conservative include lists over overly narrow ones. A few extra builds
   are safer than silently skipping a deploy after a real app-affecting change.
4. Start with the two current deployable apps:
   - `apps/noter`
   - `apps/noter-starter-template`

## Proposed Rollout

### Phase 1: Manifest and sync script

1. Define the repo-owned project manifest.
2. Add a script that does idempotent Pages project `GET` / `POST` / `PATCH`
   sync.
3. Keep the first version operator-invoked so we can inspect the diff shape
   before automating it.

### Phase 2: Configure one app first

1. Move `apps/noter` to the manifest-managed flow.
2. Verify that:
   - PR preview comments still appear
   - unrelated pushes no longer trigger `apps/noter` builds
   - expected shared-input changes still trigger builds

### Phase 3: Expand to the starter template

1. Add `apps/noter-starter-template` once the config shape is proven.
2. Revisit branch filters only if build volume still trends too high.

## External References

- [Cloudflare Pages monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/)
- [Cloudflare Pages build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)
- [Cloudflare Pages branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

## Open Questions

1. Should Pages project provisioning happen from a local ops script, GitHub
   Action, or both?
2. Should preview branches stay `all` with path filters, or switch to `custom`
   and explicitly exclude noisy branch patterns?
3. Do we want one shared naming convention like `noter-monorepo-<app>`, or
   explicit per-app Cloudflare project names?
