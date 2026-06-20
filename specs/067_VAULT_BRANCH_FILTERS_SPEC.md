# Vault Branch Filters Specification

## Document Control

- Status: Implemented
- Owner: Noter dashboard/frontend
- Last updated: 2026-03-24
- Background research: `rfcs/068_VAULT_BRANCH_PR_FILTERING_RESEARCH.md`

## Summary

The vault dashboard supports saved per-user, per-vault branch filtering.

The branch filter UI is inclusive:

- all labels start selected
- `No label` starts selected
- draft pull requests are excluded by default
- clearing a label hides branches carrying that label
- clearing `No label` hides unlabeled branches

## Source of Truth Files

- `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx`
- `apps/samebase/src/components/vault-dashboard/VaultBranchFilters.tsx`
- `apps/samebase/src/components/vault-dashboard/vaultDashboardBranchFilters.ts`
- `apps/samebase/src/lib/pullRequestLabels.ts`
- `apps/samebase/convex/vault/dashboard.ts`
- `apps/samebase/convex/schema.ts`

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
- server-side branch filtering
- cross-vault global branch filters
- PR review-state or author/assignee qualifiers

## Acceptance

- [x] Label filter order is stable across toggles.
- [x] The UI uses inclusive checkbox semantics.
- [x] Unlabeled branches can be shown or hidden explicitly.
- [x] Draft visibility remains a separate toggle.
- [x] Filter state persists per user and per vault.
