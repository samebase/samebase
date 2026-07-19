# Vault Deletion Workflow Research

## Document Control

- Status: Draft research
- Owner: Noter vault deletion, durable workflows, and vault-scoped cleanup
- Created: 2026-05-09
- Related specs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
- Related research:
  - `research/2026-05-06-vault-first-provisioning-model.md`
  - `research/2026-05-08-existing-repository-workflow-onboarding.md`
- Related operational context:
  - [PR #724: Research vault deletion workflow failure](https://github.com/noter-md/noter/pull/724)

## Prompt

Specs 096 and 097 moved the two source-onboarding user actions toward durable Workflow-backed state:

1. creating a new Noter-managed repository
2. connecting an existing GitHub repository

The next candidate is vault deletion. The question is where the current delete action should become
durable Workflow orchestration, what local/external cleanup surfaces it owns, and what should stay
outside the workflow.

## Current Finding

Vault deletion should be the next durable workflow candidate. The current implementation is still
shaped like a synchronous action: the dashboard blocks on one `vaultActions.deleteVault` call, that
action performs optional external teardown, then it calls one large `vault.removeVault` mutation for
local cleanup.

One major failure mode is a branch-heavy vault. A repository with many branches, like Noter itself,
can accumulate enough vault-scoped blobs, staging rows, collaborative updates, branch trees, and
remote-branch metadata that current delete has to load far too much into one Convex execution
context. That is not just a missing-index bug; even indexed reads are unsafe if the mutation still
collects and deletes the entire vault in one transaction.

PR #724 captured the production version of this failure class: a read-only Convex query hit
`Too many bytes read in a single function execution` with the 16 MiB read limit while investigating
deletion after manually cleaning staged changes and remote branches. That incident supports treating
branch-heavy deletion as an execution-budget problem, not just as a missing index.

That ordering is the opposite of the vault-first direction from specs 096 and 097. Creation and
existing-repo connection now create a durable vault/run before provider work so the dashboard can
show progress and failure. Deletion should use the same product rule: accept the destructive request
durably first, then let backend-owned steps remove external resources and local data while the UI
subscribes to progress.

The target should not overload the vault's GitHub `state`. Spec 096 uses top-level `state` for
source-workspace connection. Deletion is user intent over the whole vault, so it should be modeled
as a separate deletion run or deletion overlay, not as another GitHub connection state.

## Current Runtime

The dashboard delete surface lives in
`apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`.

The user opens the delete dialog through the `?delete=<owner>/<repo>` route search parameter. The
dialog can request these cleanup options:

1. remove connected Codespaces
2. remove the GitHub repository, only for confirmed Noter-managed repositories
3. remove the Convex project/deployment, only for Noter-managed infrastructure
4. remove the Cloudflare Pages project, only for Noter-managed infrastructure

On confirm, `handleRemoveVault` calls `api.vaultActions.deleteVault` and keeps the modal in a
pending state until the action returns.

`apps/noter/convex/vaultActions.ts` performs the provider work inline:

1. authenticate the user
2. read GitHub, Convex, and Cloudflare provider connections
3. read the vault and `vaultInfrastructure`
4. optionally delete Cloudflare Pages resources
5. optionally delete Convex project or deployment resources
6. optionally delete connected GitHub Codespaces
7. optionally delete the Noter-managed GitHub repository
8. call `api.vault.removeVault`

`apps/noter/convex/vault.ts` then performs local cleanup in one mutation:

1. delete one `vaultBranchFilters` row
2. collect and delete `blobs`, including storage objects
3. collect and delete `fileStaging`
4. delete the vault row
5. collect and delete `folderExpansionState`
6. delete `vaultDomains`
7. delete one `vaultInfrastructure` row
8. delete `codespaces` records
9. delete `vaultRemoteBranches`
10. delete `vaultBranchTrees`
11. try to delete the vault row again

There is no durable delete run, no workflow id, no deletion event log, no retry surface after an
external provider has already been touched, and no way for the dashboard to show backend progress
after the request is accepted.

## Why This Should Move To Workflow

The source onboarding flows now treat a user action as a queueing boundary: the product action
returns after the durable run exists, not after every external step has finished. Deletion has the
same shape but with higher destructive risk.

Current deletion can partially succeed in the worst order. Cloudflare, Convex, Codespaces, or GitHub
can be removed successfully, and then the local Convex cleanup mutation can fail. That leaves the
vault visible with missing backing resources.

The local cleanup mutation is also unbounded. Even with good indexes, one vault can accumulate
enough staging rows, blobs, collaborative updates, branch caches, events, or agent state to exceed a
single mutation's read/write/time limits. A durable workflow should own orchestration, while bounded
internal mutations delete local rows in table-sized batches.

The Workflow should own durable phase orchestration, not thousands of individual row or batch steps.
Large table cleanup should stay in bounded mutations whose progress can be retried safely without
turning the Workflow journal into the next limit surface.

The branch-heavy case is the practical forcing function. Vault deletion should not depend on
Noter-managed repos staying small or having only a handful of branches. A vault with roughly 100
branches and many blob-backed edits/uploads must make steady progress through batched cleanup
instead of trying to read all matching documents before the first delete can commit.

## Workflow Candidate Steps

The queueing action should stay small:

1. authenticate and authorize the user
2. load the vault and derive a deletion snapshot
3. validate the selected teardown options against the current vault state
4. insert a durable deletion run with the external resource identifiers needed for retry
5. mark the vault as deletion requested or otherwise make an active deletion run visible to
   repo-backed actions
6. start the deletion Workflow
7. return `{ deletionRunId }`

The Workflow should own the destructive work:

1. `initialize_deletion`: record the accepted request and snapshot
2. `lock_vault`: make repo-backed mutations, staging, refresh, Codespaces, and provider provisioning
   fail closed while deletion is active
3. `delete_codespaces`: delete connected Codespaces when requested; treat provider not-found as
   success
4. `delete_cloudflare`: delete the recorded Cloudflare Pages project when requested; treat provider
   not-found as success
5. `delete_convex`: delete the recorded Convex project or deployment when requested; treat provider
   not-found as success
6. `delete_github_repo`: delete the recorded GitHub repository only when the vault has confirmed
   Noter-managed repository identity
7. `cleanup_product_data`: remove user-editable vault data in batches
8. `cleanup_source_caches`: remove branch, tree, domain, and infra metadata in batches
9. `cleanup_agent_context`: remove or detach vault-scoped chat/agent context according to the
   retention decision
10. `cleanup_history`: remove, detach, or preserve provisioning and audit history according to the
    retention decision
11. `delete_vault`: delete the vault row once, last
12. `finish`: mark the deletion run succeeded

The Workflow completion handler should mark the deletion run failed with a user-safe message when a
step exhausts retry. The dashboard can then show a failed deletion state on the vault card and offer
a retry of the same deletion run or a new deletion attempt.

## Places To Gate While Deleting

An active deletion run must make these paths fail closed or hide their controls:

1. file staging reads/writes and commits
2. collaborative edits
3. branch refresh and remote-branch sync
4. Codespace create/start/stop/delete controls
5. infrastructure provisioning and retry
6. create/connect source setup completion writes for the same vault
7. AI production access proposals scoped to the vault
8. chat/tool actions that require a live repository workspace

This is the deletion equivalent of specs 096 and 097 requiring repo-backed behavior to wait for
connected GitHub state. A vault being deleted should not accept new repo-backed work even if its
GitHub state is still `connected`.

## Local Cleanup Surface

The cleanup registry should be explicit and fail closed. Each entry should name the table,
vault-scoped index or lookup path, batch size, and retention class.

Tables already cleaned up today:

1. `vaultBranchFilters`
2. `blobs`
3. `fileStaging`
4. `folderExpansionState`
5. `vaultDomains`
6. `vaultInfrastructure`
7. `codespaces`
8. `vaultRemoteBranches`
9. `vaultBranchTrees`
10. `vaults`

Tables that should be added or explicitly decided:

1. `collaborativeUpdates`
2. `vaultInfrastructureOwnership`
3. `appProvisioningRuns`
4. `appProvisioningEvents`
5. `agentGraphNodeLayout`
6. `chatThreadContexts`
7. `aiProdAccessRequests`
8. `aiProdAccessAudit`

`aiProdAccessAudit` is special. It is an audit boundary and does not store `vaultId` directly. If
audit retention wins, vault deletion should preserve audit rows and either preserve or detach the
related request rows deliberately. If product privacy requirements say vault deletion must remove
these rows, the workflow must derive audit rows through `aiProdAccessRequests.requestId` and delete
them as an explicit audited retention choice.

`chatThreadContexts` is also a product choice. Removing the context hides the thread from
vault-scoped lookup, but the Agent component thread itself may still exist outside the app schema.
The deletion spec should decide whether vault deletion deletes agent threads, detaches them from the
vault, or leaves them as account-level chat history.

## Current Cleanup Issues To Fix During The Move

`removeVault` deletes the vault row in the middle of cleanup and again at the end. The workflow
version should delete it once, last.

Several current cleanup reads are not using the available vault indexes:

1. `fileStaging` can use `by_vault`
2. `folderExpansionState` can use `by_user_and_vault`
3. `blobs` needs a `by_vault` index before large vault cleanup can be safe

The current mutation does not delete `collaborativeUpdates`, despite the comments around staged-file
collaborative state. `vault.ts` already has `deleteVaultBranchArtifacts`, which uses batched
collaborative-update cleanup for branch deletion. Vault deletion should reuse that shape at vault
scope instead of inventing a one-shot scan.

`apps/noter/convex/fileStaging.ts` has a sibling blob read in `deletePendingUploadBlob`: it already
scopes `fileStaging` by `by_vault`, then scans `blobs` with `.filter()` on `vaultId`. The same
`blobs.by_vault` index needed for vault cleanup should also remove that pending-upload scan.

Branch-heavy vaults should drive the cleanup design. `vaultRemoteBranches`, `vaultBranchTrees`,
`fileStaging`, `collaborativeUpdates`, and `blobs` need bounded cleanup phases whose progress can
survive retries. Loading all branch or blob rows before writing is the exact shape the workflow is
meant to replace.

`vaultInfrastructure` is read as one row, but the schema only indexes by `vaultId`; the cleanup
contract should either enforce one row per vault or delete all rows in bounded batches.

## External Cleanup Boundaries

The deletion run should snapshot provider identifiers before any external delete starts. It should
not depend on local metadata that a later cleanup step might remove before a retry.

Codespaces:

1. delete only records for this vault and user
2. update local state to deleting/deleted while the vault still exists
3. treat GitHub not-found as success
4. clear `activeCodespaceId` before the final vault delete

Cloudflare:

1. delete only the recorded Pages project for Noter-managed infrastructure
2. require a Cloudflare connection when the user requested Cloudflare teardown
3. treat not-found as success
4. do not delete account-level or unrelated Cloudflare resources

Convex:

1. delete only the recorded project or deployment for Noter-managed infrastructure
2. require a Convex connection when the user requested Convex teardown
3. treat not-found as success
4. preserve deploy-key and deployment identifiers in the deletion run snapshot until the step
   succeeds or the run is abandoned

GitHub:

1. delete repositories only for `githubMode: "create_repository"` vaults with confirmed connected
   GitHub identity
2. treat not-found as success
3. keep existing-repository vault deletion local by default
4. do not infer a repository to delete from a failed create state unless a future
   retained-created-repo state records immutable GitHub identity

That last boundary comes straight from spec 096's compatibility exit: failed create attempts might
have created a GitHub repository before connected identity was written. Until the model records that
retained repository identity, the delete UI should keep the current limitation and avoid pretending
it can clean up that unknown external repo.

## Data Model Direction

Prefer a dedicated deletion run model over stretching `appProvisioningRuns`. Deletion is not
provisioning, and its step taxonomy, retention policy, and success criteria are different.

A focused shape would be:

```ts
type VaultDeletionRun = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  workflowId?: string;
  state: "queued" | "running" | "succeeded" | "failed";
  currentStep: VaultDeletionStep;
  options: {
    removeCodespaces: boolean;
    removeGithubRepo: boolean;
    removeConvexProvision: boolean;
    removeCloudflareProvision: boolean;
  };
  snapshot: VaultDeletionSnapshot;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};
```

The snapshot should include only external identifiers needed for idempotent retry and audit-safe
display. It must not store provider tokens, secrets, deploy keys, request headers, or raw provider
payloads.

The vault row needs a deletion gate. The cleanest version is a separate deletion overlay, such as an
active `vaultDeletionRuns` row indexed by `vaultId` and `state`, plus helpers that repo-backed
mutations call before writing. If read cost or correctness pushes the gate onto the vault row, keep
it as a separate deletion field, not as another source-workspace `state` variant.

## UI Direction

The delete dialog should remain the one user action. The change is what the backend returns.

After the request is accepted:

1. close the dialog
2. keep the vault card visible in a quiet deleting state, or hide it only after the vault row is
   actually removed
3. disable repo-backed controls while deletion is active
4. show a small failure state if the deletion run fails
5. let retry reuse the stored deletion options and snapshot when safe

The staged-change commit button can stay outside the deletion Workflow. It is a separate user choice
before deletion starts. Once deletion is queued, new commit or staging work should be blocked.

The existing `?delete=<owner>/<repo>` route-owned modal can remain. It should target a vault that is
not already deleting; if a direct delete URL targets a deleting vault, the dashboard should show the
deleting state instead of opening a second destructive dialog.

## Recommended Implementation Slices

### Slice 1: Spec

Promote this research into a deletion workflow spec before implementation.

The spec should decide:

1. deletion run table versus broad operation-run table
2. vault deletion gate shape
3. exact deletion step taxonomy and event copy
4. audit/chat retention behavior
5. retry semantics after partial external cleanup
6. whether deletion hides the card immediately or shows an in-progress state

### Slice 2: Local Cleanup Registry And Batches

Build the local cleanup registry before moving provider deletes.

1. add missing vault-scoped indexes such as `blobs.by_vault`
2. replace unbounded `.collect()` cleanup with bounded indexed batches
3. include all vault-scoped tables or explicitly document preserved tables
4. delete the vault row once, last
5. cover cleanup batches with Convex tests

This slice can be a tactical safety improvement even before the full workflow ships.

### Slice 3: Workflow-Orchestrated Deletion

Add the deletion run model and Workflow.

1. queue deletion from the dashboard action
2. snapshot external resource identifiers
3. run provider teardown steps idempotently
4. run local cleanup batches
5. surface run status in the dashboard
6. add tests for success, provider not-found, provider failure, local cleanup failure, and retry

### Slice 4: Gate Sibling Writers

Audit and gate sibling functions that can mutate a vault while deletion is active.

Start with staging, collaborative updates, tree refresh, Codespaces, infra retry, source setup
completion writes, and vault-scoped AI prod access. This can land with Slice 3 if the gate helper
stays small; otherwise split it so the deletion workflow does not become hard to review.

## Testing Plan

Backend:

1. queueing deletion creates a durable run before any provider delete
2. selected teardown options are validated and stored
3. provider not-found responses are treated as successful cleanup
4. provider failure leaves the vault visible with a failed deletion run
5. local cleanup deletes every registry-owned table in bounded batches
6. preserved audit/chat rows follow the spec's explicit retention decision
7. the vault row is deleted only after dependent cleanup succeeds
8. repo-backed mutations fail closed while deletion is active
9. create/connect/provisioning workflows cannot revive or mutate a deleting vault

Frontend:

1. the delete dialog closes after the request is accepted
2. deleting vaults do not expose repo-backed controls
3. failed deletion shows the backend failure message
4. direct `?delete=` links do not open a second delete dialog for a deleting vault
5. successful deletion removes the vault card after the vault row is gone

## Recommendation

Do not keep extending `vaultActions.deleteVault` as a single blocking action. Treat deletion as the
third source/workspace lifecycle action to move onto durable backend orchestration.

Start with a spec, because deletion crosses product data, provider teardown, audit retention, chat
retention, and in-flight workflow behavior. Then land a bounded cleanup registry and the deletion
Workflow in reviewable slices. The current delete dialog can stay simple: the user still confirms
once, but the backend owns the long-running destructive work.
