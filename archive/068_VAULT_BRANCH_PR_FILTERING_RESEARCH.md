# 068 Vault Branch and PR Filtering Research

## Document Control

- Status: Superseded research note
- Superseded by:
  [Pull request provider query spec](../specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md)
- Owner: Noter product/frontend
- Last updated: 2026-03-23
- Depends on:
  - `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/noter/convex/vault.ts`
  - `apps/noter/convex/github.ts`

This note predates the live pull request dashboard. Use
`specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md` and
`archive/067_VAULT_PULL_REQUEST_FILTERS_SPEC.md`; do not persist its proposed branch/PR
normalization.

## Purpose

Capture the current dashboard branch-list behavior, the relevant GitHub filter model, and a
low-complexity recommendation for filtering branches and pull requests per vault.

The goal is to make branch/PR triage easier without turning each vault card into a second full
search UI.

## Research Questions

1. What filtering model does GitHub already teach users for pull requests?
2. Which parts of that model map cleanly onto Noter's current vault dashboard?
3. What is the smallest UI that supports branch/PR filtering without making the dashboard harder to
   understand?
4. Which backend fields already exist, and which fields are still missing?

## Current Noter State

### Dashboard surface

The vault dashboard already renders remote branch rows inside each vault card. Each row can show:

- branch name
- PR title
- PR link / number
- PR labels
- ahead/behind counts
- staged file status
- branch deletion affordance when eligible

That surface is implemented in `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`.
`VaultBranchLinkContent` already treats PR title as the primary line and branch name as the lighter
secondary line when a PR exists.

### Current data available per branch

`apps/noter/convex/vault.ts` already returns these PR-related fields in `remoteBranches`:

- `pullRequestUrl`
- `pullRequestNumber`
- `pullRequestLabels`
- `pullRequestTitle`

This is already enough to support, when PR sync succeeds:

- text filtering by branch name
- limited text filtering by the latest synced PR title
- limited inclusion/exclusion by the latest synced PR labels

### Current data gap

`apps/noter/convex/github.ts` currently collects and persists PR URL, number, labels, and title, but
not whether the PR is draft.

That means draft filtering is not possible today, even though it is one of the most useful filters
for this dashboard.

There is a second limitation as well: the current PR lookup only attaches open pull requests whose
head branch belongs to the same repository as the vault. That matches the current dashboard branch
model, but it means the sync logic is still branch-centric rather than PR-centric.

There is a third limitation: the sync model keeps only one open PR per branch, choosing the most
recently updated PR. If a branch has multiple open pull requests, older PR titles and labels are
invisible to the current payload and would not participate in filtering.

There is a fourth limitation for any `has PR` / `no PR` style filter: the PR sync path can preserve
older metadata when GitHub PR lookup fails or is rate limited, and the current dashboard queries do
not expose whether the latest PR lookup resolved cleanly versus preserved stale data. A v1 filter
should either surface PR-sync freshness explicitly or avoid promising precise `has PR` / `no PR`
semantics until that state is exposed.

## GitHub Model Research

As researched on 2026-03-23, GitHub's current pull request filtering model has two relevant parts:

1. Repository pull request lists expose both dropdown filters and a freeform search bar.
2. The search bar supports qualifier-based filtering such as labels, exclusion, and draft state.

Documented GitHub behaviors that matter here:

- GitHub supports qualifier search on issue and PR lists.
- A leading `-` excludes a term.
- `label:"bug"` filters by label.
- `label:"bug","wip"` means label OR label.
- separate `label:` terms mean label AND label.
- `is:draft` filters draft pull requests.
- GitHub updates the URL to reflect the current filter state.
- GitHub shows qualifier suggestions while typing.

## Key Findings

1. The strongest UX anchor is not GitHub's dropdown filters by themselves. It is the combination of
   a simple visible filter entrypoint plus a compact query language.
2. Noter does not need the full GitHub grammar. A narrow subset covers the operator's stated needs:
   - free text
   - `label:`
   - `-label:`
   - `is:draft`
   - `-is:draft`
3. A permanent inline search field on every vault card would increase visual noise too much.
4. Tabs like `Branches / PRs / Drafts / Review` would add more structure than this surface can
   afford and would fragment one list into several mental models.
5. The current branch row already has enough metadata density. The missing work is discoverable
   filtering, not another display layer.
6. Draft state should not be filter-only. If users can filter by draft, the row should also expose a
   minimal draft marker so the result set is legible.

## Options Considered

### Option A. Inline search field always visible inside each vault card

Pros:

- immediately discoverable
- lowest interaction cost

Cons:

- adds repeated UI to every card
- increases dashboard height and cognitive load
- competes with branch rows for attention even when unused

Assessment:

Too expensive for a surface that already feels busy.

### Option B. Segmented controls or tabs

Examples:

- `All / PRs / Drafts`
- `All / Active / Review / Hidden`

Pros:

- easy to scan for a few fixed presets

Cons:

- does not scale to labels
- pushes the product toward a taxonomic UI
- becomes awkward once users want exclusion like `-label:research`

Assessment:

Useful only if the product wants a few opinionated presets. Not enough by itself.

### Option C. Small `Filter` popover with GitHub-like query input

Pros:

- low default UI cost
- familiar mental model for GitHub-heavy users
- handles label inclusion and exclusion cleanly
- keeps one canonical list instead of splitting the surface

Cons:

- less discoverable than a permanently visible field
- needs lightweight parsing and hint text

Assessment:

Best fit for v1.

## Recommended Direction

Add a single `Filter` control to the `Branches` header for each vault. Activating it opens a small
popover with one compact query input and a short hint.

### Recommended v1 query subset

Support only:

- plain text terms matching `branch.name`
- plain text terms matching `pullRequestTitle`
- `label:<name>`
- `-label:<name>`
- `is:draft`
- `-is:draft`

Do not support in v1:

- nested boolean expressions
- parentheses
- arbitrary qualifiers
- review-state qualifiers
- sort syntax
- full GitHub parser parity

### Example queries

- `release`
- `label:needs-review`
- `-label:research`
- `is:draft`
- `-is:draft`
- `-label:research -is:draft`

### UI behavior

1. Keep the branch list as a single list.
2. Put the filter entrypoint in the existing `Branches` section header, not at the vault-card top.
3. Keep the input hidden by default behind a popover or dropdown panel.
4. When a filter is active, show a small summary next to the trigger, such as `6 of 18`.
5. Provide a one-click clear action.
6. Persist the raw filter string per user so the operator does not need to retype it every visit.
7. Optionally mirror the active filter into the URL query params so filtered dashboard views are
   shareable and restorable.

## Why This Direction Fits Noter

### It matches the current row design

The current branch row is already rich enough that filter results will be understandable after
narrowing:

- PR title already acts like the first-class label when present
- branch name is still visible
- labels are already rendered
- PR link already exists

The filter therefore narrows an existing high-signal row instead of requiring a new summary card or
separate PR-specific surface.

### It avoids duplicated chrome

Noter already has a busy dashboard card:

- repo identity
- sync state
- branch list
- infra status
- developer tools

An always-on search field would make every card look interactive even when the user only needs one
vault. A hidden-by-default filter respects the dashboard's scan-first behavior.

### It reuses a familiar operator language

The operator specifically suggested GitHub-style string filters such as `-label:research`. That is a
strong signal to lean into a known model instead of inventing a new one.

## Recommended Backend and Data Changes

### Required for v1

Add `pullRequestIsDraft` to the branch PR metadata pipeline:

1. read `draft` from the GitHub pull request payload in `apps/noter/convex/github.ts`
2. persist it into `observations_vaultRepository_branches`
3. return it from `apps/noter/convex/vault.ts`
4. expose it in the dashboard row props

Without this field, `is:draft` would have to be omitted or faked, and neither is acceptable.

### Already sufficient for v1

No new label model is needed. Existing `pullRequestLabels` are enough for:

- exact label include
- exact label exclude
- label-presence-based matching

## Recommended Frontend Shape

### Parser

Use a deliberately small parser, not a full GitHub query engine.

Suggested internal model:

- `textTerms: string[]`
- `includeLabels: string[]`
- `excludeLabels: string[]`
- `draftState: "only" | "exclude" | "any"`

Unknown tokens should fall back to plain text matching instead of producing a hard parse error.

If a token looks qualifier-like but is not recognized, the UI should also surface a non-blocking
hint or chip. For example, `lable:research` should still behave like plain text, while the UI can
show `Unrecognized qualifier: lable:` and suggest `label:`.

### Matching behavior

Plain text should match against:

- branch name
- PR title

Label matching should be exact and case-insensitive on label name.

Draft matching should be tri-state:

- `any`
- `only`
- `exclude`

### Persistence

Prefer storing the filter in Convex-backed synced state because the operator prefers cross-device
persistence over `localStorage`.

Because this RFC proposes per-vault filtering, persistence must also be scoped per vault or
repository. `ui_user_settings` is currently keyed only by user, so the implementation should not
store one global raw filter string there unless the product is explicitly reframed as a global
dashboard filter.

Reasonable shapes include:

- a `ui_user_settings` map keyed by `vaultId` or `repositoryFullName`
- a small dedicated per-user, per-vault filter table
- a URL-owned filter with optional synced recent-history state

If URL persistence is added, it should be additive and should use the existing query-param helpers
in `apps/noter/src/lib/queryParams.ts`.

## Row-Level UX Recommendation

Once `pullRequestIsDraft` exists, show a minimal `draft` badge in the branch row near the PR link.

This should be visually lighter than the user-defined labels. It is product metadata, not a GitHub
label, so it should not compete with actual labels.

## Non-Goals

- GitHub-complete search grammar
- cross-vault global filtering in this slice
- new dashboard tabs
- server-side filtering for the initial implementation
- review-state filters such as `review:none`
- author/assignee/reviewer qualifiers

## Open Questions

1. Should the filter be per-vault only, or should Noter later add a dashboard global filter that can
   target all vaults at once?
2. Should common presets such as `Open PRs`, `Not draft`, or `Exclude research` be offered as
   optional chips inside the popover?
3. Should a filtered list still pin the default branch first, or should exact text matches win sort
   priority inside the filtered result set?

## Recommended Next Steps

1. Add `pullRequestIsDraft` to the branch sync pipeline.
2. Implement a lightweight per-vault filter popover on the dashboard.
3. Support only the minimal GitHub-like query subset listed above.
4. Add a dashboard visual fixture and screenshot coverage for:
   - no filter
   - active `-label:research`
   - active `is:draft`
5. Re-evaluate whether preset chips are still needed after using the string query version in
   practice.

## Source Links

### Current code

1. [apps/noter/src/components/vault-dashboard/VaultDashboard.tsx](https://github.com/noter-md/noter/blob/main/apps/noter/src/components/vault-dashboard/VaultDashboard.tsx)
2. [apps/noter/convex/vault.ts](https://github.com/noter-md/noter/blob/main/apps/noter/convex/vault.ts)
3. [apps/noter/convex/github.ts](https://github.com/noter-md/noter/blob/main/apps/noter/convex/github.ts)

### External sources

1. GitHub Docs, Filtering and searching issues and pull requests:
   <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests>
2. GitHub Docs, REST API endpoints for pull requests: <https://docs.github.com/en/rest/pulls/pulls>
