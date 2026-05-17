# Vault Branch Filters Specification

## Document Control

- Status: Implemented
- Owner: Noter dashboard/frontend
- Last updated: 2026-05-17
- Background research:
  - `rfcs/068_VAULT_BRANCH_PR_FILTERING_RESEARCH.md`
  - `research/2026-05-17-dashboard-branch-pagination-filtering.md`

## Summary

The vault dashboard supports saved per-user, per-vault branch filtering.

The branch filter UI is inclusive:

- all labels start selected
- `No label` starts selected
- draft pull requests are excluded by default
- clearing a label hides branches carrying that label
- clearing `No label` hides unlabeled branches

## Source of Truth Files

- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
- `apps/noter/src/components/vault-dashboard/VaultBranchFilters.tsx`
- `apps/noter/src/components/vault-dashboard/vaultDashboardBranchFilters.ts`
- `apps/noter/src/lib/pullRequestLabels.ts`
- `apps/noter/convex/vault/dashboard.ts`
- `apps/noter/convex/schema.ts`

## UI Behavior

### Placement

- Each vault card keeps a single `Filters` control in the `Branches` section header.
- Desktop uses a popover.
- Touch-first devices use a bottom sheet.

### Label semantics

- The filter list shows labels in a stable alphabetical order.
- Selection order must not reorder the list.
- The final entry after the labels is always `No label`.
- A checked item means those branches remain visible.
- An unchecked item means those branches are hidden.

### Draft semantics

- `Include drafts` is a separate toggle.
- Default behavior hides draft pull requests.
- Enabling `Include drafts` restores draft PR branches to the list.

### Result summary

- When filters hide any rows, the header shows the visible count summary (`visible of total`).
- Branch rows remain a single list; filtering does not introduce separate tabs or grouped sections.

### Pagination safety update

The implemented filter model operates on the branch rows currently loaded by the dashboard branch
paginator. Under paginated branch loading, `visible of total` means "visible loaded rows of loaded
rows" unless the UI has loaded every branch or a backend count/filter result explicitly provides the
repository-wide total.

Pagination-safe rules:

- Do not present loaded-page filter counts as exact repository-wide counts.
- Label option counts derived from loaded branch rows are loaded-label counts.
- Exact total branch counts must come from maintained branch stats, not from the loaded branch
  array.
- Exact repository-wide filtered counts require a backend filtered query or maintained filter/facet
  stats.
- If the UI keeps client-side filtering for now, copy and layout should make the loaded scope clear.

## Persistence Model

Saved filters are scoped by `(userId, vaultId)` in `vaultBranchFilters`.

Stored fields:

- `hiddenLabels: string[]`
- `includeDrafts: boolean`
- `includeNoLabel?: boolean`

`includeNoLabel` stays optional at the storage layer so rows written before unlabeled-branch support
remain readable until users resave their filters.

## Filtering Rules

Given one branch row:

1. If the branch is draft and `includeDrafts` is `false`, hide it.
2. If the branch has no PR labels, show it only when `includeNoLabel` is `true`.
3. If the branch has PR labels, hide it when any of its labels appear in `hiddenLabels`.
4. Otherwise keep it visible.

This preserves the backend's compact hidden-label storage while presenting an inclusive checkbox
model in the UI.

## Non-Goals

- GitHub-complete search syntax
- server-side branch filtering in the implemented v1 filter slice
- cross-vault global branch filters
- PR review-state or author/assignee qualifiers

Server-side filtering is no longer a general non-goal for the dashboard. It is a pagination-safety
follow-up, and it should be designed around index-friendly predicates or a dedicated
inverted-index/facet model instead of retrofitting the current loaded-array filter as if it were
global.

## Acceptance

- [x] Label filter order is stable across toggles.
- [x] The UI uses inclusive checkbox semantics.
- [x] Unlabeled branches can be shown or hidden explicitly.
- [x] Draft visibility remains a separate toggle.
- [x] Filter state persists per user and per vault.
- [ ] Pagination-safe count copy does not imply loaded filters are global.
