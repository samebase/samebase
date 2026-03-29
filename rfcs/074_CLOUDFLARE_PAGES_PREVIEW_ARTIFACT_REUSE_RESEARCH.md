# 074 Cloudflare Pages Preview Artifact Reuse Research

## Document Control

- Status: Research note
- Owner: Hosting / CI / Cloudflare
- Last updated: 2026-03-30
- Depends on:
  - `apps/noter/convex/hostingProviders.ts`
  - `apps/noter/convex/cloudflarePreviewComment.ts`
  - `apps/noter/src/main.tsx`
  - `.github/workflows/ci.yml`
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
- Related RFCs:
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `rfcs/066_DASHBOARD_CLOUDFLARE_BRANCH_PREVIEW_LINKS_AND_THUMBNAILS.md`

## Question

If a PR branch is rebased onto the latest `main` and then squash-merged, the
final file tree can match the PR tip exactly even though the commit SHA changes.

Can Noter use that fact to get effectively instant Cloudflare previews and
near-instant post-merge production deploys by reusing the already-built preview
artifact instead of letting Cloudflare rebuild from scratch?

## Executive Answer

Not with the current Git-integrated Cloudflare Pages setup by itself.

As of 2026-03-30, the verified Cloudflare behavior is:

1. Git-integrated Pages auto-deploys on every pushed commit and updates the PR
   preview URL as more commits land on that branch.
2. Cloudflare's own Pages known-issues page says incremental builds are not
   supported.
3. Pages build caching restores package-manager caches and some framework cache
   directories, but it is not documented as a preview-to-production artifact
   promotion path.
4. Preview deployments are not valid rollback targets, so Cloudflare does not
   expose a built-in "promote this preview deployment directly to production"
   mechanism.

There is also a Noter-specific blocker that is easy to miss:

1. Noter provisions different Pages env vars for preview and production.
2. `VITE_CONVEX_URL` is one of those env vars.
3. The frontend reads `import.meta.env.VITE_CONVEX_URL`, which means Vite bakes
   it into the built client bundle.

That means the current preview and production build outputs are not guaranteed
to be byte-identical even when the source tree is identical.

## Verified Current Noter State

### Cloudflare project shape in repo code

`apps/noter/convex/hostingProviders.ts` currently provisions Cloudflare Pages
projects with:

1. `source.type = "github"`
2. `preview_deployment_setting = "all"`
3. separate `deployment_configs.production.env_vars`
4. separate `deployment_configs.preview.env_vars`

The relevant env vars include:

- `CONVEX_DEPLOY_KEY`
- `VITE_CONVEX_URL`

This confirms the current deployment model is Git-integrated Pages with distinct
preview and production environment configuration.

### Frontend build-time environment dependency

`apps/noter/src/main.tsx` initializes the app with:

```ts
const convexUrl = __DAYTONA_CONVEX_PROXY_PATH__
  ? new URL(__DAYTONA_CONVEX_PROXY_PATH__, window.location.origin).toString()
  : import.meta.env.VITE_CONVEX_URL
```

This means the browser bundle depends on `VITE_CONVEX_URL` at build time in the
normal hosted path.

Important implication:

- identical source tree does not currently imply identical built output across
  preview and production
- a tree-hash cache key would need to include environment identity, or Noter
  would first need to stop baking environment-specific browser config into the
  static bundle

### Current preview-link contract in Noter

`apps/noter/convex/cloudflarePreviewComment.ts` parses the Cloudflare Pages PR
comment body and extracts:

- `Preview URL`
- `Branch Preview URL`
- `Latest commit`
- `Status`
- `View logs`

This matters because Noter currently treats the Cloudflare Pages PR comment as
the source of truth for dashboard branch preview links.

If Noter moves away from Git-integrated Pages builds, it must either:

1. preserve an equivalent PR comment contract, or
2. migrate the dashboard to a different source of truth such as GitHub
   deployment metadata plus a repo-owned comment

## Verified Cloudflare Behavior Today

### 1. Git integration still treats each pushed commit as a deployment trigger

Cloudflare's GitHub integration docs say Pages will "automatically deploy your
code every time you push a change to a branch."

The same page also says:

1. every PR gets a unique preview URL
2. that preview stays updated as you push new commits to the branch
3. you can skip a deployment only by explicit controls such as skip prefixes,
   build watch paths, or branch deployment controls

