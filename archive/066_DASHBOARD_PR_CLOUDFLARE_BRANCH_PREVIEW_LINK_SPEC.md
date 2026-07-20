# 066 Dashboard PR Cloudflare Branch Preview Link Spec

## Document Control

- Status: Superseded by `specs/115_PULL_REQUEST_PROVIDER_QUERY_SPEC.md`
- Owner: Vault dashboard + GitHub/Cloudflare integration
- Last updated: 2026-07-04
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- Related RFCs:
  - `rfcs/066_DASHBOARD_CLOUDFLARE_BRANCH_PREVIEW_LINKS_AND_THUMBNAILS.md`

## Supersession Note

This behavior is no longer current. The PR-comment parser and branch-level Cloudflare preview row
were replaced by the GitHub check snapshot model in `rfcs/087_PR_CHECKS_BASED_REFRESH_PLAN.md`.
Runtime code no longer reads or writes the branch-level Cloudflare preview projection, and the old
`observations_vaultRepository_branches` schema fields have been removed.

The historical implementation notes below also predate the selected-vault branch pagination work in
`rfcs/092_VAULT_BRANCH_PAGINATION_AND_VIRTUAL_LIST_PLAN.md`. Current dashboard branch rows are
served by `api.vault.branches.listVaultRemoteBranchesPage`, not by
`api.vault.dashboard.getUserVaults`.

## Summary

Show a Cloudflare branch preview link directly on each dashboard branch row when that branch has a
current pull request with a Cloudflare Pages deploy comment.

This spec deliberately narrows the feature:

1. The source of truth is the Cloudflare Pages PR comment, not `vaultDomains` and not a generic
   Cloudflare deployment scan.
2. The dashboard displays the comment's `Branch Preview URL`.
3. Preview-link caching is scoped to the current PR identity, not only to the branch name.
4. If a branch has no PR, the PR changed, or no Cloudflare Pages comment is cached for the current
   PR, the dashboard shows no preview link for that branch.

## Product Decisions (Locked)

1. Dashboard branch preview links are PR-derived branch metadata.
2. The displayed/clicked URL is `Branch Preview URL`.
3. The cache key for a saved preview link includes the current `pullRequestNumber`.
4. A cached preview link must not render when the branch's current PR number no longer matches the
   PR number that produced the cached preview.
5. The dashboard surface shows only the branch preview link; auxiliary parsed Cloudflare metadata is
   optional internal state and not a product-facing requirement for this optimization.
6. This feature does not use `vaultDomains` as its storage surface.
7. Each PR should require at most one Cloudflare comment scan unless the cache is missing, cleared,
   or the PR identity changes.

## Dashboard Row UI Invariants

The dashboard branch row may evolve visually, but these interaction targets are part of the accepted
behavior:

1. Commit metadata renders on its own line as `Last commit <short-sha>` with a commit icon, the
   commit link, and any ahead/behind counts.
2. When a pull request title is available, the top pull request link consolidates the pull request
   state icon, `PR #<number>`, and the PR title.
3. When no pull request title is available, PR metadata may render as its own row. Pull request
   labels and the draft badge belong with PR metadata, not the commit row.
4. The branch name remains visible with a branch icon and links to the GitHub branch tree, but is
   not itself the Samebase edit navigation target.
5. A Samebase link renders below the Cloudflare preview/logs affordance and uses the version 2
   side-diagonal identity mark. On the default branch it is labeled `Edit` and opens the branch file
   view. On non-default branches it is labeled `View changes` and opens the branch file view in
   Changed Files mode.
6. A current Cloudflare branch preview remains a separate visible affordance on the branch row. It
   must not disappear when PR metadata is moved or restyled.
7. The Cloudflare branch preview affordance uses the label `Cloudflare preview` and shows the
   Cloudflare icon before the label.
8. The preview affordance target is still the parsed `Branch Preview URL`.
9. The preview affordance renders only when the cached preview belongs to the branch's current PR,
   according to the freshness rules below.
10. Branch-row icons use a fixed-width slot so PR, branch, commit, Cloudflare, Convex, and Samebase
    labels share a stable text rail.

## Why This Is The Right Scope

The operator requirement is branch-centric and PR-centric:

1. The expected workflow starts from a draft PR.
2. Cloudflare already posts the needed URLs into the PR.
3. The branch list already stores PR metadata in `observations_vaultRepository_branches`.
4. The dashboard only needs a user-facing branch link right now, not a full domain management
   system.

This makes a PR-comment-derived model smaller and less ambiguous than trying to re-purpose
`vaultDomains` for branch preview discovery.

## Current State

As of 2026-04-20, the runtime already parses Cloudflare preview comments, caches preview metadata on
`observations_vaultRepository_branches`, and renders the branch preview link in `VaultDashboard`.

