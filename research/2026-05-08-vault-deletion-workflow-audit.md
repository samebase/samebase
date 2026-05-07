# Vault Deletion Workflow Audit

## Context

Production vault deletion failed after staged changes and remote branches were
manually cleaned up. A production Convex log reproduced the relevant failure
class from a read-only `testQuery`:

```text
Too many bytes read in a single function execution (limit: 16777216 bytes).
Consider using smaller limits in your queries, paginating your queries, or
using indexed queries with a selective index range expressions.
```

The immediate failing shape matches the current vault deletion code, but the
deeper issue is that vault deletion is modeled as one blocking action plus one
large mutation. That makes a destructive product workflow depend on a single
transaction staying below Convex read/write/document limits.

## Current Flow

The dashboard calls `api.vaultActions.deleteVault` from
`VaultDashboard.handleRemoveVault`.

The action:

1. authenticates the user
2. optionally deletes Cloudflare/Convex/GitHub/Codespace resources
3. calls `api.vault.removeVault`

`removeVault` then tries to delete all local vault data in one mutation.

This ordering creates a partial-failure risk: external resources can be removed
successfully, then local Convex cleanup can fail and leave the vault visible in
the dashboard with broken backing resources.

## Immediate Code Findings

`apps/noter/convex/vault.ts` has three vault-scoped scans that use `.filter()`
instead of storage-level index ranges:

1. `blobs` by `vaultId`
2. `fileStaging` by `vaultId`
3. `folderExpansionState` by `vaultId`

`fileStaging` already has a `by_vault` index, and `folderExpansionState` already
has `by_user_and_vault`, so those reads can be converted without schema work.

`blobs` only has `by_sha`, so vault cleanup and sibling upload cleanup need a
new `by_vault` index.

`apps/noter/convex/fileStaging.ts` has the sibling blob scan in
`deletePendingUploadBlob`. It already queries `fileStaging` with `by_vault`, but
then scans all `blobs` and filters by `vaultId`.

`removeVault` also deletes the vault row in the middle of the cleanup and then
tries to delete it again at the end. The second delete is caught, but the order
and comments are misleading. The vault row should be deleted once, last, after
dependent cleanup succeeds.

## Larger Design Finding

Adding `blobs.by_vault` is necessary but not sufficient.

Even with indexes, the current mutation still uses `.collect()` and deletes
every matching row and storage object in one transaction. A single vault can
grow past one or more Convex mutation limits:

1. 16 MiB data read
2. 16 MiB data written
3. 32,000 documents scanned
4. 16,000 documents written
5. 1 second of query/mutation user-code execution time

Convex's current docs also say data filtered out by `.filter()` counts as
scanned/read, and that full-table/range `.collect()` scans every row in the
range. The index fix reduces the range, but unbounded per-vault cleanup can
still outgrow one mutation.

The accepted Vault-First spec already points in this direction: destructive
vault cleanup must include dependent vault-scoped tables, fail closed when scope
cannot be proven, and not be hidden inside normal product behavior.

Current `removeVault` does not cover all tables listed by that spec. Missing or
partially modeled dependents include:

1. `vaultInfrastructureOwnership`
2. `appProvisioningRuns`
3. `appProvisioningEvents`
4. `agentGraphNodeLayout`
5. `agentThreadContext`
6. `aiProdAccessRequests`
7. `aiProdAccessAudit`

`aiProdAccessAudit` needs special care because it is an audit boundary and does
not store `vaultId` directly. If product policy says these audit rows should be
removed with a vault, deletion must derive them through
`aiProdAccessRequests.requestId` and do that deliberately. If audit retention
wins, the vault deletion design should preserve or detach them explicitly rather
than accidentally orphaning them.

## Recommended Direction

Treat vault deletion as a durable deletion run, not as an instant mutation.

The shape should be:

1. Add a deletion run model.
   - Store `userId`, `vaultId`, requested external teardown options, status,
     current phase, last error, timestamps, and a workflow id.
   - Either add a vault `deleting` state or keep a separate indexed
     `vaultDeletionRuns` table that the dashboard can subscribe to.
2. Replace the dashboard's blocking delete call with `requestVaultDeletion`.
   - The UI should close the modal after the request is accepted.
   - The vault card/list row should show a quiet deleting state or disappear
     only after the vault row is actually removed.
   - If the run fails, the UI should show the stored backend error message.
3. Use the Workflow component for durable orchestration.
   - External provider teardown should be idempotent workflow action steps.
   - Provider "not found" should count as success.
   - The workflow completion handler should mark the deletion run succeeded or
     failed.
4. Use batched mutations for table cleanup.
   - Each table cleanup must use an index-backed query and a bounded batch.
   - Delete the vault row only after every dependent table phase finishes.
   - Use the existing `deleteCollaborativeUpdatesBatch` pattern as the local
     reference for scheduler-chained batches.
5. Keep the cleanup registry explicit and fail closed.
   - Each table entry should name the table, index, owner field(s), and whether
     deleting it is product data, cache data, external-resource metadata, or
     audit data.
   - If a table has no safe vault-scoped index/path, the run should fail before
     deleting anything from that table.

For very large cleanup, use a hybrid model: Workflow owns the durable
user-visible run and external side effects, while scheduler-chained internal
mutations do unbounded row deletion in batches. The Workflow component is not a
license to put thousands of cleanup steps into one workflow journal; its own
README documents journal and mutation-limit constraints.

## Near-Term Patch Option

A small patch can reduce the current production failure probability:

1. Add `blobs.by_vault`.
2. Update the blob cleanup scans in `removeVault` and `deletePendingUploadBlob`.
3. Update `removeVault` to use existing indexes for `fileStaging` and
   `folderExpansionState`.
4. Delete the vault row once, last.
5. Keep the UI's direct backend error message path, but avoid swallowing backend
   failures in deletion code that should abort the operation.

That patch is useful as a bridge, but it should be framed as a tactical
stabilization. It does not satisfy the gradual deletion requirement.

## Validation Plan

1. Add unit coverage for the deletion plan/registry so table scope is explicit.
2. Add Convex tests for the batch cleanup mutations with multiple batches.
3. Add a dashboard test for a deletion run that is accepted, fails later, and
   surfaces `lastError`.
4. Run `pnpm anon` before typecheck/test workflows in this worktree.
5. Run `pnpm typecheck`.
6. Run focused Convex tests covering vault deletion and file-staging cleanup.
7. After deploy, verify production logs no longer show the unindexed
   `Too many bytes read` failure for vault deletion.

## Sources

- Convex limits: https://docs.convex.dev/production/state/limits
- Convex indexes: https://docs.convex.dev/database/reading-data/indexes/
- Convex scheduled functions:
  https://docs.convex.dev/scheduling/scheduled-functions
- Convex Workflow component: https://github.com/get-convex/workflow
