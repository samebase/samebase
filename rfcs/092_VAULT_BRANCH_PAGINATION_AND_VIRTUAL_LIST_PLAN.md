# 092 Vault Branch Pagination And Virtual List Plan

## Document Control

- Status: Superseded
- Owner: Samebase dashboard and Convex vault
- Last updated: 2026-07-04
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `archive/067_VAULT_PULL_REQUEST_FILTERS_SPEC.md`
  - `specs/100_CONVEX_VAULT_MODULE_LAYOUT_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`
- Related RFCs:
  - `rfcs/087_PR_CHECKS_BASED_REFRESH_PLAN.md`
  - `rfcs/088_BRANCH_TIP_CHECKS_DASHBOARD_PLAN.md`
- Related files:
  - `apps/samebase/convex/schema.ts`
  - `apps/samebase/convex/vault/branches.ts`
  - `apps/samebase/convex/vault/dashboard.ts`
  - `apps/samebase/convex/vault/contracts/getUserVaults.ts`
  - `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/samebase/src/components/vault-dashboard/VaultDashboardBranchSectionState.ts`
  - `apps/samebase/src/components/vault-dashboard/vaultDashboardBranchFilters.ts`
  - `apps/samebase/e2e/vault-dashboard-visual.spec.ts`
- External references:
  - [Convex paginated queries](https://docs.convex.dev/database/pagination)
  - [Convex React `usePaginatedQuery`](https://docs.convex.dev/api/modules/react#usepaginatedquery)
  - [TanStack Virtual React adapter](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)
  - [TanStack Virtual infinite scroll example](https://tanstack.com/virtual/v3/docs/framework/react/examples/infinite-scroll)

This plan describes the deleted Convex branch catalog and server-side ranking model. The current
dashboard forwards GitHub's native pull request cursor through a browser-owned TanStack infinite
query as specified by `specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md`.

## Summary

The vault route split means `/vault/$owner/$repo` can own one repository's branch list directly. The
dashboard no longer needs the old `/home` style behavior where one route rendered every vault card
with every branch already embedded.

The accepted direction for this rollout is:

1. Stop making `getUserVaults` return full branch rows for every vault. Implemented in Phase 1.
2. Move selected-vault branch rows behind a per-vault Convex query. Implemented in Phase 1 through
   `api.vault.branches.getVaultRemoteBranches`.
3. Add real Convex cursor pagination for branch rows once the branch sort order is indexable.
   Implemented in Phase 3 as `api.vault.branches.listVaultRemoteBranchesPage`.
4. Render the selected vault's branches as one virtualized scroll surface with TanStack Virtual.
   Implemented in Phase 4.
5. Remove the `Show N more branches`/`Show less branches` expansion behavior. Implemented in Phase 1
   for app code; Phase 5A removed the stored schema field directly because existing vault/filter
   rows can be discarded before deploy.

This RFC now records the implemented rollout. Hidden-label server-side row pruning remains a
deferred follow-up because the current metadata query plus client filtering preserves the shipped UI
contract.

## Current State

`/vault` and `/vault/$owner/$repo` both render `VaultDashboard`. The selected repository route only
narrows the already-loaded vault array in React.

Phase 1 removed `remoteBranches` from `api.vault.dashboard.getUserVaults`. The query now returns
vault-level dashboard state only: provisioning/deletion state, staged-file summary inputs, app
roots, and provider resources.

`/vault/$owner/$repo` now loads selected-vault branch rows through
`api.vault.branches.listVaultRemoteBranchesPage`. The query uses Convex native pagination over the
sorted branch index and attaches commit check summaries and preview URLs only for the returned page.

The dashboard filter header and primary-branch selection use
`api.vault.branches.listVaultRemoteBranchFilterMetadata`, a lightweight full-catalog metadata query.
It returns the branch names, default/remote state, PR labels, and draft flags needed for exact
filter options and counts without loading commit summaries, check snapshots, or preview URLs for
every branch.

`api.vault.branches.getVaultRemoteBranches` still exists for non-dashboard consumers such as the
file route's current-branch metadata lookup.

The frontend still applies branch filters locally to the selected vault's loaded branch rows. Phase
1 removed the branch expansion limit and deleted `Show N more branches`/`Show less branches` from
app code. Phase 5A removed the stale `branchesExpanded` schema field; no compatibility migration is
kept because existing vault/filter rows can be discarded before deploy.

## Target Contract

### Route And Query Ownership

`/vault` remains the vault picker/list route. It should load enough data to list vaults, show
provisioning/deletion status, and navigate to a selected vault. It should not load full branch rows.

`/vault/$owner/$repo` owns the selected repository's branch list. It loads branch pages only for the
selected vault. If a selected vault is not found in the root vault list, the route keeps the current
"Vault not found" behavior.

The selected vault view may still need a small branch summary, such as the default branch name. That
summary belongs on the lightweight vault result, not in a full branch row array.

### Branch Pagination

The branch list uses Convex native pagination:

- The public branch list query takes `paginationOpts: paginationOptsValidator`.
- Stable non-pagination args, such as `vaultId` and normalized filter args, sit beside
  `paginationOpts`.
- The frontend uses `usePaginatedQuery`, not TanStack Query `useInfiniteQuery`, so Convex owns
  reactive cursor stitching and reset behavior.
- `loadMore(n)` is called only while `status === "CanLoadMore"`.
- Query arg changes intentionally reset pagination to the first page.

The page query returns branch rows in the same order the dashboard already intends:

1. default branch first
2. active branches before deleted-upstream branches
3. newest branch commit first
4. branch name as the stable tie-breaker

That order must be represented with indexable fields before the query becomes the production
pagination boundary. A `.collect()` followed by TypeScript sorting is not real pagination.

### Virtual List

The selected vault branch list is one scrollable list. It does not collapse after five rows and does
not show an expansion button.

The frontend uses `@tanstack/react-virtual` to window the loaded Convex results:

- `count` is `branches.length + 1` while Convex can load more, so the final virtual row is a loader.
- `getItemKey` uses branch identity, with a stable loader key.
- Dynamic branch row height is measured with `virtualizer.measureElement`.
- Overscan is large enough for smooth branch-row navigation, initially `5` to `8`.
- React 19 compatibility should use `useFlushSync: false` unless testing shows a reason not to.

Prefer the existing dashboard/page scrollport over a nested branch-only scroller. A nested branch
scrollport should require an explicit product decision because route-level and pane-level scroll
behavior affects mobile pull-to-refresh, edge swipe, and sticky dashboard chrome.

Virtualization means offscreen branch links are unmounted. The list keeps ordinary link semantics;
it must not become a fake `listbox` unless roving focus and keyboard behavior are implemented. The
loader row is not focusable and should expose busy/loading state without adding chatty placeholder
copy.

### Filter Metadata

The branch filter popover still needs full-catalog facts: label options, no-label count, draft
availability, and current hidden-label inclusion state.

Those facts should come from a separate metadata query or denormalized counters. They should not
force the paginated row query to load every branch row, commit summary, preview URL, and check
snapshot.

The hidden-label filter excludes branches whose PR labels match any hidden label. Arbitrary label
exclusion is not naturally represented by a single Convex index, so final server-side row pruning is
deferred. Until that strategy is chosen, the current contract is:

- filter args passed to `usePaginatedQuery` must be canonical, especially sorted `hiddenLabels`
- the row query must not hide an unbounded `.collect()` behind a paginated-looking API
- if non-indexable filtering is temporarily used, it must be explicitly bounded, named as temporary,
  and tracked for deletion

## Non-Goals

- Replacing vault branch rows with a new visual design.
- Changing the `/vault/.../fs/$branch` file route shape.
- Changing GitHub branch sync semantics or PR metadata hydration semantics.
- Removing branch filters outright.
- Building bidirectional chat-style virtualization.
- Making the root `/vault` route show multiple full branch catalogs again.
- Introducing hard UI limits for typed filter values or URL/API values.

## Decisions And Follow-Ups

| Decision                    | Current direction                                                                                                                                                                                                                               | Status   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Branch sort fields          | Required derived rank fields and the future pagination index are implemented; existing vaults can be deleted/recreated if needed.                                                                                                               | Closed   |
| Hidden-label filtering      | Keep the UI contract; loaded pages are filtered client-side while exact metadata comes from the lightweight catalog query. Decide later whether final server-side row pruning needs denormalized label rows, bounded scanning, or a changed UX. | Deferred |
| Filter count semantics      | Header counts and filter options use the lightweight full-catalog metadata query, so they remain exact while rows paginate.                                                                                                                     | Closed   |
| Scrollport ownership        | The virtual list uses the existing dashboard route scrollport through TanStack Virtual; no nested branch-only scroller was added.                                                                                                               | Closed   |
| `branchesExpanded` cleanup  | App code no longer reads or writes it; Phase 5A removed the schema field directly because existing vault/filter rows can be discarded before deploy.                                                                                            | Closed   |
| `getUserVaults` replacement | Lightweight vault list and selected-vault paginated branch rows are implemented; `getVaultRemoteBranches` remains only for non-dashboard consumers.                                                                                             | Closed   |

## Proposed Rollout

### Phase 1: Split Branch Rows Out Of The Vault List

Status: Implemented for the non-paginated route boundary.

Goal: make the route boundary match the product boundary before changing pagination mechanics.

Changes:

- Removed full `remoteBranches` rows from `getUserVaults` and `getUserVaultsContract`.
- Loaded selected-vault branches through the existing `api.vault.branches.getVaultRemoteBranches`
  query.
- Kept the branch row component and existing local filtering behavior.
- Removed branch expansion UI and frontend filter persistence in the same slice.
- Did not add a lightweight selected-vault branch summary.

Validation:

- `/vault` lists vaults without requiring branch row payloads.
- `/vault/$owner/$repo` still renders branch rows for the selected vault.
- Missing selected vault behavior is unchanged.
- Existing branch link, production link, preview URL, and check summary behavior is preserved.

### Phase 2: Add Indexable Branch Sort Fields

Status: Implemented.

Goal: make the current branch sort order expressible through a Convex index.

This rollout deliberately does not preserve old `observations_vaultRepository_branches` rows.
Samebase currently has one operator-user, and existing vaults can be deleted/recreated instead of
carrying backfill code.

Implemented behavior:

- `observations_vaultRepository_branches` requires the derived rank fields.
- Branch sync/upsert writes the rank fields for new active rows, refreshed active rows, and
  deleted-upstream transitions.
- The selected-vault branch query still uses the old collect-and-sort read path until Phase 3
  switches to paginated indexed reads.

Implemented fields:

- `defaultRank`: `0` for the default branch, `1` otherwise
- `stateRank`: `0` for active branches, `1` for deleted-upstream branches
- `commitRank`: negative commit timestamp for descending commit-time order, or
  `Number.MAX_SAFE_INTEGER` when `lastCommitAt` is missing so missing timestamps sort last
- `name`: existing tie-breaker

Implemented index:

```ts
.index("by_vault_and_defaultRank_and_stateRank_and_commitRank_and_name", [
  "vaultId",
  "defaultRank",
  "stateRank",
  "commitRank",
  "name",
])
```

Validation:

- Convex unit tests prove the derived sort fields match `compareRemoteBranchSortOrder`.
- Convex integration tests prove branch sync writes ranks on insert, preserves commit-time ranks
  when GitHub omits an unchanged timestamp, and rewrites ranks when a row becomes deleted-upstream.
- The old selected-vault branch query still works until the frontend moves to the paginated branch
  query with separate filter metadata.

### Phase 3: Introduce The Paginated Branch Query

Status: Implemented for the backend pagination boundary.

Goal: make selected-vault branch rows available through a real Convex paginated query.

Implemented behavior:

- Added `api.vault.branches.listVaultRemoteBranchesPage`.
- Uses `paginationOptsValidator` and `.paginate(args.paginationOpts)` on
  `by_vault_and_defaultRank_and_stateRank_and_commitRank_and_name`.
- Fetches preview domains and commit check snapshots only for branch rows in the returned page.
- Returns the same branch row item shape as `getVaultRemoteBranches`, wrapped in Convex's native
  pagination result shape.
- Leaves `getVaultRemoteBranches` in place for the file route's current-branch metadata lookup.
- Does not use bounded scans because Phase 3 has no server-side non-indexable filters.

Validation:

- Page 1 starts with the default branch when present.
- Active branches appear before deleted-upstream branches.
- Cursor continuation preserves deterministic order and has no duplicate branch rows.
- Branch check summaries and preview URLs are present for rows on the current page.
- Unauthorized users receive an empty native pagination page, matching the current branch-list
  access contract.

### Phase 4: Render The Virtualized Infinite List

Status: Implemented.

Goal: replace the expansion UI with a standard virtualized list powered by Convex pagination.

Implemented behavior:

- Added `@tanstack/react-virtual`.
- The selected-vault dashboard uses
  `usePaginatedQuery(api.vault.branches.listVaultRemoteBranchesPage)`.
- `VaultBranchList` renders rows through TanStack Virtual against the existing dashboard route
  scrollport instead of adding a nested branch-only scroller.
- The virtual list includes a non-focusable loader row and calls `loadMore` only while Convex
  reports `status === "CanLoadMore"`.
- `VaultDashboardScrollTargetEndPadding` now prefers the virtual list's logical end marker when
  branch rows are virtualized.
- `VaultBranchLinkRow` remains the row renderer.

Validation:

- The "Show N more branches" and "Show less branches" controls remain gone.
- Scrolling near the end loads the next page through the loader row and stops calling `loadMore`
  after pagination is exhausted.
- Branch rows do not overlap at desktop or mobile widths.
- Route-first visual coverage proves the selected vault branch list and sticky dashboard chrome.

### Phase 5A: Remove Stored Branch Expansion State

Status: Implemented.

Goal: remove the old branch-expansion storage after the paginated path is stable.

Changes:

- Removed `branchesExpanded` from the `ui_vaultBranches_filters` schema.
- Did not add migration scaffolding; existing vault/filter rows can be discarded before deploy.
- Left hidden-label row filtering unchanged as a separate backend-query design decision.

Validation:

- Unit tests keep covering filter normalization without the expansion flag.
- Visual tests keep covering branch filters without expansion controls.

### Deferred Follow-Up: Decide Hidden-Label Row Filtering

Status: Deferred.

Goal: decide whether final server-side row pruning needs denormalized label rows, bounded scanning,
or a changed UX.

Validation:

- Existing hidden-label, no-label, and include-drafts behavior is preserved or intentionally updated
  in this RFC before code changes.

## Validation Plan

Backend:

- Convex tests for branch sort-key derivation.
- Convex tests for paginated branch query auth, cursor continuation, and page row shape.
- Contract tests for the lightweight vault list result.

Frontend:

- Unit tests for normalized branch filter args passed to the paginated query.
- Fixture-backed visual tests for loader-row pagination and `loadMore` guard conditions.
- Route-level or fixture-backed visual tests for the selected vault branch list.
- Keep visual tests asserting the expansion controls are absent.

Acceptance:

- Run the standard type/lint checks for touched packages.
- Run `pnpm test:visual:linux` for shipped UI changes unless a later RFC update narrows the visual
  acceptance scope.
- For any production-read validation, follow `docs/convex-production-reads.md`.

## Update Rules

When implementation starts, keep this RFC current by editing these sections instead of appending a
long journal:

- change `Status` when the plan is accepted, partially implemented, or superseded
- mark rollout phases as implemented only after the corresponding code and validation land
- move resolved open decisions into `Target Contract`
- delete obsolete alternatives once the code proves the final direction

Do not turn this RFC into a per-commit log. PR bodies should carry short-lived implementation
details; this document should keep only the active plan and the durable decisions still needed by
future work.
