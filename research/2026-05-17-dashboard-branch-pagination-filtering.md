# Dashboard Branch Pagination, Counts, and Filtering Research

## Document Control

- Status: Research note
- Owner: Noter dashboard/frontend + Convex vault/github
- Last updated: 2026-05-17
- Related source of truth:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
  - `rfcs/068_VAULT_BRANCH_PR_FILTERING_RESEARCH.md`

## Purpose

Research the standard way to make the dashboard safe when a user connects a repository with many
branches and pull requests.

The immediate problem is that the old dashboard query collected every connected vault and every
branch row for every connected vault. The first pagination pass changed the branch rows to a
per-vault Convex paginator, but that exposed two follow-up questions:

1. How should the UI show total branch counts if Convex pagination does not return totals?
2. How should branch filters behave when only the first page of a vault's branches is loaded?

## Recommendation

Use nested client-owned pagination, but not nested all-in-one backend results:

1. Page vault cards with `listDashboardVaults`.
2. Page branch rows per ready vault card with `listDashboardBranches`.
3. Add maintained per-vault branch stats for exact counts.
4. Treat current branch filters as loaded-row filters until the backend has stats/facets or
   server-side filtered pagination.
5. Do not make GitHub search part of the default dashboard render path. Use it only for an explicit
   provider-backed search mode if the product later needs ad-hoc PR search beyond Noter's synced
   branch cache.

This keeps the hot dashboard path Convex-native, bounded, and reactive while allowing GitHub
freshness to remain an explicit sync concern.

## Current Noter State

The current PR has the right first shape:

1. `apps/noter/convex/vault/dashboard.ts` exposes `listDashboardVaults({ paginationOpts })`.
2. `apps/noter/convex/vault/dashboard.ts` exposes
   `listDashboardBranches({ vaultId, paginationOpts })`.
3. `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx` uses `usePaginatedQuery` for vault
   cards and for each ready vault's branch list.

The remaining unsafe/stale parts are:

1. `getUserVaults` still exists and still collects all remote branch rows for every connected vault.
   New dashboard runtime code should not use this as the connected-vault data source.
2. `listDashboardBranches` currently returns Convex pagination metadata and the loaded branch page,
   but no repository-wide branch total.
3. `VaultDashboardBranchSectionState` filters `remoteBranches`, which now means loaded branch rows,
   not the full vault branch set.
4. Filter option counts and `visible of total` copy are exact only over loaded rows unless all
   branch pages have been loaded.

## External Findings

### Convex pagination

Convex's documented standard is cursor-based pagination using `paginationOptsValidator` and
`.paginate(paginationOpts)`. A paginated result contains a page, `isDone`, `continueCursor`, and
optional split metadata. It does not contain a total count.

Convex also documents that paginated queries are reactive. Loaded pages can grow or shrink when rows
are inserted, deleted, or changed inside the query range. This matters for mental model: cursors are
not offset numbers, and page length is not a stable total.

For query performance, Convex recommends indexes over `.filter`, and recommends avoiding
`.collect()` when a result set can grow past roughly thousands of documents. For counts, Convex
recommends denormalized counters/stats or the aggregate component instead of loading all rows to
count them.

### GitHub branches and pull requests

GitHub's REST branch list is paginated and supports a `protected` query parameter, but it does not
provide branch filtering by PR label, draft state, or branch PR metadata.

GitHub's REST pull request list supports `state`, `head`, `base`, `sort`, `direction`, `per_page`,
and `page`. This helps for PR-centric sync and a single-branch `head` lookup, but it does not solve
dashboard branch-list filtering by labels across all branches.

GitHub issue/PR search supports GitHub-style qualifiers such as labels and `is:draft`, and the REST
search response includes `total_count` and `incomplete_results`. However, search has a custom rate
limit, returns at most 1,000 results per search, and can return incomplete results after timeouts.
That makes it a poor default dependency for rendering every dashboard vault card.

GitHub GraphQL connections expose cursor pagination and commonly expose `totalCount`, but calls
still require `first`/`last` limits, have node limits, rate-limit point costs, and can become
expensive when joining repositories, pull requests, labels, and branches. GraphQL is useful for sync
design, not a free replacement for Noter's own dashboard cache.

## Cursor Behavior and New Rows

The confusing part with cursors is what happens when the list changes after a page has been loaded.

The standard answer is:

1. A cursor identifies a position in the ordered query result, not "page 2" in an immutable offset
   list.
2. In Convex's reactive pagination, loaded pages are maintained as query ranges. If a new row enters
   a loaded range, that page can grow. If a row leaves the range, that page can shrink.
3. Convex clients use cursor/end-cursor metadata to avoid gaps between loaded pages as live data
   changes.
4. If a cursor becomes invalid because query args/order/filter shape changed, the client should
   reset pagination to the first page.

Dashboard consequence: do not fight this by trying to freeze branch pages. Instead, make the
displayed total independent from page length. Loaded branch rows can be live and fluid; the total
branch count comes from stats.