This is the opposite of an implicit "detect same final files and silently reuse
the previous deploy" contract.

### 2. Cloudflare does not document incremental Pages builds

Cloudflare's Pages known-issues page says incremental builds are not supported.

That is the clearest product-level signal against assuming that Git-integrated
Pages can cheaply convert a validated preview build into a production deploy
just because the final tree matches.

### 3. Build cache helps, but it is not full artifact promotion

Cloudflare's build-caching docs say Pages caches:

1. package-manager global caches such as `.pnpm-store`
2. some framework-specific cache directories

For framework build-output caching, the documented list currently includes
frameworks such as Astro, Gatsby, Next.js, Nuxt, and SvelteKit.

Vite is not listed in that build-output cache table.

Inference from the official docs:

- Noter can benefit from pnpm dependency cache reuse
- Noter should not assume Cloudflare is caching Vite build output as a
  first-class supported framework cache

### 4. Preview deployments are not production promotion targets

Cloudflare's rollbacks docs say:

1. rollbacks apply to previous production deployments
2. preview deployments are not valid rollback targets

So even if a preview deployment is already built and validated, Pages does not
offer a documented "promote this preview deployment into production instantly"
operation comparable to a production rollback.

### 5. Direct Upload gives Noter much more control

Cloudflare's Direct Upload and CI docs confirm that:

1. Pages can deploy prebuilt assets with `wrangler pages deploy`
2. preview deployments can be created with `--branch=<BRANCH_NAME>`
3. existing Git-integrated projects can manually create deployments with
   Wrangler

This is the key escape hatch.

It means the promising direction is not "hope Git-integrated Pages infers
artifact reuse," but rather:

1. build the assets in CI under Noter's control
2. key those artifacts by a repo-owned identity
3. deploy the already-built assets to preview or production with Wrangler

### 6. GitHub Actions can reuse artifacts across workflow runs

GitHub's artifact docs say that downloading artifacts from a different workflow
or workflow run requires a token and run identifier.

That is enough for a Noter-owned promotion flow:

1. build once for the PR
2. store the build output as an artifact
3. later locate and download that artifact from the merge workflow

This is a GitHub capability, not a Cloudflare Pages native one.

### 7. Direct-upload deployment paths may already avoid re-uploading unchanged files

Cloudflare's historical Wrangler changelog says Pages deploys gained "deltas" so
Wrangler would only upload files "it has not already seen."

Important caution:

1. that note was written for `wrangler pages publish`
2. `wrangler pages publish` is now deprecated in favor of
   `wrangler pages deploy`
3. current direct-upload docs do not restate the same end-to-end guarantee in
   the modern Pages docs

Inference:

- the direct-upload path is still the best place to look for faster repeated
  deploys of identical assets
- Noter should validate current behavior with a benchmark instead of treating
  the old changelog note as a complete 2026 contract

## What The Git Fact Actually Buys Us

The user's underlying Git observation is still valuable:

1. after rebasing a PR onto the latest `main`
2. then squash-merging without extra file changes
3. the merge commit SHA changes, but the merge commit tree can match the PR head
   tree exactly

That means commit SHA is the wrong cache key for this problem.

The stable identity is closer to:

1. Git tree hash
2. plus build environment identity
3. plus anything else that can change output bytes, such as build command or
   injected runtime config

For Noter today, "tree hash only" is insufficient because preview and production
builds intentionally receive different environment values.

## Recommendation

### Recommendation A. Do not expect instant preview or production deploys from current Git-integrated Pages alone

This setup can get somewhat faster from:

1. build cache
2. branch build controls
3. build watch paths
4. ad hoc skip prefixes

But it does not solve the actual research question: reusing a previously built
preview artifact as the production deployment when the merge result is the same
tree.

### Recommendation B. If we want true artifact reuse, move deployment ownership into CI

Recommended pilot direction:

1. keep building on GitHub Actions, not inside Cloudflare's Git integration
2. produce one build artifact per PR validation run
3. key the artifact by:
   - Git tree hash
   - build environment identity
4. deploy previews via `wrangler pages deploy ... --branch=<pr-branch>`
5. on merge, compute the main-branch tree hash and try to reuse the matching
   artifact instead of rebuilding
6. fall back to a fresh build if no verified artifact match exists

This is the narrowest path that could make deploy speed mostly a GitHub artifact
download plus a Pages direct upload step.

