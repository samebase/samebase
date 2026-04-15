# UI-002: Vault dashboard branch list and branch-scoped navigation

## Purpose

Verify each vault card shows remote branches as a vertical link list, keeps the
repository default branch first, and opens FileView on the selected branch with
branch-scoped staged-file summary chips.

## Preconditions

- `pnpm anon` can run in the current checkout.
- At least one connected vault has 2+ remote branches.
- The vault has staged-file activity on at least two different branches.
- Optional for full ordering coverage: at least one `deleted_upstream` branch
  entry and at least two non-default active branches with equal
  `lastCommitAt`/recency.

## Steps

1. Start the app with `pnpm anon`.
2. Open the dashboard and locate a vault card with multiple branches.
3. Confirm branch entries are rendered as links in a vertical list (not a
   horizontal button row).
4. Confirm the first branch is the repo default branch (for example `main`,
   `master`, or custom default).
5. Confirm non-default active branches are ordered by most recent commit
   activity (primary ordering check in this test).
6. Click a non-default branch link.
7. Confirm FileView opens for that branch and the URL includes the branch
   segment.
8. Record the staged summary chips for that branch (added/modified/deleted/
   renamed totals).
9. Navigate back to dashboard, open a different branch, and compare the staged
   summary chips.
10. Confirm the second branch shows its own branch-specific counts, not reused
    values from the previous branch.
11. Optional full-ordering check: if any `deleted_upstream` branches are shown,
    confirm active branches appear before those entries.
12. Optional tie-break check: if two non-default active branches have equal
    recency, confirm they are ordered alphabetically.

## Expected Results

1. Branches are link-based, vertically listed, with default branch pinned first
   and remaining active branches sorted by latest activity in descending order.
   This baseline test asserts the primary ordering dimension (recency) and
   default-branch pinning; optional Steps 11-12 extend coverage for remote-state
   and alphabetical tie-break ordering.
2. Clicking a branch navigates to the correct branch context, and staged summary
   chips reflect only that branch.

## Optional Evidence

- Screenshot of vault card branch list before click.
- Screenshot of FileView after selecting each branch.

## Cleanup

- Stop the local dev server (Ctrl+C).