The remaining gap is cache identity:

1. The saved preview metadata is branch-scoped today, not explicitly PR-scoped.
2. The dashboard decides whether to re-run Cloudflare comment hydration based on whether
   `cloudflareBranchPreviewUrl` exists, not whether it belongs to the current PR.
3. That allows stale branch preview links to survive PR removal or PR-number changes on the same
   branch.
4. `vaultDomains` remains unrelated to this feature and should stay that way.

## Source Comment Contract

The feature parses the Cloudflare Pages PR comment body. The current comment format includes:

1. `Latest commit`
2. `Status`
3. `Preview URL`
4. `Branch Preview URL`
5. `View logs`

Example fields:

- `Preview URL`: immutable deployment URL for one deploy
- `Branch Preview URL`: mutable branch alias URL
- `View logs`: Cloudflare deployment log URL

The parser should treat the comment body as semi-structured provider output:

1. Match the Cloudflare Pages author/bot identity.
2. Parse the latest Cloudflare deploy comment for the PR.
3. Extract recognized fields if present.
4. Fail open when a field is missing or the comment format changes.

Dashboard branch rows should render the current PR's `View logs` URL as a mobile-friendly Cloudflare
link when the parsed `Status` is `Build failed`. This failure link replaces the normal branch
preview link for that row because the latest deploy did not produce a usable branch preview.

## Proposed Changes

### 1. Extend branch metadata with PR-scoped preview cache identity

Preferred storage surface:

- `observations_vaultRepository_branches`

Add optional fields such as:

- `cloudflareBranchPreviewUrl?: string`
- `cloudflarePreviewPullRequestNumber?: number`

Existing auxiliary Cloudflare metadata may remain temporarily during rollout, but it is not required
for the dashboard contract.

Rationale:

1. The displayed link is still branch-scoped in the UI.
2. The cache validity is PR-scoped.
3. The branch row already stores the current PR metadata needed to compare those two identities.
4. It does not need `vaultDomains` semantics.

### 2. Add a PR-comment enrichment step that hydrates once per PR

Add a dashboard-focused enrichment path that:

1. reads `observations_vaultRepository_branches`
2. clears cached preview metadata when a branch has no current `pullRequestNumber`
3. skips GitHub comment fetches when the branch already has a cached preview for the same
   `pullRequestNumber`
4. fetches PR issue comments only when a branch has a current PR but the cached preview is missing
   or tied to a different PR
5. finds the latest Cloudflare Pages comment
6. parses the relevant fields
7. patches the branch row with the cached preview data and the producing PR number

Important scope rule:

- This enrichment should be dashboard-scoped or otherwise explicitly gated. It should not run on
  every generic editor/tree refresh path by default.

### 3. Extend the dashboard branch row payload

Add the cached Cloudflare preview fields to the dashboard branch row payload so the dashboard can
render them directly and suppress stale links. At the time this superseded spec was written, that
payload was `remoteBranches[]` on `vault.getUserVaults()`; current dashboard branch rows are served
by `api.vault.branches.listVaultRemoteBranchesPage`.

Minimal UI requirement:

- `cloudflareBranchPreviewUrl?: string`
- `cloudflarePreviewPullRequestNumber?: number`

Any additional Cloudflare fields are optional and should not be required by the dashboard row.

### 4. Render the link in `VaultDashboard`

For each active branch row:

1. If `cloudflareBranchPreviewUrl` exists and
   `cloudflarePreviewPullRequestNumber === pullRequestNumber`, render it as a visible
   `Cloudflare preview` affordance in the branch row metadata.
2. Otherwise render nothing.
3. The displayed link should be the branch preview URL.
4. The consolidated PR link, Cloudflare preview link, and Samebase `Edit` link are independent
   targets. A row with a PR and a current Cloudflare preview must render all applicable links.

## Freshness Rules

The current PR identity is the hard display gate for cached branch preview links.

Rules:

1. If `cloudflarePreviewPullRequestNumber === pullRequestNumber`, the cached branch preview link is
   eligible to render.
2. If the PR number changes:
   - do not render the old cached branch preview link
   - perform one new Cloudflare comment scan for the new PR
3. If the branch no longer has a PR:
   - clear cached preview metadata
   - render no preview link
4. If commit freshness metadata is still stored and does not match:
   - still display `cloudflareBranchPreviewUrl`
5. If the branch has a PR but no parsed Cloudflare comment yet, show no link.

## Phased Rollout

This feature is small enough to ship quickly, but it is still worth splitting into low-risk phases
so parsing, caching, and UI regressions are easy to isolate.

### Phase 1: Make preview caching PR-scoped

Scope:

1. Add a cached PR-identity field to branch preview metadata.
2. Clear preview metadata when the current PR disappears.
3. Re-fetch PR comments only when the current PR lacks a matching cached preview.

Exit criteria:

1. Branch records can cache:
   - `cloudflareBranchPreviewUrl`
   - `cloudflarePreviewPullRequestNumber`
2. Branches with no PR clear their cached preview link.
3. Re-running enrichment for the same PR is idempotent and does not re-fetch comments just because
   the branch already has a cached preview.

### Phase 2: Expose cached fields and guard rendering

Scope:

1. Extend the dashboard branch row payload with the cached Cloudflare preview fields.
2. Keep this query read-only; do not perform PR comment fetches inside the query itself.
3. Render the link only when the cached preview belongs to the current PR.

Exit criteria:

1. The dashboard branch row query returns the cached preview fields when present.
2. Query behavior does not depend on live GitHub comment reads at render time.
3. Existing branch row metadata remains intact.

## Explicit Non-Goals

1. Parsing Cloudflare deployments directly from the Pages API for this feature
2. Writing branch preview links into `vaultDomains`
3. Showing branch preview links for branches without PRs
4. Inline screenshots or thumbnails in this implementation
5. Solving custom branch domain selection in this implementation
6. Requiring auxiliary Cloudflare fields beyond the branch preview link for the dashboard rollout

## Data Model Guidance

`vaultDomains` remains an infra/domain mapping surface. This feature should not depend on it.

That separation is intentional:

1. `vaultDomains` is about canonical infra/domain mappings
2. this feature is about PR-derived branch preview metadata
3. cache validity is tied to the current PR, not only to the branch name

## Validation

### Unit / integration coverage

1. Parse a Cloudflare Pages PR comment body into:
   - branch preview URL
   - failed build status and logs URL
2. Verify the parser tolerates:
   - missing `View logs`
   - missing `Status`
   - comment bodies with extra text before/after the table
3. Verify branches without PRs are skipped.
4. Verify branches with PRs but without Cloudflare comments keep preview fields empty.
5. Verify older Cloudflare comments are ignored when a newer deploy comment exists on the same PR.
6. Verify the enrichment path patches only the intended branch row.
7. Verify the same PR is not re-fetched once its preview link is cached.
8. Verify changing `pullRequestNumber` suppresses the stale cached link and triggers a one-time
   re-hydration for the new PR.
9. Verify removing `pullRequestNumber` clears cached preview metadata.
10. Verify the dashboard branch row query returns the cached branch preview fields.

### Suggested implementation tests

1. Pure parser tests for the exact Cloudflare markdown format already observed in production PR
   comments.
2. Enrichment tests that mock GitHub PR comments and confirm cache writes.
3. Query-shape tests for dashboard branch row payload additions.
4. UI tests for `VaultDashboard` branch rows:
   - link renders when `cloudflareBranchPreviewUrl` exists for the current PR
   - link does not render when absent
   - link does not render when the cached preview belongs to a different PR
   - existing commit/PR metadata still renders
   - PR links stay on their own row with a pull request state icon
   - valid Cloudflare preview links stay visible as `Cloudflare preview` with a Cloudflare icon

### Manual coverage

1. Branch with draft PR and Cloudflare comment shows the branch preview link.
2. Branch with draft PR and no Cloudflare comment shows no link.
3. Branch whose PR is closed or removed shows no link after refresh.
4. Branch whose PR number changes does not show the old cached preview while the new PR is still
   awaiting hydration.
5. Clicking the rendered dashboard link opens the `Branch Preview URL`.

### Acceptance checklist

- [ ] Branches without PRs never show preview links.
- [ ] Branches with PRs but no Cloudflare comment never show preview links.
- [ ] Branches with a valid Cloudflare Pages comment show exactly one link.
- [ ] The displayed link target is the parsed `Branch Preview URL`.
- [ ] Branches with both a PR and a valid Cloudflare preview render both the GitHub PR link and the
      Cloudflare preview link.
- [ ] Moving or restyling PR metadata does not remove the Cloudflare preview affordance.
- [ ] The same PR does not trigger repeated Cloudflare comment scans once the preview link is
      cached.
- [ ] A PR-number mismatch hides the stale cached branch preview link.
- [ ] Dashboard rendering does not require a live GitHub comment fetch during
      `vault.getUserVaults()`.

## Recommended Implementation Order

1. Add a parser for the Cloudflare Pages PR comment body.
2. Add a cached preview PR-identity field to branch metadata storage.
3. Make dashboard-scoped PR comment enrichment hydrate at most once per PR.
4. Extend `vault.getUserVaults()` with cached preview fields.
5. Render the branch preview link in `VaultDashboard` only for the current PR.
6. Add tests for parser, PR-scoped caching, and dashboard rendering.
