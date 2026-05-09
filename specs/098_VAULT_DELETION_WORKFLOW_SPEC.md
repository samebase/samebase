# Vault Deletion Workflow Spec

## Document Control

- Status: Accepted next-phase implementation plan
- Owner: Noter vault deletion, durable workflows, and vault-scoped cleanup
- Created: 2026-05-09
- Related docs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `research/2026-05-09-vault-deletion-workflow-research.md`
  - [PR #724: Research vault deletion workflow failure](https://github.com/noter-md/noter/pull/724)

## Summary

Vault deletion remains one destructive user action, but the backend must treat
it as durable orchestration instead of one synchronous action. The user confirms
delete once, the app records a deletion run and deletion gate, and Workflow owns
provider teardown plus local cleanup.

The practical forcing function is branch-heavy vaults. Repositories like Noter
can have close to 100 branches, and each branch can fan out into branch trees,
remote-branch metadata, staged files, collaborative updates, blobs, storage
objects, domains, and infrastructure state. Deletion must make bounded progress
through those rows. No cleanup mutation may depend on loading every vault row
into one Convex execution context.

Deletion is lifecycle intent over the whole vault. It must not be modeled as a
new top-level GitHub `state` variant from spec 096. GitHub `state` continues to
mean source-workspace connection. Deletion uses a separate vault deletion gate
plus dedicated deletion run and event tables.

## Current Problem

`vaultActions.deleteVault` currently performs provider teardown inline, then
calls `vault.removeVault` for local cleanup. The local mutation scans and
deletes many vault-scoped tables in one transaction, deletes the vault row in
the middle of cleanup, and tries to delete the vault row again at the end.

That shape has two unacceptable failure modes:

1. External resources can be removed first, then local Convex cleanup can fail.
   The dashboard still shows a vault whose backing GitHub, Convex, Cloudflare,
   or Codespaces resources may already be gone.
2. Branch-heavy vaults can exceed Convex transaction budgets before cleanup
   commits. Indexing helps only if each mutation also reads and writes a bounded
   number of rows.

The current delete path has no durable run, no event log, no retry surface after
partial provider cleanup, and no central gate that prevents sibling writers from
continuing to mutate a vault after deletion has started.

PR #724 captured the production failure class behind this spec: a read-only
Convex investigation query hit
`Too many bytes read in a single function execution` with the 16 MiB read limit
after staged changes and remote branches were manually cleaned. That evidence
means the accepted fix must address execution budgets for branch-heavy vaults,
not only the immediate unindexed reads.

## Goals

1. Preserve a single user confirmation for vault deletion.
2. Create a durable deletion run before external provider deletes begin.
3. Allow deletion only when the vault is quiescent: source setup and provider
   provisioning are completed, failed, or not configured.
4. Mark the vault as deleting before any destructive work starts.
5. Keep repo-backed behavior blocked while deletion is active or failed.
6. Snapshot only the provider identifiers needed for idempotent retry.
7. Delete provider resources idempotently and treat provider not-found as
   success.
8. Replace unbounded local cleanup with an explicit bounded cleanup registry.
9. Delete the vault row once, last.
10. Preserve audit boundaries deliberately instead of deleting or retaining rows
    by accident.
11. Show deleting and failed-deletion states from durable backend state.
12. Support retry after partial external cleanup by reusing the stored snapshot.

## Non-Goals

1. Build a generic operation-run framework.
2. Add user cancellation after deletion is accepted.
3. Keep a deleting vault usable as a repository workspace.
4. Delete GitHub repositories for existing-repository vaults.
5. Infer or delete an unknown GitHub repository from a failed create attempt.
6. Design new account-level chat retention behavior for the unused legacy chat
   system.
7. Redesign unrelated app provisioning, branch refresh, editor, or Codespaces
   behavior beyond the deletion gate they must honor.
8. Accept deletion while source setup, Convex provisioning, Cloudflare
   provisioning, or another vault lifecycle run is active.

## Accepted Decisions

### One User Action

The product action stays simple: the user opens the delete dialog, chooses the
available teardown options, and confirms once. The client no longer waits for
all provider and local cleanup work to finish. It waits only until the deletion
request is durably accepted.

After acceptance:

1. close the dialog
2. keep the vault card visible in a deleting state until the vault row is gone
3. disable repo-backed controls on that card
4. show a failed-deletion state if the run fails
5. offer retry from the failed state

Do not hide the vault card immediately after queueing. A visible deleting or
failed-deletion state is the user's only reliable progress surface while the
vault row still exists.

### Quiescent Vault Requirement

Deletion is available only for quiescent vaults. This intentionally makes
half-provisioned cleanup cases unrepresentable instead of asking the deletion
Workflow to coordinate with active source and provider workflows.

A vault is quiescent for deletion when:

1. the vault has no active deletion gate
2. source setup is not running: the vault is connected or failed, but not
   provisioning
3. no `appProvisioningRuns` row for the vault is `queued` or `running`
4. connected Convex state is `not_configured`, `connected`, or `failed`, but not
   `provisioning`
5. connected Cloudflare state is `not_configured`, `connected`, or `failed`, but
   not `provisioning`
6. no vault infrastructure ownership row is active for an in-flight provider
   workflow

The dashboard should disable delete with a short reason while a vault is not
quiescent. A direct `?delete=` URL for a non-quiescent vault should show the
current setup state and the same reason instead of opening the destructive
dialog.

The queueing action must also enforce this rule. If a vault becomes
non-quiescent between render and click, the action rejects without inserting a
deletion run, without setting the deletion gate, and without touching providers.
The user can delete after the active setup run succeeds or fails.

### Dedicated Deletion Runs

Add dedicated `vaultDeletionRuns` and `vaultDeletionEvents` tables. Do not
stretch `appProvisioningRuns` for deletion.

Provisioning runs describe source and provider setup. Deletion has different
steps, retry rules, retention rules, and success criteria. Keeping it separate
also lets the workflow delete old `appProvisioningRuns` and
`appProvisioningEvents` as vault-scoped setup history without deleting the
deletion run that is still finishing the vault removal.

### Separate Vault Deletion Gate

Add a separate deletion gate on the vault row. The target app model is an
explicit union, not a set of optional flags:

```ts
type VaultDeletionState =
  | {
      state: "not_deleting";
    }
  | {
      state: "deleting";
      runId: Id<"vaultDeletionRuns">;
      requestedAt: number;
    }
  | {
      state: "delete_failed";
      runId: Id<"vaultDeletionRuns">;
      failedAt: number;
    };
```

The persisted rollout may temporarily represent `"not_deleting"` as an absent
field because existing vault rows will not have the new field. That
compatibility detail must stay behind a helper that returns
`VaultDeletionState`; product code should not spread optional deletion checks
across the app.

This gate is not a GitHub source-workspace state. A vault can still be
`state: "connected"` while `deletion.state === "deleting"`, but repo-backed
reads and writes must treat the deletion gate as stronger than connected GitHub
state.

Failed deletion keeps repo-backed behavior blocked. A failed run may have
already removed provider resources, so the product must not silently resume the
workspace. Retry is the supported path.

### Provider Deletes Before Local Cleanup

The workflow deletes external resources before local metadata cleanup. The
deletion run snapshot keeps provider identifiers available for retry until the
provider steps have succeeded or the run is abandoned.

Local cleanup must not delete the rows needed to retry provider teardown before
those provider steps finish.

### Bounded Local Cleanup

Local cleanup is a registry of table-specific batch mutations. Each registry
entry names:

1. table
2. index or lookup path
3. retention behavior
4. row deletion or patch behavior
5. storage cleanup behavior when relevant
6. batch-size constant

No registry entry may use an unbounded `.collect()` for data that can grow with
branches, files, edits, blobs, agent work, or provisioning history. Tests should
force multiple batches with a small batch size so one-pass cleanup does not mask
an unsafe implementation.

Workflow owns durable phase orchestration; batch mutations own row cleanup. Do
not model each deleted row or each cleanup batch as a separate Workflow step.
For very large vaults, a Workflow step should call bounded cleanup mutations
until the current phase is complete, with idempotent progress checks on each
retry. The Workflow journal must not become the next unbounded cleanup surface.

### Retention Decisions

Delete vault-scoped product and cache data. Preserve account-level audit
history.

Accepted retention rules:

1. `appProvisioningRuns` and `appProvisioningEvents` are vault-scoped setup
   history and should be deleted in batches.
2. `vaultDeletionRuns` and `vaultDeletionEvents` are deletion operation history
   and should outlive the vault row. They must not store credentials, provider
   tokens, deploy keys, request headers, or raw provider payloads.
3. After a deletion succeeds, the deletion run may retain display-safe summary
   fields such as `repositoryFullName`, options, final state, step events, and
   timestamps. Provider identifiers needed only for retry should be scrubbed
   from the completed snapshot.
4. `aiProdAccessAudit` rows are preserved. Matching `aiProdAccessRequests` are
   preserved as audit context, detached from the vault by clearing `vaultId`,
   and any still-active request for the deleted vault is expired.
5. Legacy chat and agent context are not product-critical for this workflow. If
   those tables still exist when deletion ships, use the simplest safe cleanup:
   delete or detach vault-scoped app rows, but do not add new account-level chat
   retention machinery.

If a future privacy requirement says vault deletion must erase prod-access audit
history, that must be a new spec because it changes compliance and product
retention behavior.

## Data Model

### Model Quality Bar

The deletion schema is part of the product contract. Small changes here affect
backend state transitions, frontend affordances, retry behavior, and user trust,
so implementation should treat the data model as the highest-leverage code in
this project.

The persisted model should use the smallest set of required discriminated
variants that makes invalid business states unrepresentable. Optional fields are
allowed only for:

1. migration windows over existing rows
2. external provider data that is genuinely absent in one explicit variant
3. a short start gap before the Workflow component returns `workflowId`
4. post-success scrubbing of retry-only provider identifiers

Do not preserve an optional field from this spec if implementation finds a
cleaner union that encodes the same business rule. Conversely, do not add
compatibility mirrors, raw UI state, provider payloads, or future-proof variants
unless a current caller or persisted-data constraint requires them. If
implementation changes the durable shape, update this spec and the tests in the
same PR so the accepted contract stays current.

The TypeScript snippets below may use intersections to keep the document
readable. Convex schema validators should still define complete persisted
variants when that makes validation clearer or prevents accidental optional
fields.

### Deletion Request Options

The delete dialog may still send checkbox-shaped request options. Those raw
options are not the durable model. The queueing action must validate them
against the current vault and provider state, then persist a validated deletion
plan.

```ts
type VaultDeletionRequestOptions = {
  removeCodespaces: boolean;
  removeGithubRepo: boolean;
  removeConvexProvision: boolean;
  removeCloudflareProvision: boolean;
};
```

### Deletion Plan

The deletion plan records the source-workspace state being deleted plus the
accepted destructive provider work. The first implementation should model only
states the current product can create. Do not add a `not_connected` deletion
target until a shipped flow creates user-visible not-connected vaults.

The deletion plan can be built only from a quiescent vault. Running source or
provider setup states are not deletion targets and should not appear as plan
variants.

```ts
type VaultDeletionPlan = ProviderCleanupPlan &
  (
    | {
        target: {
          kind: "noter_managed_repository";
          ghRepoId: string;
          owner: string;
          name: string;
          repositoryFullName: string;
        };
        githubRepository:
          | {
              action: "skip";
              reason: "not_requested";
            }
          | {
              action: "delete_repository";
              ghRepoId: string;
              owner: string;
              name: string;
            };
      }
    | {
        target: {
          kind: "existing_repository";
          ghRepoId: string;
          owner: string;
          name: string;
          repositoryFullName: string;
        };
        githubRepository: {
          action: "skip";
          reason: "not_requested" | "not_noter_managed";
        };
      }
    | {
        target: {
          kind: "failed_repository_setup";
          githubMode: "create_repository" | "connect_existing_repository";
          owner: string;
          name: string;
          repositoryFullName: string;
        };
        githubRepository: {
          action: "skip";
          reason: "not_requested" | "no_confirmed_identity";
        };
      }
  );
```

This shape deliberately binds the target kind to allowed GitHub repository
teardown. "Delete an existing repository's GitHub repo" and "delete an unknown
failed-create repo" do not fit in the persisted plan.

```ts
type ProviderCleanupPlan = {
  codespaces:
    | {
        action: "skip";
        reason: "not_requested";
      }
    | {
        action: "delete_connected_codespaces";
      };
  convex:
    | {
        action: "skip";
        reason: "not_requested" | "not_noter_managed" | "not_recorded";
      }
    | {
        action: "delete_project";
        projectId: string;
      }
    | {
        action: "delete_deployment";
        deploymentName: string;
      };
  cloudflare:
    | {
        action: "skip";
        reason: "not_requested" | "not_noter_managed" | "not_recorded";
      }
    | {
        action: "delete_pages_project";
        accountId: string;
        projectName: string;
      };
};
```

The retry snapshot stores only the deletion plan and identifiers needed for
provider teardown, retry, and safe display. It must not store credentials or raw
provider responses.

Conceptual shape:

```ts
type VaultDeletionSnapshot = {
  state: "retained_for_retry";
  plan: VaultDeletionPlan;
};
```

`removeGithubRepo` is valid only for connected `githubMode: "create_repository"`
vaults with immutable GitHub identity. Existing-repository vault deletion is
local by default and must not delete the user's GitHub repository.

Failed create attempts may have created a GitHub repository before connected
identity was written. Until the vault model records retained external repository
identity for that case, deletion must not infer a repository to delete from
requested `owner/name`.

### Deletion Runs

Conceptual shape:

```ts
type VaultDeletionRunBase = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  attempt:
    | {
        kind: "initial";
      }
    | {
        kind: "retry";
        retryOf: Id<"vaultDeletionRuns">;
      };
  createdAt: number;
  updatedAt: number;
};

type VaultDeletionWorkflowRef =
  | {
      state: "not_started";
    }
  | {
      state: "started";
      workflowId: string;
    };

type VaultDeletionRun = VaultDeletionRunBase &
  (
    | {
        state: "queued";
        workflow: {
          state: "not_started";
        };
        currentStep: "initialize_deletion";
        snapshot: VaultDeletionSnapshot;
      }
    | {
        state: "running";
        workflow: {
          state: "started";
          workflowId: string;
        };
        currentStep: VaultDeletionStep;
        snapshot: VaultDeletionSnapshot;
      }
    | {
        state: "failed";
        workflow: VaultDeletionWorkflowRef;
        currentStep: VaultDeletionStep;
        snapshot: VaultDeletionSnapshot;
        error: {
          message: string;
          failedAt: number;
        };
        completedAt: number;
      }
    | {
        state: "succeeded";
        workflow: {
          state: "started";
          workflowId: string;
        };
        currentStep: "finish";
        snapshot: {
          state: "scrubbed_after_success";
        };
        completedAt: number;
      }
  );
```

Required indexes:

1. `vaultDeletionRuns.by_vault_and_updated_at`
2. `vaultDeletionRuns.by_user_and_updated_at`
3. `vaultDeletionRuns.by_workflow_id`, using the final workflow field path
4. `vaultDeletionRuns.by_retry_of`, using the final retry field path

The active gate lives on the vault row, so hot repo-backed paths should not need
to query `vaultDeletionRuns` after they have already loaded the vault.

### Deletion Events

Deletion events follow the provisioning-event pattern with deletion-specific
steps.

Conceptual shape:

```ts
type VaultDeletionEvent = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  runId: Id<"vaultDeletionRuns">;
  step: VaultDeletionStep;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: number;
};
```

Required indexes:

1. `vaultDeletionEvents.by_vault_and_created_at`
2. `vaultDeletionEvents.by_run_and_created_at`

## Step Taxonomy

Add a deletion-specific step union:

```ts
type VaultDeletionStep =
  | "initialize_deletion"
  | "lock_vault"
  | "delete_codespaces"
  | "delete_cloudflare"
  | "delete_convex"
  | "delete_github_repo"
  | "cleanup_editor_state"
  | "cleanup_source_caches"
  | "cleanup_runtime_state"
  | "cleanup_access_state"
  | "detach_agent_context"
  | "cleanup_provisioning_history"
  | "delete_vault"
  | "finish";
```

Recommended event copy:

1. `initialize_deletion`: "Queued vault deletion."
2. `lock_vault`: "Blocked new vault work."
3. `delete_codespaces`: "Removing connected Codespaces."
4. `delete_cloudflare`: "Removing Cloudflare resources."
5. `delete_convex`: "Removing Convex resources."
6. `delete_github_repo`: "Removing GitHub repository."
7. `cleanup_editor_state`: "Cleaning staged edits and blobs."
8. `cleanup_source_caches`: "Cleaning branch and source caches."
9. `cleanup_runtime_state`: "Cleaning vault runtime state."
10. `cleanup_access_state`: "Detaching production access history."
11. `detach_agent_context`: "Detaching vault chat context."
12. `cleanup_provisioning_history`: "Cleaning setup history."
13. `delete_vault`: "Removing vault."
14. `finish`: "Deleted vault."

## Target Flow

### Queueing Action

`vaultActions.deleteVault` becomes a queueing action.

It should:

1. authenticate the user
2. load and authorize the vault
3. reject a vault that already has an active `deletion` gate
4. reject any vault that is not quiescent for deletion
5. validate selected teardown options against current local state
6. require local provider connection rows for selected provider teardown options
   when those rows are already known to be necessary
7. build the validated deletion plan and retry snapshot
8. insert `vaultDeletionRuns` and the first event
9. patch the vault deletion gate to `deleting`
10. start the deletion Workflow
11. return `{ deletionRunId }`

External provider API validation happens inside Workflow after the durable run
exists. Local validation, including quiescence, fails before queueing. For
example, requesting GitHub repository deletion for an existing-repository vault
or deleting a vault whose Cloudflare provider state is still provisioning should
fail before the run is inserted.

If Workflow startup fails after the run and gate are inserted, the action must
mark the run failed, patch the vault gate to `delete_failed`, append an error
event, and return an error.

### Workflow

The deletion Workflow runs:

1. `lock_vault`: claim the run and confirm the vault deletion gate points to
   this run
2. `delete_codespaces`: delete connected Codespaces when requested
3. `delete_cloudflare`: delete the recorded Cloudflare Pages project when
   requested
4. `delete_convex`: delete the recorded Convex project or deployment when
   requested
5. `delete_github_repo`: delete the recorded Noter-managed GitHub repository
   when requested
6. `cleanup_editor_state`: delete `fileStaging`, `collaborativeUpdates`,
   `blobs`, and backing storage in bounded batches
7. `cleanup_source_caches`: delete branch filters, folder expansion state,
   `vaultRemoteBranches`, and `vaultBranchTrees` in bounded batches
8. `cleanup_runtime_state`: delete vault domains, infrastructure, infrastructure
   ownership, Codespaces records, and graph layout in bounded batches
9. `cleanup_access_state`: expire and detach vault-scoped prod-access requests
   while preserving audit rows
10. `detach_agent_context`: detach agent thread context from the vault
11. `cleanup_provisioning_history`: delete setup runs and setup events in
    bounded batches
12. `delete_vault`: delete the vault row once
13. `finish`: mark the deletion run succeeded and scrub retry-only snapshot
    identifiers

Each cleanup step may internally loop over multiple batch mutations. A failed or
retried workflow may restart a cleanup step from the beginning because deleting
an already deleted row, detaching an already detached row, and seeing a provider
not-found response are all successful idempotent outcomes.

### Completion Handling

Workflow completion uses the deletion run id as context.

On success:

1. mark the run `succeeded`
2. set `completedAt`
3. scrub provider identifiers that are needed only for retry
4. keep deletion events as display-safe operation history

On failure:

1. mark the run `failed`
2. store a user-safe `lastError`
3. append an error event for the current step
4. patch the vault deletion gate to `delete_failed` if the vault still exists

If the vault row is already gone when a late failure handler runs, the handler
must update the deletion run only. It must not recreate the vault or any
vault-scoped rows.

## Provider Teardown Rules

### Codespaces

1. Delete only Codespaces recorded for the vault and user.
2. Mark local Codespaces `deleting` before provider deletion.
3. Treat GitHub not-found as success.
4. Mark local Codespaces `deleted` and clear `activeCodespaceId` after provider
   success.
5. Delete Codespaces table rows later in `cleanup_runtime_state`.

### Cloudflare

1. Delete only a `delete_pages_project` plan's Cloudflare Pages project.
2. Require a Cloudflare connection when Cloudflare teardown is requested.
3. Treat provider not-found as success.
4. Do not delete account-level or unrelated Cloudflare resources.

### Convex

1. Delete only a `delete_project` or `delete_deployment` plan's Convex resource.
2. The queueing action chooses `delete_project` when project identity is
   recorded; otherwise it chooses `delete_deployment` only when deployment
   identity is recorded.
3. Require a Convex connection when Convex teardown is requested.
4. Treat provider not-found as success.
5. Do not store Convex deploy-key credentials or identifiers in the deletion
   plan unless implementation proves a current provider call needs them.

### GitHub Repository

1. Delete the repository only from a `noter_managed_repository` plan whose
   `githubRepository.action` is `delete_repository`.
2. Treat provider not-found as success.
3. Do not delete repositories for `connect_existing_repository` vaults.
4. Do not delete repositories for failed create attempts without confirmed
   immutable GitHub identity.

## Local Cleanup Registry

The initial registry should cover these tables.

All cleanup entries must achieve vault-wide coverage. When the only available
index is user-scoped, such as `by_user_and_vault` or `by_userId_and_vaultId`,
the cleanup implementation must either iterate every user row associated with
that vault or add a vault-prefixed index before using the entry. Vault deletion
must never clean only the requesting user's rows.

Delete rows:

1. `vaultBranchFilters` via `by_user_and_vault`, vault-wide across all users
2. `fileStaging` via `by_vault`
3. `collaborativeUpdates` via `by_vault`
4. `blobs` via a new `by_vault` index, deleting storage objects before rows
5. `folderExpansionState` via `by_user_and_vault`, vault-wide across all users
6. `vaultRemoteBranches` via `by_vault`
7. `vaultBranchTrees` via `by_vault_and_branch` with the `vaultId` prefix
8. `vaultDomains` via `by_vault`
9. `vaultInfrastructure` via `by_vault`, deleting all rows if more than one
   exists
10. `vaultInfrastructureOwnership` via `by_vault`
11. `codespaces` via `by_vault`
12. `agentGraphNodeLayout` via `by_user_and_vault`, vault-wide across all users
13. `appProvisioningEvents` via `by_vault_and_created_at`
14. `appProvisioningRuns` via `by_vault_and_updated_at`

Patch or delete rows:

1. `aiProdAccessRequests` via `by_vault`: clear `vaultId`; move `proposed` and
   `approved` requests to `expired`; preserve executed, failed, rejected, and
   already expired statuses for every matching request.
2. `agentThreadContext` via `by_userId_and_vaultId`, vault-wide across all
   users: either clear `vaultId`, `repositoryFullName`, `branch`, and
   `filePath`, or delete the row if the legacy chat cleanup/removal path makes
   deletion simpler.

Preserve rows:

1. `aiProdAccessAudit`
2. `vaultDeletionRuns`
3. `vaultDeletionEvents`

The registry must be fail-closed. If a new vault-scoped table is added later,
the table owner must either add it to this cleanup registry or explicitly mark
it preserved with a retention reason.

The `blobs.by_vault` index is also required for sibling cleanup outside the
deletion Workflow. `fileStaging.deletePendingUploadBlob` must use the same
vault-scoped blob index when checking whether an uploaded storage object is
protected by staging.

## Deletion Gate Requirements

An active or failed deletion gate must block or hide:

1. file staging reads and writes
2. commits and media uploads
3. collaborative edits
4. branch refresh and remote-branch sync
5. Codespace create, start, stop, and delete controls
6. infrastructure provisioning and retry
7. source setup completion writes for the same vault
8. AI production access proposals scoped to the vault
9. chat/tool actions that require a live repository workspace

Backend functions that already load the vault should check the vault deletion
gate in the same helper that checks connected GitHub state. Backend functions
that currently mutate by `vaultId` without loading the vault must either load
the vault and check the gate or be moved behind a helper that does so.

Provisioning workflows from specs 096 and 097 must fail closed if they try to
write connected state, tree state, or provider state after deletion has started.
That is a race-safety fallback, not permission to start deletion while a known
provisioning run is active.

## Dashboard Behavior

The delete dialog remains route-owned by `?delete=<owner>/<repo>`.

When the target vault is not deleting:

1. show the same teardown options as today only if the vault is quiescent
2. show the current setup state and disable delete with a reason when the vault
   is not quiescent
3. disable the confirm button while the queueing action is pending
4. close the dialog when the deletion run is accepted

When the target vault is deleting or delete-failed:

1. do not open a second destructive dialog
2. show the card's deleting or failed-deletion state
3. keep repo-backed controls disabled

Deleting cards should show a quiet in-progress state derived from the current
deletion run and latest event. Failed-deletion cards should show the latest
user-safe error and a retry action.

Retry creates a new `vaultDeletionRuns` row with `retryOf` pointing at the
failed run, copies the failed run's retained deletion plan, patches the vault
gate back to `deleting`, and starts a new Workflow. Retry does not let the user
edit teardown options in the first implementation.

## Implementation Plan

### Phase 1: Bounded Cleanup Foundation

1. Add the missing cleanup index `blobs.by_vault`.
2. Build the explicit local cleanup registry and table-specific batch mutations.
3. Delete storage objects inside the blob cleanup batch before deleting blob
   rows.
4. Update `fileStaging.deletePendingUploadBlob` to use the same vault-scoped
   blob index instead of scanning `blobs`; if the implementation needs exact
   storage-reference checks, add vault-prefixed storage indexes instead of
   collecting all vault blobs or staged files.
5. Include `collaborativeUpdates`, `vaultInfrastructureOwnership`,
   `agentGraphNodeLayout`, `agentThreadContext`, `aiProdAccessRequests`,
   `appProvisioningRuns`, and `appProvisioningEvents`.
6. Delete the vault row once, last.
7. Add tests that force branch-heavy cleanup across multiple batches.

This phase may temporarily keep the existing action-level provider teardown, but
the local cleanup must already be bounded.

### Phase 2: Durable Deletion Workflow

1. Add `vaultDeletionRuns`, `vaultDeletionEvents`, validators, and helpers.
2. Add the vault deletion gate field.
3. Add the quiescent-vault deletion eligibility helper.
4. Replace `vaultActions.deleteVault` with a queueing action.
5. Add the deletion Workflow, completion handler, and provider teardown steps.
6. Move local cleanup orchestration into Workflow.
7. Add retry by creating a new run from a failed run's retained snapshot.
8. Add backend tests for provider success, provider not-found, provider failure,
   local cleanup failure, workflow startup failure, and retry after partial
   external cleanup.

### Phase 3: Dashboard And Writer Gates

1. Return deletion summaries from dashboard vault queries.
2. Render deleting and failed-deletion card states.
3. Update the delete dialog to close after queue acceptance.
4. Make direct `?delete=` links no-op into the status card for deleting vaults.
5. Disable delete with a reason while source or provider setup is running.
6. Gate staging, collaborative updates, branch refresh, Codespaces,
   infrastructure provisioning, source setup completion writes, AI prod access,
   and live-repository chat/tool actions.
7. Add route-level or production-component tests for deleting, failed-deletion,
   retry, and blocked controls.

Phases 2 and 3 may land together if the diff remains reviewable. They should
split if UI review starts hiding backend state-machine review.

## Testing Plan

Backend:

1. queueing deletion creates a run before any provider delete
2. selected teardown options are converted into a validated deletion plan
3. invalid deletion plans are unrepresentable in persisted deletion runs
4. non-quiescent vaults fail before queueing and do not create deletion runs
5. invalid teardown options fail before queueing
6. provider not-found responses count as successful cleanup
7. provider failures leave the vault visible with `delete_failed`
8. retry uses the failed run's retained deletion plan
9. branch-heavy cleanup completes through multiple bounded batches
10. `blobs` cleanup deletes storage objects and rows
11. pending-upload blob cleanup uses the vault-scoped blob index
12. `collaborativeUpdates` are deleted at vault scope
13. `aiProdAccessAudit` rows are preserved while requests are detached
14. legacy `agentThreadContext` rows are deleted or detached using the simplest
    safe path
15. `appProvisioningRuns` and `appProvisioningEvents` are deleted in batches
16. the vault row is deleted only after dependent cleanup succeeds
17. source setup and provider provisioning writes fail closed after deletion
    starts

Frontend:

1. the delete dialog closes after the deletion request is accepted
2. non-quiescent vaults show disabled delete controls with a reason
3. deleting vaults keep a visible card until the vault row is removed
4. deleting vaults do not expose repo-backed controls
5. failed deletion shows the latest safe backend error
6. retry starts a new deletion run without changing options
7. direct delete URLs do not open a second dialog for deleting or failed-delete
   vaults

## Acceptance Criteria

1. Vault deletion is one user action backed by durable Workflow state.
2. No external provider delete runs before a deletion run and vault gate exist.
3. The vault deletion gate is separate from GitHub source-workspace `state`.
4. Deletion is available only for quiescent vaults; active provisioning states
   cannot enter the deletion workflow.
5. The durable deletion run stores a validated discriminated deletion plan, not
   raw UI checkbox state.
6. Provider teardown is idempotent and provider not-found is success.
7. Branch-heavy vault cleanup is bounded by table-specific batches.
8. No cleanup mutation loads all blobs, branches, staged files, collaborative
   updates, or provisioning history for a vault in one transaction.
9. The vault row is deleted once, last.
10. Failed deletion leaves a retryable visible state.
11. Repo-backed writers fail closed while deletion is active or failed.
12. Prod-access audit retention and legacy chat cleanup follow the explicit
    rules in this spec.