## Why Counts Need a Separate Model

Convex pagination deliberately optimizes the page read. It does not answer "how many rows match this
query?" because that would require a count mechanism outside the page. For a small table, collecting
and counting is fine. For branch rows, the table is unbounded by product policy, so counting by
reading all rows would recreate the original problem.

The dashboard should display three different concepts distinctly:

1. Loaded count: number of branch rows the client currently has.
2. Synced total: number of branch rows known at the latest completed Noter sync.
3. GitHub-live total: number currently on GitHub, which may differ until a sync completes.

Only the first is available from `usePaginatedQuery().results.length`. The second needs
Noter-maintained stats. The third requires a GitHub refresh or provider search/query and should not
be implied by default dashboard copy.

## Recommended Data Model

### `vaultRemoteBranchStats`

One document per vault:

```ts
{
  vaultId: Id<"vaults">;
  activeBranchCount: number;
  deletedUpstreamBranchCount: number;
  totalBranchCount: number;
  openPullRequestBranchCount: number;
  draftPullRequestBranchCount: number;
  unlabeledPullRequestBranchCount: number;
  lastBranchStatsSyncedAt: number;
  lastPullRequestStatsSyncedAt?: number;
}
```

Use this for dashboard header counts such as "Loaded 20 of 214 branches" and small summary badges
like "18 PRs" or "3 drafts".

### `vaultRemoteBranchLabelStats`

One document per vault/label facet:

```ts
{
  vaultId: Id<"vaults">;
  labelKey: string;
  labelName: string;
  labelColor?: string;
  activeBranchCount: number;
  openPullRequestBranchCount: number;
  draftPullRequestBranchCount: number;
  lastSyncedAt: number;
}
```

Use this only if the filter popover needs full-repository label options/counts before all branches
are loaded.

### Optional `vaultRemoteBranchLabels`

One document per vault/branch/label membership:

```ts
{
  vaultId: Id<"vaults">;
  branchId: Id<"vaultRemoteBranches">;
  branchName: string;
  labelKey: string;
  labelName: string;
}
```

Indexes:

1. `by_vault_and_label` (`vaultId`, `labelKey`)
2. `by_vault_and_branch` (`vaultId`, `branchId`)

This is needed only if Noter wants exact server-side pagination for positive label membership. It
does not by itself solve arbitrary hidden-label exclusion, but it gives the backend an
index-friendly way to answer "branches with label X".

## Stats Maintenance

Stats should be maintained on write/sync paths:

1. Branch sync updates active/deleted/total counts after it reconciles GitHub's branch snapshot with
   existing branch rows.
2. PR metadata sync updates PR/draft/label stats after it persists changed PR fields on branch rows.
3. Writers compare old and new stats before patching, so no-op syncs do not invalidate stats
   subscribers.
4. A cursor-based backfill/reconciliation internal mutation computes stats for existing vaults in
   batches.
5. Dashboard reads never rebuild stats by collecting branch rows.

Consistency contract:

1. Stats are exact for the latest completed Noter sync.
2. Stats may lag GitHub while a branch/PR sync is running or after a sync failure.
3. The UI can show `lastBranchStatsSyncedAt`, sync progress, or refresh failure state if the
   difference matters.

## Query Contract

### Vault card query

`listDashboardVaults({ paginationOpts })` should return:

1. vault identity and setup state
2. default branch/tree summary
3. staging summary
4. provider setup/deletion summaries
5. optional branch stats

It should not include branch rows.

### Branch page query

`listDashboardBranches({ vaultId, paginationOpts })` should return:

1. one page of authorized branch rows
2. Convex pagination metadata
3. no count unless the count is attached from a stats row and clearly named as a stats value

### Filter stats query

If the UI needs full-repository filter facets:

`getDashboardBranchFilterStats({ vaultId })` should return stats/facets from
`vaultRemoteBranchStats` and `vaultRemoteBranchLabelStats`.

Keep this separate from branch pages so loading more branch rows does not force the filter popover
stats contract to churn.

## Sorting

The pre-pagination dashboard sorted branches by:

1. active before deleted-upstream
2. default first
3. newest last commit first
4. branch name ascending

Convex pagination needs the query order to be index-backed. If that exact order still matters,
materialize sort fields on the branch row and add an index such as:

```ts
.index("by_vault_and_dashboard_order", [
  "vaultId",
  "dashboardStateSort",
  "dashboardDefaultSort",
  "dashboardLastCommitSort",
  "nameSortKey",
])
```

Without this, `by_vault` pagination is bounded but not equivalent to the old comparator.

## Filtering Options

### Option A: loaded-row filters

Current implementation.

Pros:

1. Simple.
2. No new backend model.
3. Works well after the user loads all branch pages.

Cons:

1. Counts are only loaded-page counts.
2. Label options may miss labels on unloaded branches.
3. A filtered branch may exist on a later page and remain invisible.

Use this now only with honest copy.

### Option B: stats-backed facets plus loaded-row filtering

Add full-repository label/draft/PR counts, but keep row filtering local over loaded rows.

