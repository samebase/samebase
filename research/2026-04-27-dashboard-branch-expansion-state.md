# Dashboard Branch Expansion State

## Problem Statement

The dashboard branch list can become noisy when a repository has many branches. The intended UI is a
simple collapsed list that shows the first few branches by default, then lets the user expand or
collapse the full branch list.

The open product question is where the expansion state should live. Because the dashboard is already
backed by Convex subscriptions and repo-local guidance says user-visible UI state should persist in
Convex by default, the answer should start from the existing Convex state model instead of local
component state.

## Existing State Homes

- `apps/noter/convex/schema.ts:349` defines `dashboardSettings` as one row per user for
  dashboard-level chrome such as provider panel and chat dock state. That is too global for
  branch-list expansion because expansion is naturally scoped to one vault.
- `apps/noter/convex/schema.ts:358` defines `workspaceSidebarState`, and
  `apps/noter/convex/workspaceSidebarStateModel.ts:33` explicitly limits that table to shell-owned
  geometry and pane selection. Dashboard branch expansion is route/domain state, not shared sidebar
  chrome.
- `apps/noter/convex/schema.ts:363` defines `vaultBranchFilters` as a per-user, per-vault
  branch-list preference record. It already stores branch-list display choices and is fetched by
  `apps/noter/convex/vault.ts:307` for all dashboard vaults.
- `apps/noter/convex/schema.ts:645` defines `folderExpansionState` for per-folder tree expansion. It
  has the right persistence flavor but the wrong domain; reusing it for dashboard branches would mix
  file-tree paths with repository branch rows.

## Recommendation

Store the branch-list expansion bit with `vaultBranchFilters`.

The minimal shape is an optional `branchesExpanded` boolean on the existing per-user, per-vault
record:

```ts
vaultBranchFilters: defineTable({
  userId: v.id("users"),
  vaultId: v.id("vaults"),
  hiddenLabels: v.array(v.string()),
  includeDrafts: v.boolean(),
  includeNoLabel: optional(boolean()),
  branchesExpanded: optional(boolean()),
});
```

Why this is the best current home:

1. The desired state has the same ownership as branch filters: one user, one vault, one dashboard
   branch list.
2. `getUserVaultBranchFilters` is already subscribed by the dashboard, so this avoids adding a
   second query and table for a single boolean.
3. The current `setVaultBranchFilters` mutation already verifies the vault belongs to the user
   before writing the row.
4. It keeps the row sparse. Missing `branchesExpanded` means the default collapsed state, so no
   backfill is needed.

The name `vaultBranchFilters` becomes slightly narrower than the data it owns, but this is still
preferable to adding another table for one adjacent display preference. If the branch list gains
more non-filter preferences, then the table should be renamed or replaced by a clearer
`vaultBranchPreferences` model in a dedicated cleanup.

## Implementation Sketch

1. Add `branchesExpanded: optional(boolean())` to the schema and `vaultBranchFiltersValidator`.
2. Return `branchesExpanded: vaultBranchFilter.branchesExpanded === true` from
   `getUserVaultBranchFilters`.
3. Update `setVaultBranchFilters` so it persists a row when any non-default preference is present:
   - `hiddenLabels.length > 0`
   - `includeDrafts === true`
   - `includeNoLabel === false`
   - `branchesExpanded === true`
4. Continue deleting the row when every preference returns to its default. The absence of a row
   means "collapsed with default filters."
5. In `VaultBranchSection`, filter first, then slice:
   - `filteredRemoteBranches = filterVaultRemoteBranches(remoteBranches, filters)`
   - `visibleRemoteBranches = branchesExpanded ? filteredRemoteBranches : filteredRemoteBranches.slice(0, 3)`
6. Render the expansion control only when `filteredRemoteBranches.length > 3`. The collapsed button
   can say `Show N more`; the expanded button can say `Show less`.

The slice should happen after filtering because the branch count and button label should reflect
what the user can currently see. The server already sorts remote branches deterministically in
`apps/noter/convex/vault.ts:606`, and `getUserVaults` serves that order at
`apps/noter/convex/vault.ts:949`, so the UI should preserve that order and only choose how many rows
to render.

## Behavior Notes

- Expansion should be per vault, not global. Expanding one noisy repository should not expand every
  repository on the dashboard.
- Expansion should not be tied to a specific filter set. If the user expands a vault, changes label
  filters, and later removes the filters, the vault should remain expanded until explicitly
  collapsed.
- If a repository drops to three or fewer filtered branches, the expansion button can disappear
  without forcing a mutation. The persisted `true` value can still apply later if more branches
  return.
- Deleted-upstream branches should follow the existing branch filter and sort behavior. The
  expansion feature should not introduce its own branch ordering.

## Rejected Options

- `dashboardSettings`: too broad because it is one row per user, not per vault. Adding a map of
  vault expansion state would create an unbounded global settings blob and duplicate
  `vaultBranchFilters` ownership checks.
- `workspaceSidebarState`: explicitly scoped to shell geometry and pane selection, not route-owned
  branch-list state.
- `folderExpansionState`: domain-specific to file-tree paths. Reusing it would blur tree expansion
  with dashboard branch expansion.
- Local React state only: simplest mechanically, but it would reset on reload and conflict with the
  repo preference to persist user-visible UI state in Convex by default.
- A new `vaultBranchExpansionState` table: semantically clean, but unnecessary until branch-list
  display preferences outgrow the existing per-vault branch preferences record.

## Validation Plan

- Convex unit coverage for defaulting missing `branchesExpanded` to `false`, preserving rows when
  expansion is the only non-default value, and deleting rows when expansion returns to `false` with
  default filters.
- Component or route-level coverage for collapsed, expanded, and filtered branch counts.
- Visual coverage for mobile and desktop dashboard branch lists with more than three visible
  branches.
