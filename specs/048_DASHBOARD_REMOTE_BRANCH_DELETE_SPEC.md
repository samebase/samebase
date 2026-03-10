# 048 Dashboard Remote Branch Delete Spec

## Document Control

- Status: Proposed
- Owner: Vault dashboard + GitHub integration
- Last updated: 2026-03-10
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`

## Summary

Add a delete-branch affordance to the vault dashboard branch list for remote
GitHub branches that are safe to remove.

MVP guardrails:

1. Only active remote branches can be deleted.
2. A branch must have no staged files in Noter.
3. A branch must have `0` commits ahead of the repository default branch.
4. We should also block default and protected branches in this first pass.

Assumption:

- The user request says "ahead of the Main branch". In this codebase, the safer
  interpretation is "ahead of the repository default branch", because Noter
  already supports non-`main` defaults.

## Why This Is Small

Most of the required state already exists:

1. `vaultRemoteBranches` already stores `isDefault`, `isProtected`, `aheadBy`,
   `behindBy`, and `remoteState`.
2. `VaultDashboard` already loads branch-scoped staged-file summaries via
   `fileStaging.listStagedFilesBranchSummaries`.
3. The dashboard already renders each remote branch row in one place:
   `apps/noter/src/components/VaultDashboard.tsx`.

The main missing pieces are:

1. A UI control for branch deletion.
2. A server action that re-validates safety rules and deletes the GitHub ref.
3. Explicit local cache cleanup so a user-deleted branch disappears instead of
   lingering as `deleted_upstream`.

## Proposed Changes

### 1. Frontend: branch-row action in `VaultDashboard`

Touch points:

1. `apps/noter/src/components/VaultDashboard.tsx`
2. `apps/noter/convex/vault.ts` result shape for `getUserVaults`

Changes:

1. Extend the dashboard branch payload to include `isProtected`.
2. Compute branch delete eligibility in the dashboard from:
   - `remoteState === "active"`
   - `isDefault === false`
   - `isProtected === false`
   - staged summary total for that branch is `0`
   - cached `aheadBy === 0`
3. Render a small delete action only for eligible rows.
4. Show a lightweight confirmation dialog before deletion.
5. Disable the action while the delete request is in flight and show the error
   inline if the server rejects it.

UI note:

- If `aheadBy` is missing, do not show the delete action. We should fail closed
  when ahead/behind data is unavailable.

### 2. Backend: delete action with server-side revalidation

Preferred touch point:

1. `apps/noter/convex/vaultActions.ts`

Add action:

- `vaultActions.deleteRemoteBranch({ vaultId, branchName })`

Behavior:

1. Verify the vault exists and belongs to the current user.
2. Verify GitHub is connected.
3. Load the branch from `vaultRemoteBranches` by `vaultId + branchName`.
4. Reject if the branch is missing, already `deleted_upstream`, default, or
   protected.
5. Reject if there are staged files for that branch.
6. Re-read the repository default branch from GitHub and recompute ahead/behind
   for the target branch before deleting. Do not trust cached `aheadBy` alone
   for the final destructive check.
7. Reject unless the branch is exactly `0` commits ahead of the current default
   branch.
8. Call GitHub ref deletion:
   `octokit.rest.git.deleteRef({ owner, repo, ref: "heads/<branch>" })`

This makes the UI optimistic but not authoritative. The server stays as the real
safety boundary.

### 3. Local cache cleanup after delete

Relevant current behavior:

1. `syncVaultRemoteBranches` currently converts missing remote branches into
   `deleted_upstream` rows.
2. That is useful for unexpected upstream deletion with local work, but not for
   a user-triggered delete that is already restricted to "no staged work" and
   "not ahead".

MVP behavior after successful delete:

1. Remove the deleted branch row from `vaultRemoteBranches`.
2. Remove the deleted branch row from `vaultBranchTrees`.
3. Optionally trigger a normal remote-branch refresh afterward so remaining
   branches keep fresh ahead/behind and PR metadata.

Result:

- The deleted branch disappears from the dashboard immediately instead of
  showing as a line-through tombstone.

## Data Contract Impact

No schema migration is required.

Expected contract changes:

1. `vault.getUserVaults` should include `isProtected` inside each
   `remoteBranches` item so the dashboard can hide the delete affordance for
   protected branches.
2. No new Convex tables are needed.

## Validation

### Unit / integration coverage

1. Add a small pure helper test for branch delete eligibility rules.
2. Add backend tests for the destructive guard logic:
   - rejects default branch
   - rejects protected branch
   - rejects when staged files exist
   - rejects when branch is ahead of default
   - allows delete when ahead is `0` and staged count is `0`
3. Add cache cleanup coverage so a successful delete removes the local branch
   row rather than leaving `deleted_upstream`.

### Manual coverage

Add a focused dashboard manual test covering:

1. eligible branch shows delete action
2. ahead branch does not show delete action
3. branch with staged files does not show delete action
4. successful delete removes the row from the dashboard and from GitHub

## Out Of Scope

1. Branch creation, rename, or restore UI
2. Deleting branches from FileView or chat
3. Bulk branch deletion
4. Auto-deleting `deleted_upstream` tombstones created outside this flow

## Recommended Implementation Order

1. Extend `getUserVaults` branch payload with `isProtected`.
2. Add the backend delete action and local cache prune path.
3. Add the dashboard affordance + confirmation dialog.
4. Add tests and a short manual-test doc.
