# 092 Vault Branch Pagination And Virtual List Plan

## Document Control

- Status: Proposed active rollout plan
- Owner: Samebase dashboard and Convex vault
- Last updated: 2026-07-04
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
  - `specs/100_CONVEX_VAULT_MODULE_LAYOUT_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`
- Related RFCs:
  - `rfcs/087_PR_CHECKS_BASED_REFRESH_PLAN.md`
  - `rfcs/088_BRANCH_TIP_CHECKS_DASHBOARD_PLAN.md`
- Related files:
  - `apps/samebase/convex/schema.ts`
  - `apps/samebase/convex/vault/branches.ts`
  - `apps/samebase/convex/vault/dashboard.ts`
  - `apps/samebase/convex/vault/getUserVaultsContract.ts`
  - `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/samebase/src/components/vault-dashboard/VaultDashboardBranchSectionState.ts`
  - `apps/samebase/src/components/vault-dashboard/vaultDashboardBranchFilters.ts`
  - `apps/samebase/e2e/vault-dashboard-visual.spec.ts`
- External references:
  - [Convex paginated queries](https://docs.convex.dev/database/pagination)
  - [Convex React `usePaginatedQuery`](https://docs.convex.dev/api/modules/react#usepaginatedquery)
  - [TanStack Virtual React adapter](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)
  - [TanStack Virtual infinite scroll example](https://tanstack.com/virtual/v3/docs/framework/react/examples/infinite-scroll)

## Summary

The vault route split means `/vault/$owner/$repo` can own one repository's branch list directly. The
dashboard no longer needs the old `/home` style behavior where one route rendered every vault card
with every branch already embedded.

The accepted direction for this rollout is:

1. Stop making `getUserVaults` return full branch rows for every vault.
2. Move selected-vault branch rows behind a per-vault Convex query.
3. Add real Convex cursor pagination for branch rows once the branch sort order is indexable.
4. Render the selected vault's branches as one virtualized scroll surface with TanStack Virtual.
5. Remove the `Show N more branches`/`Show less branches` expansion behavior.

This RFC is intentionally a live plan. Update the rollout status and open decisions as each slice
lands. When the behavior is accepted and implemented, reduce this document into a compact spec or
archive it if code and tests are enough.

## Current State

`/vault` and `/vault/$owner/$repo` both render `VaultDashboard`. The selected repository route only
narrows the already-loaded vault array in React.

`api.vault.dashboard.getUserVaults` currently returns a `remoteBranches` array on every vault. The
backend collects all `vaultRemoteBranches` for each vault, collects domains, fetches commit check
snapshots for every branch head, sorts the full branch array in TypeScript, and maps every branch
into the dashboard payload.

The frontend then applies branch filters and the branch expansion limit locally:

- `VaultDashboardBranchSectionState.ts` filters branches and slices to `COLLAPSED_BRANCH_LIMIT = 5`.
- `VaultBranchListExpansionControl` renders `Show N more branches` and `Show less branches`.
- `branchesExpanded` is stored on the per-user/per-vault `vaultBranchFilters` row.

This was reasonable when the root dashboard had to show multiple vault cards, but it is now the
wrong data boundary for a selected-vault route with a potentially large branch catalog.

## Target Contract

### Route And Query Ownership

`/vault` remains the vault picker/list route. It should load enough data to list vaults, show
provisioning/deletion status, and navigate to a selected vault. It should not load full branch rows.

`/vault/$owner/$repo` owns the selected repository's branch list. It loads branch pages only for the
selected vault. If a selected vault is not found in the root vault list, the route keeps the current
"Vault not found" behavior.

The selected vault view may still need a small branch summary, such as the default branch name or a
primary branch name for chat links. That summary belongs on the lightweight vault result, not in a
full branch row array.

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

The current hidden-label filter is the least settled part of the design. It excludes branches whose
PR labels match any hidden label, and arbitrary label exclusion is not naturally represented by a
single Convex index. Until the exact backend strategy is chosen, this RFC only accepts these
constraints:

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

## Open Decisions

| Decision                    | Current direction                                                                                                                   | Status |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Branch sort fields          | Add derived indexable fields on `vaultRemoteBranches` and backfill them before switching the paginated query to production.         | Open   |
| Hidden-label filtering      | Keep the UI contract, but decide whether exact server pagination needs denormalized label rows, bounded scanning, or a changed UX.  | Open   |
| Filter count semantics      | Keep full-catalog filter options; decide whether the header shows exact filtered totals, loaded counts, or no count during rollout. | Open   |
| Scrollport ownership        | Prefer the existing dashboard/page scrollport and virtualize within it; add a nested list scroller only with an explicit reason.    | Open   |
| `branchesExpanded` cleanup  | Stop reading/writing it when the expansion UI is removed; delete the schema field only after old rows no longer need compatibility. | Open   |
| `getUserVaults` replacement | Keep a lightweight vault list query and introduce selected-vault branch/page queries instead of growing the old dashboard contract. | Open   |

## Proposed Rollout

### Phase 1: Split Branch Rows Out Of The Vault List

Goal: make the route boundary match the product boundary before changing pagination mechanics.

Changes:

- Remove full `remoteBranches` rows from `getUserVaults` and `getUserVaultsContract`.
- Add any lightweight selected-vault summary needed by the current UI, such as `primaryBranchName`.
- Load selected-vault branches through a per-vault query.
- Keep the branch row component and existing sorting/filtering behavior during this phase if needed.

Validation:

- `/vault` lists vaults without requiring branch row payloads.
- `/vault/$owner/$repo` still renders branch rows for the selected vault.
- Missing selected vault behavior is unchanged.
- Existing branch link, production link, preview URL, and check summary behavior is preserved.

### Phase 2: Add Indexable Branch Sort Fields

Goal: make the current branch sort order expressible through a Convex index.

Use a widen-migrate-narrow workflow:

1. Widen: add optional derived sort fields to `vaultRemoteBranches`.
2. Dual write: update branch sync/upsert paths to write the new fields for all new and refreshed
   branch rows.
3. Dual read: keep old read paths working while the fields are optional.
4. Backfill: run a batched Convex migration for existing branch rows.
5. Verify: confirm no branch row is missing the new fields.
6. Narrow: make the fields required only after production data is migrated and the paginated query
   no longer needs old-shape compatibility.

Candidate fields:

- `sortDefaultRank`: `0` for the default branch, `1` otherwise
- `sortRemoteStateRank`: `0` for active branches, `1` for deleted-upstream branches
- `sortLastCommitAtRank`: numeric descending commit-time rank with a stable fallback
- `name`: existing tie-breaker

Candidate index:

```ts
.index("by_vault_and_dashboard_sort", [
  "vaultId",
  "sortDefaultRank",
  "sortRemoteStateRank",
  "sortLastCommitAtRank",
  "name",
])
```

Validation:

- Convex unit tests prove the derived sort fields match `compareRemoteBranchSortOrder`.
- Migration dry-run and migration status prove all existing rows are backfilled.
- The old selected-vault branch query still works during the migration window.

### Phase 3: Introduce The Paginated Branch Query

Goal: make selected-vault branch rows a real Convex paginated query.

Changes:

- Add `listVaultRemoteBranchesPage` or equivalent under `vault/branches.ts`.
- Use `paginationOptsValidator` and `.paginate(args.paginationOpts)` on the sorted branch index.
- Fetch domains and commit check snapshots only for the page's branch heads.
- Return the same row shape the frontend branch row component already consumes.
- Use `maximumRowsRead` and/or `maximumBytesRead` only when a concrete filter strategy needs a
  bounded scan; do not use these as a substitute for the sorted index.

Validation:

- Page 1 starts with the default branch when present.
- Active branches appear before deleted-upstream branches.
- Cursor continuation preserves deterministic order and has no duplicate branch rows.
- Branch check summaries and preview URLs are present for rows on the current page.
- Unauthorized users receive an empty page or access error matching the current access contract.

### Phase 4: Render The Virtualized Infinite List

Goal: replace the expansion UI with a standard virtualized list powered by Convex pagination.

Changes:

- Add `@tanstack/react-virtual`.
- Replace `VaultBranchList` mapping over every branch with a virtualized row container.
- Add a non-focusable loader row that calls `loadMore` when the last virtual item approaches the
  loaded result boundary.
- Remove `VaultBranchListExpansionControl` and its header wiring.
- Update `VaultDashboardScrollTargetEndPadding` if it depends on mounted branch row geometry.
- Keep `VaultBranchLinkRow` as the row renderer unless measurement requires a thin wrapper.

Validation:

- The "Show N more branches" and "Show less branches" controls are gone.
- Scrolling near the end loads the next Convex page exactly once per page boundary.
- Branch rows do not overlap at desktop or mobile widths.
- Focus remains coherent when filters reset the loaded pages.
- Route-first visual coverage proves the selected vault branch list and sticky dashboard chrome.

### Phase 5: Resolve Filter Counts And Cleanup Stored Expansion State

Goal: finish the behavioral cleanup after the paginated path is stable.

Changes:

- Move filter option/count calculation to its final query or denormalized model.
- Decide and implement exact header count behavior.
- Stop persisting `branchesExpanded` in `setVaultBranchFilters`.
- Remove frontend references to `branchesExpanded`.
- Leave the schema field optional and deprecated until it is safe to remove, or run a cleanup
  migration if the field must disappear.
- Delete tests and visual fixture state that exist only for branch expansion.

Validation:

- Existing hidden-label, no-label, and include-drafts behavior is preserved or intentionally updated
  in this RFC before code changes.
- Old `vaultBranchFilters` rows with `branchesExpanded` do not break reads.
- Unit tests cover filter normalization without the expansion flag.
- Visual tests cover branch filters without expansion controls.

## Validation Plan

Backend:

- Convex tests for branch sort-key derivation.
- Convex tests for paginated branch query auth, cursor continuation, and page row shape.
- Migration dry-run and post-run verification for sort fields.
- Contract tests for the lightweight vault list result.

Frontend:

- Unit tests for normalized branch filter args passed to the paginated query.
- Component tests for loader-row behavior and `loadMore` guard conditions.
- Route-level or fixture-backed visual tests for the selected vault branch list.
- Remove or rewrite existing visual tests that click `Show N more branches`.

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
