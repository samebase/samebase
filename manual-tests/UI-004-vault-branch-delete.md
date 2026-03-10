# UI-004: Vault dashboard remote branch delete

## Purpose

Verify the vault dashboard can delete eligible remote branches from GitHub while
keeping delete unavailable for branches with staged files or commits ahead of
the default branch.

## Preconditions

- `make anon` can run in the current checkout.
- A connected vault has at least:
  - one active non-default branch with `0` staged files and `0` commits ahead
  - one branch with staged files
  - one branch that is ahead of the default branch
- GitHub connection is active for the current user.

## Steps

1. Start the app with `make anon`.
2. Open the dashboard and locate a vault card with multiple remote branches.
3. Confirm the eligible branch shows a delete action in its row.
4. Confirm the branch with staged files does not show the delete action.
5. Confirm the ahead branch does not show the delete action.
6. Click the eligible branch delete action.
7. Confirm the delete dialog names the target branch and repository.
8. Confirm the delete request completes successfully.
9. Verify the deleted branch disappears from the dashboard branch list.
10. Open the repository on GitHub and verify the same branch no longer exists.

## Expected Results

1. Only eligible branches expose the delete control.
2. Deleting an eligible branch removes it from GitHub and from the dashboard.
3. The deleted branch does not remain visible as a `deleted_upstream` tombstone.

## Cleanup

- Stop the local dev server (Ctrl+C).
