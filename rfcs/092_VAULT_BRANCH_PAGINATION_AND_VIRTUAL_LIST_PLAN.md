# 092 Vault Branch Pagination And Virtual List Plan

## Document Control

- Status: Partially implemented active rollout plan
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

1. Stop making `getUserVaults` return full branch rows for every vault. Implemented in Phase 1.
2. Move selected-vault branch rows behind a per-vault Convex query. Implemented in Phase 1 through
   `api.vault.branches.getVaultRemoteBranches`.
3. Add real Convex cursor pagination for branch rows once the branch sort order is indexable.
   Implemented in Phase 3 as `api.vault.branches.listVaultRemoteBranchesPage`.
4. Render the selected vault's branches as one virtualized scroll surface with TanStack Virtual.
5. Remove the `Show N more branches`/`Show less branches` expansion behavior. Implemented in Phase 1
   for app code; the old schema field awaits cleanup migration.

This RFC is intentionally a live plan. Update the rollout status and open decisions as each slice
lands. When the behavior is accepted and implemented, reduce this document into a compact spec or
archive it if code and tests are enough.

## Current State

`/vault` and `/vault/$owner/$repo` both render `VaultDashboard`. The selected repository route only
narrows the already-loaded vault array in React.

Phase 1 removed `remoteBranches` from `api.vault.dashboard.getUserVaults`. The query now returns
vault-level dashboard state only: provisioning/deletion state, staged-file summary inputs, app
roots, and provider resources.

`/vault/$owner/$repo` loads its branch rows through the existing
`api.vault.branches.getVaultRemoteBranches` query. That query still collects all branches for the
selected vault and sorts in TypeScript because the current filter header derives full-catalog label
options and counts from the same loaded array.

`api.vault.branches.listVaultRemoteBranchesPage` now exists for the selected-vault branch row path.
It uses Convex native pagination over the sorted branch index and attaches commit check summaries
and preview URLs only for the returned page. The dashboard frontend will switch to this query when
the virtual list and filter metadata boundary land.

The frontend still applies branch filters locally to the selected vault's loaded branch rows. Phase
1 removed the branch expansion limit and deleted `Show N more branches`/`Show less branches` from
app code. `branchesExpanded` is no longer read or written, but the optional Convex schema field
remains until a cleanup migration deletes old stored values.

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
| Branch sort fields          | Required derived rank fields and the future pagination index are implemented; existing vaults can be deleted/recreated if needed.   | Closed |
| Hidden-label filtering      | Keep the UI contract, but decide whether exact server pagination needs denormalized label rows, bounded scanning, or a changed UX.  | Open   |
| Filter count semantics      | Keep full-catalog filter options; decide whether the header shows exact filtered totals, loaded counts, or no count during rollout. | Open   |
| Scrollport ownership        | Prefer the existing dashboard/page scrollport and virtualize within it; add a nested list scroller only with an explicit reason.    | Open   |
| `branchesExpanded` cleanup  | App code no longer reads or writes it; delete the schema field after a cleanup migration removes old stored values.                 | Open   |
| `getUserVaults` replacement | Lightweight vault list is implemented; replace the temporary selected-vault collect query with a paginated branch query next.       | Closed |

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
- Did not add a lightweight selected-vault branch summary; current chat links derive from the
  selected vault's branch query rows.

Validation:

- `/vault` lists vaults without requiring branch row payloads.
- `/vault/$owner/$repo` still renders branch rows for the selected vault.
- Missing selected vault behavior is unchanged.
- Existing branch link, production link, preview URL, and check summary behavior is preserved.

### Phase 2: Add Indexable Branch Sort Fields

Status: Implemented.

Goal: make the current branch sort order expressible through a Convex index.

This rollout deliberately does not preserve old `vaultRemoteBranches` rows. Samebase currently has
one operator-user, and existing vaults can be deleted/recreated instead of carrying backfill code.

Implemented behavior:

- `vaultRemoteBranches` requires the derived rank fields.
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
- Leaves `getVaultRemoteBranches` in place for current full-catalog dashboard filters and the file
  route's current-branch metadata lookup until the later frontend/filter slices replace those
  dependencies.
- Does not use bounded scans because Phase 3 has no server-side non-indexable filters.

Validation:

- Page 1 starts with the default branch when present.
- Active branches appear before deleted-upstream branches.
- Cursor continuation preserves deterministic order and has no duplicate branch rows.
- Branch check summaries and preview URLs are present for rows on the current page.
- Unauthorized users receive an empty native pagination page, matching the current branch-list
  access contract.

### Phase 4: Render The Virtualized Infinite List

Goal: replace the expansion UI with a standard virtualized list powered by Convex pagination.

Changes:

- Add `@tanstack/react-virtual`.
- Replace `VaultBranchList` mapping over every branch with a virtualized row container.
- Add a non-focusable loader row that calls `loadMore` when the last virtual item approaches the
  loaded result boundary.
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
- Run a cleanup migration for old `branchesExpanded` values.
- Remove the deprecated optional schema field after migrated production data proves it is absent.

Validation:

- Existing hidden-label, no-label, and include-drafts behavior is preserved or intentionally updated
  in this RFC before code changes.
- Old `vaultBranchFilters` rows with `branchesExpanded` are removed before schema narrowing.
- Unit tests keep covering filter normalization without the expansion flag.
- Visual tests keep covering branch filters without expansion controls.

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