Pros:

1. Solves missing total counts.
2. Popover can show all labels and counts.
3. Avoids the hardest server-side pagination problem for now.

Cons:

1. Selecting a label does not automatically page exact matching branches.
2. UI needs careful language: facets are global, displayed rows are loaded.

This is a good intermediate phase if exact filtered pagination is not urgent.

### Option C: server-side filtered pagination for index-friendly predicates

Support exact backend pagination for predicates that match one index:

1. `remoteState`
2. `pullRequestIsDraft`
3. `hasOpenPullRequest`
4. one positive label using `vaultRemoteBranchLabels`

Pros:

1. Exact row set for supported filters.
2. Convex-native and bounded.

Cons:

1. Does not support arbitrary hidden-label exclusion cleanly.
2. Multi-label OR/AND requires merge/dedupe logic or a query/result cache.

This is the right phase if the product accepts a narrower, server-friendly filter grammar.

### Option D: GitHub search mode

Use GitHub issue/PR search for explicit searches such as:

```text
repo:owner/name is:pr is:open label:bug -is:draft
```

Pros:

1. Familiar GitHub semantics.
2. Provides provider-side `total_count`.
3. Good for ad-hoc PR-centric search.

Cons:

1. Custom rate limit.
2. 1,000 result cap.
3. Possible incomplete results.
4. Searches PRs/issues, not branches, so mapping back to branch rows still needs Noter data.
5. Adds a second freshness and error model.

This should be an explicit mode, not the default dashboard branch renderer.

### Option E: cached GitHub search results

Cache provider search results in Convex for specific filter queries.

Pros:

1. Can support more GitHub-like queries without running GitHub search on every render.
2. Can display cached totals.

Cons:

1. Introduces invalidation complexity.
2. Needs cache keys, TTLs, refresh states, stale labels, and error handling.
3. Still inherits GitHub search caps/incomplete behavior.

Defer until there is a repeated operator workflow that needs it.

## Recommended Rollout

### Phase 1: make current pagination honest

1. Keep `listDashboardVaults` and `listDashboardBranches`.
2. Remove any connected-vault dashboard runtime dependency on `getUserVaults`.
3. Change branch header copy so loaded-row count is not presented as total row count.
4. If a stats row is missing, show loaded count only.
5. Keep filters loaded-only and make result copy reflect that scope.

### Phase 2: add stats-backed totals

1. Add `vaultRemoteBranchStats`.
2. Update branch/PR sync writers to maintain stats.
3. Backfill stats in batches.
4. Show "Loaded N of M branches" when `M` exists.
5. Add tests that metadata-only branch sync writes do not invalidate a huge branch payload because
   the vault-card query no longer returns branch rows.

### Phase 3: add label facets

1. Add `vaultRemoteBranchLabelStats` if the filter popover needs global label options.
2. Populate facets from PR metadata sync.
3. Show full-repository label options/counts without loading every branch row.

### Phase 4: decide exact filtered pagination shape

Choose one:

1. Keep loaded filters permanently and rely on search/load-more for discovery.
2. Add exact server filters for index-friendly predicates only.
3. Add an inverted label index and design a bounded result merge/cache for multi-label filters.
4. Add explicit GitHub search mode for provider-backed PR search.

Do not silently make the current hidden-label checkbox semantics look global without building one of
these exact paths.

## Open Questions

1. Which branch total should the card lead with: active branches only, or active plus
   deleted-upstream tombstones?
2. Should the dashboard show PR counts only for active branches?
3. Is the current inclusive hidden-label checkbox model worth preserving once filters become
   server-side, or should the product move to positive filter chips/search terms?
4. Should loading more branch pages be allowed indefinitely per vault, or should the UI cap loaded
   pages until virtualization can unload offscreen pages?
5. Do operators need GitHub-live search often enough to justify a separate provider-backed search
   mode?

## Source Links

### Local code

1. `apps/noter/convex/vault/dashboard.ts`
2. `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
3. `apps/noter/src/components/vault-dashboard/VaultDashboardBranchSectionState.ts`
4. `apps/noter/src/components/vault-dashboard/vaultDashboardBranchFilters.ts`

### External sources

1. Convex paginated queries: <https://docs.convex.dev/database/pagination>
2. Convex `PaginationOptions`: <https://docs.convex.dev/api/interfaces/server.PaginationOptions>
3. Convex `PaginationResult`: <https://docs.convex.dev/api/interfaces/server.PaginationResult>
4. Convex best practices: <https://docs.convex.dev/understanding/best-practices>
5. Convex aggregate component: <https://github.com/get-convex/aggregate>
6. GitHub REST branches: <https://docs.github.com/en/rest/branches/branches>
7. GitHub REST pull requests: <https://docs.github.com/en/rest/pulls/pulls>
8. GitHub issue and PR search: <https://docs.github.com/en/rest/search/search>
9. GitHub filtering and searching issues and pull requests:
   <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests>
10. GitHub GraphQL rate and query limits:
    <https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api>