### Recommendation C. Separate "faster preview deploys" from "same artifact in preview and production"

These are related but not identical goals.

#### Faster previews

This is achievable sooner:

1. build in GitHub Actions
2. deploy prebuilt assets with Wrangler
3. let Cloudflare handle only the upload/deployment step

#### Same artifact promoted from preview to production

This needs one more architectural change first:

1. stop baking environment-specific browser config into the static build, or
2. accept that the artifact key must include environment and therefore preview
   and production are separate artifact families

For Noter, the current `VITE_CONVEX_URL` dependency means preview and production
artifact reuse is blocked until that configuration story changes.

### Recommendation D. Treat the PR comment contract as an explicit migration item

If Noter shifts preview deploys to Wrangler-driven CI, do not assume the current
Cloudflare Pages PR comment will continue to exist in the same format.

Research-backed concern:

1. the Cloudflare GitHub App explicitly documents PR comments for Pages preview
   URLs
2. Wrangler Action documents GitHub Deployments and output variables, but not
   the same PR-comment contract

So the migration plan should include one of:

1. a repo-owned PR comment step that preserves the current parsed fields
2. a dashboard migration away from comment parsing to deployment metadata

## Suggested Pilot Plan

### Phase 1. Measure the current baseline

For one representative Pages project:

1. record preview deploy duration for a normal PR push
2. record post-merge production deploy duration
3. confirm whether Pages build cache is enabled

### Phase 2. Prove manual preview deploy on the existing project

Use GitHub Actions + Wrangler to:

1. build Noter once
2. deploy the prebuilt output to a preview branch alias
3. capture:
   - deployment URL
   - alias URL
   - total workflow time

This validates the CI-owned preview path without committing to full production
promotion yet.

### Phase 3. Introduce a repo-owned artifact identity

For every deployable build, record:

1. Git tree hash
2. build environment identity
3. build command
4. artifact name and run id

This creates the lookup surface needed for reuse after merge.

### Phase 4. Decide whether to pursue same-artifact promotion

Only proceed if one of these becomes true:

1. Noter moves browser bootstrap config to runtime so preview and production
   builds can truly match, or
2. the team decides preview and production should intentionally remain separate
   artifact families and only wants faster preview deploys, not literal
   preview-to-production promotion

## Bottom Line

The core idea is directionally correct, but the current Cloudflare/Noter stack
does not give it to us for free.

What is true:

1. rebased PR tip and squash-merge result can share the same source tree
2. that makes tree-hash-based reuse a good idea
3. Cloudflare Direct Upload plus GitHub artifact reuse is the right place to
   prototype that idea

What is not true today:

1. Git-integrated Pages does not document a "reuse exact preview deployment as
   production" flow
2. Cloudflare Pages does not support incremental builds
3. Noter's preview and production outputs are not currently identical for the
   same source tree because `VITE_CONVEX_URL` differs between environments

So the correct research conclusion is:

- instant Cloudflare previews from exact artifact reuse are plausible only with
  a CI-owned deployment pipeline and a tighter runtime-config model
- they are not something the current Git-integrated Pages setup can be assumed
  to provide automatically

## Sources

Verified on 2026-03-30 against:

- Cloudflare Pages GitHub integration:
  `https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/`
- Cloudflare Pages build caching:
  `https://developers.cloudflare.com/pages/configuration/build-caching/`
- Cloudflare Pages preview deployments:
  `https://developers.cloudflare.com/pages/configuration/preview-deployments/`
- Cloudflare Pages known issues:
  `https://developers.cloudflare.com/pages/platform/known-issues/`
- Cloudflare Pages rollbacks:
  `https://developers.cloudflare.com/pages/configuration/rollbacks/`
- Cloudflare Pages Direct Upload:
  `https://developers.cloudflare.com/pages/get-started/direct-upload/`
- Cloudflare Pages direct upload with CI:
  `https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/`
- Cloudflare Workers and Pages GitHub App:
  `https://github.com/apps/cloudflare-workers-and-pages`
- Cloudflare Wrangler Action README:
  `https://github.com/cloudflare/wrangler-action`
- Cloudflare Pages Action deprecation note:
  `https://github.com/cloudflare/pages-action`
- GitHub Actions artifact docs:
  `https://docs.github.com/en/actions/tutorials/store-and-share-data`
