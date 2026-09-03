# Repository Removal Workflow Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase repository removal, durable workflows, and repository-scoped cleanup
- Created: 2026-05-09
- Last updated: 2026-09-03
- Related docs:
  - `specs/096_INITIALIZING_REPOSITORY_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/045_REPOSITORY_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
  - `research/2026-05-09-vault-deletion-workflow-research.md`
  - [PR #724: Research repository deletion workflow failure](https://github.com/samebase/samebase/pull/724)

## Summary

Removal from Samebase remains one destructive user action, but the backend must treat it as durable
orchestration instead of one synchronous action. The user confirms removal once, the app records a
deletion run and deletion gate, and Workflow owns provider teardown plus local cleanup.

The practical forcing function is branch-heavy repositories. Repositories like Samebase can have
close to 100 branches, and each branch can fan out into branch trees, staged files, collaborative
updates, blobs, storage objects, provider attachments, schema state, and provisioning state.
Deletion must make bounded progress through those rows. No cleanup mutation may depend on loading
every repository-scoped row into one Convex execution context.

Deletion is lifecycle intent over the whole repository. It must not be modeled as a new top-level
GitHub `state` variant from spec 096. GitHub `state` continues to mean source-workspace connection.
Deletion uses a separate repository deletion gate plus dedicated deletion run and event tables.

## Current Implementation

`repository.actions.deleteRepository` validates the request, creates a durable deletion run, and
starts `deleteRepositoryWorkflow`. The workflow removes the selected provider resources, deletes
repository-scoped data in bounded batches, and deletes the repository row last. A deletion gate on
the repository blocks new repository work while removal is active or has failed.

Each provider step reads the stored plan. It returns without an event when that provider action is
`skip`. It records an event only before a real provider delete. Provider not-found responses count
as success, so a retry can continue after partial external cleanup.

The dashboard reads the durable run and event log. It keeps the repository visible during removal,
shows a failed state when needed, and lets the user start a new retry run from the stored plan.

## Goals

1. Preserve a single user confirmation for removal from Samebase.
2. Create a durable deletion run before external provider deletes begin.
3. Allow deletion only when source setup and provider writes are not active.
4. Mark the repository as deleting before any destructive work starts.
5. Keep repository-backed behavior blocked while deletion is active or failed.
6. Snapshot only the provider identifiers needed for idempotent retry.
7. Delete provider resources idempotently and treat provider not-found as success.
8. Replace unbounded local cleanup with an explicit bounded cleanup registry.
9. Delete the repository row once, last.
10. Preserve audit boundaries deliberately instead of deleting or retaining rows by accident.
11. Show deleting and failed-deletion states from durable backend state.
12. Support retry after partial external cleanup by reusing the stored snapshot.

## Non-Goals

1. Build a generic operation-run framework.
2. Add user cancellation after deletion is accepted.
3. Keep a deleting repository usable as a repository workspace.
4. Delete GitHub repositories for repositories connected to existing GitHub repositories.
5. Infer or delete an unknown GitHub repository from a failed create attempt.
6. Redesign unrelated app provisioning, branch refresh, or editor behavior beyond the deletion gate
   they must honor.
7. Accept deletion while source setup, Convex provisioning, Cloudflare provisioning, or another
   repository lifecycle run is active.

## Accepted Decisions

### One User Action

The product action stays simple: the user opens the delete dialog, chooses the available teardown
options, and confirms once. The client no longer waits for all provider and local cleanup work to
finish. It waits only until the deletion request is durably accepted.

After acceptance:

1. close the dialog
2. keep the repository card visible in a deleting state until the repository row is gone
3. disable repository-backed controls on that card
4. show a failed-deletion state if the run fails
5. offer retry from the failed state

Do not hide the repository card immediately after queueing. A visible deleting or failed-deletion
state is the user's only reliable progress surface while the repository row still exists.

### Public Deletion Language

The repository UI uses `Remove from Samebase` for removal of the Samebase record. When upstream
deletion is available, the option uses `Also delete the GitHub repository`. The UI must not label
local record removal as `Delete repository`. Internal code and workflow text can continue to use
`repository deletion`.

### Quiescent Repository Requirement

Deletion is available only for quiescent repositories. This intentionally makes half-provisioned
cleanup cases unrepresentable instead of asking the deletion Workflow to coordinate with active
source and provider workflows.

A repository is quiescent for deletion when:

1. the repository has no active deletion gate
2. source setup is not running: the repository is connected or failed, but not provisioning
3. no `workflow_repositoryProvisioning_runs` row for the repository is `queued` or `running`
4. no manual provider write owner is `active`

The dashboard should disable delete with a short reason while a repository is not quiescent. A
direct selected repository `?delete` URL, such as `/repo/samebase/samebase?delete`, for a
non-quiescent repository keeps the delete dialog open, disables its confirmation action, and shows
the same server reason.

The queueing action must also enforce this rule through the shared repository deletion eligibility
reader. This reader combines the repository infrastructure state with an any-trigger active
provisioning run check. The queueing action checks this result and sets the deletion gate in the
same transaction. If a managed run or manual write claims the repository first, deletion rejects
without inserting a deletion run, without setting the deletion gate, and without touching providers.
If deletion claims the repository first, later managed and manual provider writes reject.

### Dedicated Deletion Runs

The implementation uses dedicated `workflow_repositoryDeletion_runs` and
`workflow_repositoryDeletion_events` tables. It does not stretch
`workflow_repositoryProvisioning_runs` for deletion.

Provisioning runs describe source and provider setup. Deletion has different steps, retry rules,
retention rules, and success criteria. Keeping it separate also lets the workflow delete old
`workflow_repositoryProvisioning_runs` and `workflow_repositoryProvisioning_events` as
repository-scoped setup history without deleting the deletion run that is still finishing the
repository removal.

### Separate Repository Deletion Gate

The repository row has a separate deletion gate. The model is an explicit union, not a set of
optional flags:

```ts
type RepositoryDeletionState =
  | {
      state: "not_deleting";
    }
  | {
      state: "deleting";
      runId: Id<"workflow_repositoryDeletion_runs">;
      requestedAt: number;
    }
  | {
      state: "delete_failed";
      runId: Id<"workflow_repositoryDeletion_runs">;
      failedAt: number;
    };
```

Persist `deletion` as a required `RepositoryDeletionState` on every repository row. New repository
rows start with `{ state: "not_deleting" }`; product code must not model `not_deleting` as an absent
optional field.

This gate is not a GitHub source-workspace state. A repository can still be `state: "connected"`
while `deletion.state === "deleting"`, but repository-backed reads and writes must treat the
deletion gate as stronger than connected GitHub state.

Failed deletion keeps repository-backed behavior blocked. A failed run may have already removed
provider resources, so the product must not silently resume the workspace. Retry is the supported
path.

### Provider Deletes Before Local Cleanup

The workflow deletes external resources before local metadata cleanup. The deletion run snapshot
keeps provider identifiers available for retry until the provider steps have succeeded or the run is
abandoned.

Local cleanup must not delete the rows needed to retry provider teardown before those provider steps
finish.

### Bounded Local Cleanup

Local cleanup is a registry of table-specific batch mutations. Each registry entry names:

1. table
2. index or lookup path
3. retention behavior
4. row deletion or patch behavior
5. storage cleanup behavior when relevant
6. batch-size constant

No registry entry may use an unbounded `.collect()` for data that can grow with branches, files,
edits, blobs, runtime state, or provisioning history. Tests should force multiple batches with a
small batch size so one-pass cleanup does not mask an unsafe implementation.

Workflow owns durable phase orchestration; batch mutations own row cleanup. Do not model each
deleted row or each cleanup batch as a separate Workflow step. For very large repositories, a
Workflow step should call bounded cleanup mutations until the current phase is complete, with
idempotent progress checks on each retry. The Workflow journal must not become the next unbounded
cleanup surface.

### Retention Decisions

Delete repository-scoped product and cache data. Preserve deletion operation history.

Accepted retention rules:

1. `workflow_repositoryProvisioning_runs` and `workflow_repositoryProvisioning_events` are
   repository-scoped setup history and should be deleted in batches.
2. `workflow_repositoryDeletion_runs` and `workflow_repositoryDeletion_events` are deletion
   operation history and should outlive the repository row. They must not store credentials,
   provider tokens, deploy keys, request headers, or raw provider payloads.
3. After a deletion succeeds, the run scrubs the complete plan and its options. The run retains
   `githubRepositoryFullName`, attempt information, final state, and timestamps. The events retain
   display-safe operation history.

## Data Model

### Model Quality Bar

The deletion schema is part of the product contract. Small changes here affect backend state
transitions, frontend affordances, retry behavior, and user trust, so implementation should treat
the data model as the highest-leverage code in this project.

The persisted model should use the smallest set of required discriminated variants that makes
invalid business states unrepresentable. Optional fields are allowed only for:

1. migration windows over existing rows
2. external provider data that is genuinely absent in one explicit variant
3. a short start gap before the Workflow component returns `workflowId`
4. post-success scrubbing of retry-only provider identifiers

Do not preserve an optional field from this spec if implementation finds a cleaner union that
encodes the same business rule. Conversely, do not add compatibility mirrors, raw UI state, provider
payloads, or future-proof variants unless a current caller or persisted-data constraint requires
them. If implementation changes the durable shape, update this spec and the tests in the same PR so
the accepted contract stays current.

The TypeScript snippets below may use intersections to keep the document readable. Convex schema
validators should still define complete persisted variants when that makes validation clearer or
prevents accidental optional fields.

### Deletion Request Options

The public action accepts optional checkbox-shaped request options and converts each missing value
to `false`:

```ts
type DeleteRepositoryArgs = {
  repositoryId: Id<"repositories">;
  removeGithubRepo?: boolean;
  removeConvexProvision?: boolean;
  removeCloudflareProvision?: boolean;
};
```

After this normalization, the internal `DeletionRequestOptions` object contains three required
booleans. The queueing action validates them against the current repository and provider state, then
persists a validated deletion plan.

### Deletion Plan

The deletion plan records the source-workspace state being deleted plus the accepted destructive
provider work. The model includes only states the current product can create. Do not add a
`not_connected` deletion target until a shipped flow creates user-visible not-connected
repositories.

The deletion plan can be built only from a quiescent repository. Running source or provider setup
states are not deletion targets and should not appear as plan variants.

```ts
type RepositoryDeletionPlan = ProviderCleanupPlan &
  (
    | {
        target: {
          kind: "samebase_managed_repository";
          githubRepositoryDatabaseId: string;
          githubOwnerLogin: string;
          githubRepositoryName: string;
          githubRepositoryFullName: string;
        };
        githubRepository:
          | {
              action: "skip";
              reason: "not_requested";
            }
          | {
              action: "delete_repository";
              githubRepositoryDatabaseId: string;
              githubOwnerLogin: string;
              githubRepositoryName: string;
            };
      }
    | {
        target: {
          kind: "existing_repository";
          githubRepositoryDatabaseId: string;
          githubOwnerLogin: string;
          githubRepositoryName: string;
          githubRepositoryFullName: string;
        };
        githubRepository: {
          action: "skip";
          reason: "not_requested" | "not_samebase_managed";
        };
      }
    | {
        target: {
          kind: "failed_repository_setup";
          githubMode: "create_repository" | "connect_existing_repository";
          githubOwnerLogin: string;
          githubRepositoryName: string;
          githubRepositoryFullName: string;
        };
        githubRepository: {
          action: "skip";
          reason: "not_requested" | "no_confirmed_identity";
        };
      }
  );
```

This shape deliberately binds the target kind to allowed GitHub repository teardown. "Delete an
existing repository's GitHub repository" and "delete an unknown failed-create repository" do not fit
in the persisted plan.

```ts
type ProviderCleanupPlan = {
  convex:
    | {
        action: "skip";
        reason: "not_requested" | "not_managed" | "not_samebase_managed" | "not_recorded";
      }
    | {
        action: "delete_projects";
        projects: Array<{
          teamId: string;
          projectId: string;
        }>;
      };
  cloudflare:
    | {
        action: "skip";
        reason: "not_requested" | "not_managed" | "not_samebase_managed" | "not_recorded";
      }
    | {
        action: "delete_workers";
        workers: Array<{
          accountId: string;
          workerName: string;
          workerTag: string;
        }>;
      };
};
```

The retry snapshot stores only the deletion plan and identifiers needed for provider teardown,
retry, and safe display. It must not store credentials or raw provider responses.

When the queueing action builds the plan, every Convex `teamId` must equal the repository's required
`convexTeamId`, and every Cloudflare `accountId` must equal its required `cloudflareAccountId`.
Execution and retry load the current organization-owned singleton credential slot for that fixed
destination before the first provider call. A destination mismatch fails closed without deleting a
provider resource.

Cloudflare Worker deletion uses `workerTag` as the provider delete identifier. `workerName` remains
display context only and never authorizes deletion of a replacement Worker that reused the name. The
stored `rootDirectory` is placement context and is not part of the deletion snapshot or delete
authority. Spec 115 defines this identity and placement split.

Conceptual shape:

```ts
type RepositoryDeletionSnapshot = {
  state: "retained_for_retry";
  plan: RepositoryDeletionPlan;
};
```

`removeGithubRepo` is valid only for connected `githubMode: "create_repository"` repositories with
immutable GitHub identity. Removal of an existing GitHub repository from Samebase must not delete
the user's GitHub repository.

Failed create attempts may have created a GitHub repository before connected identity was written.
Until the repository model records retained external repository identity for that case, deletion
must not infer a repository to delete from the requested owner and repository name.

### Deletion Runs

Conceptual shape:

```ts
type RepositoryDeletionRunBase = {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  repositoryId: Id<"repositories">;
  githubRepositoryFullName: string;
  attempt:
    | {
        kind: "initial";
      }
    | {
        kind: "retry";
        retryOf: Id<"workflow_repositoryDeletion_runs">;
      };
  createdAt: number;
  updatedAt: number;
};

type RepositoryDeletionWorkflowRef =
  | {
      state: "not_started";
    }
  | {
      state: "started";
      workflowId: string;
    };

type RepositoryDeletionRun = RepositoryDeletionRunBase &
  (
    | {
        state: "queued";
        workflow: {
          state: "not_started";
        };
        currentStep: "initialize_deletion";
        snapshot: RepositoryDeletionSnapshot;
      }
    | {
        state: "running";
        workflow: {
          state: "started";
          workflowId: string;
        };
        currentStep: RepositoryDeletionStep;
        snapshot: RepositoryDeletionSnapshot;
      }
    | {
        state: "failed";
        workflow: RepositoryDeletionWorkflowRef;
        currentStep: RepositoryDeletionStep;
        snapshot: RepositoryDeletionSnapshot;
        lastError: string;
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

1. `workflow_repositoryDeletion_runs.by_state`
2. `workflow_repositoryDeletion_runs.by_repository_and_updated_at`
3. `workflow_repositoryDeletion_runs.by_organization_and_updated_at`
4. `workflow_repositoryDeletion_runs.by_organization_and_state_and_updated_at`
5. `workflow_repositoryDeletion_runs.by_organization_and_user_and_state_and_updated_at`
6. `workflow_repositoryDeletion_runs.by_user_and_state_and_updated_at`
7. `workflow_repositoryDeletion_runs.by_workflow_id`
8. `workflow_repositoryDeletion_runs.by_retry_of`

The active gate lives on the repository row, so hot repository-backed paths do not need to query
`workflow_repositoryDeletion_runs` after they have already loaded the repository.

### Deletion Events

Deletion events follow the provisioning-event pattern with deletion-specific steps.

Conceptual shape:

```ts
type RepositoryDeletionEvent = {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  repositoryId: Id<"repositories">;
  githubRepositoryFullName: string;
  runId: Id<"workflow_repositoryDeletion_runs">;
  step: RepositoryDeletionStep;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: number;
  sourceOrder: {
    creationTime: number;
    documentId: string;
  };
};
```

Required indexes:

1. `workflow_repositoryDeletion_events.by_organization_and_created_at_and_source_order`
2. `workflow_repositoryDeletion_events.by_repository_and_created_at_and_source_order`
3. `workflow_repositoryDeletion_events.by_run_and_created_at_and_source_order`

The public repository query returns at most 80 events. It omits `organizationId`, `userId`,
`repositoryId`, and `sourceOrder` from the result.

## Step Taxonomy

The deletion workflow uses this step union:

```ts
type RepositoryDeletionStep =
  | "initialize_deletion"
  | "lock_repository"
  | "delete_cloudflare"
  | "delete_convex"
  | "delete_github_repository"
  | "cleanup_editor_state"
  | "cleanup_source_caches"
  | "cleanup_runtime_state"
  | "cleanup_provisioning_history"
  | "remove_repository"
  | "finish";
```

Current event copy:

1. `initialize_deletion`: "Queued removal from Samebase." or "Queued removal retry."
2. `lock_repository`: "Blocked new repository work."
3. `delete_cloudflare`: "Removing Cloudflare resources."
4. `delete_convex`: "Removing Convex resources."
5. `delete_github_repository`: "Deleting GitHub repository."
6. `cleanup_editor_state`: "Cleaning staged edits and blobs."
7. `cleanup_source_caches`: "Cleaning branch and source caches."
8. `cleanup_runtime_state`: "Cleaning repository runtime state."
9. `cleanup_provisioning_history`: "Cleaning setup history."
10. `remove_repository`: "Removing from Samebase."
11. `finish`: "Removed from Samebase."

## Target Flow

### Queueing Action

`repository.actions.deleteRepository` is a queueing action.

It should:

1. authenticate the user
2. load and authorize the repository
3. reject a repository that already has an active `deletion` gate
4. reject any repository that is not quiescent for deletion
5. validate selected teardown options against current local state
6. defer provider credential resolution to Workflow; queueing does not require a current credential
   slot
7. build the validated deletion plan and retry snapshot
8. insert `workflow_repositoryDeletion_runs` and the first event
9. patch the repository deletion gate to `deleting`
10. start the deletion Workflow
11. return `{ deletionRunId }`

External provider API validation happens inside Workflow after the durable run exists. Local
validation, including quiescence, fails before queueing. For example, requesting GitHub repository
deletion for a repository connected to an existing GitHub repository, or deleting a repository
during an active provider write, fails before the run is inserted.

If Workflow startup fails after the run and gate are inserted, the action must mark the run failed,
patch the repository gate to `delete_failed`, append an error event, and return an error.

### Workflow

The deletion Workflow runs:

1. `lock_repository`: claim the run and confirm the repository deletion gate points to this run
2. `delete_cloudflare`: delete the recorded Cloudflare Workers when requested
3. `delete_convex`: delete the recorded Convex projects when requested
4. `delete_github_repository`: delete the recorded Samebase-managed GitHub repository when requested
5. `cleanup_editor_state`: delete `repositoryStagedFiles`, `repositoryStagedFileUpdates`,
   `observations_repositoryFiles_blobs`, and backing storage in bounded batches
6. `cleanup_source_caches`: delete pull request filters, resource-link settings, folder expansion
   state, and `observations_repository_branchTrees` in bounded batches
7. `cleanup_runtime_state`: delete provider attachments, Convex schema state, provisioning plans,
   and write locks in bounded batches
8. `cleanup_provisioning_history`: delete setup runs and setup events in bounded batches
9. `remove_repository`: delete the repository row once
10. `finish`: mark the deletion run succeeded and scrub retry-only snapshot identifiers

Each cleanup step repeats bounded cleanup mutations as separate durable Workflow steps until that
phase is done. A failed or retried workflow may restart a cleanup step from the beginning because
deleting an already deleted row, detaching an already detached row, and seeing a provider not-found
response are all successful idempotent outcomes.

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
4. patch the repository deletion gate to `delete_failed` if the repository still exists

If the repository row is already gone when a late failure handler runs, the handler must update the
deletion run only. It must not recreate the repository or any repository-scoped rows.

## Provider Teardown Rules

### Cloudflare

1. Delete only the Workers in a `delete_workers` plan and their build triggers.
2. Require the organization's Cloudflare credential slot to match the repository's
   `cloudflareAccountId` when Cloudflare teardown is requested.
3. Treat provider not-found as success.
4. Do not delete account-level or unrelated Cloudflare resources.

### Convex

1. Delete only the exact projects in a `delete_projects` plan.
2. The queueing action derives those projects only from stable Samebase-provisioned project
   attachments. A provisioning checkpoint alone never authorizes provider deletion.
3. Require the organization's Convex credential slot to match the repository's `convexTeamId` when
   Convex teardown is requested.
4. Treat provider not-found as success.
5. Do not store Convex deploy-key credentials or identifiers in the deletion plan unless
   implementation proves a current provider call needs them.

### GitHub Repository

1. Delete the repository only from a `samebase_managed_repository` plan whose
   `githubRepository.action` is `delete_repository`.
2. Read owner and name, require the returned GitHub repository ID to match the plan, treat 404 as
   already absent, and stop on an ID mismatch.
3. Do not delete repositories for `connect_existing_repository` repositories.
4. Do not delete repositories for failed create attempts without confirmed immutable GitHub
   identity.

## Local Cleanup Registry

The registry covers these tables.

All cleanup entries must achieve repository-wide coverage. Phase 1 adds repository-prefixed indexes
for tables that were previously only reachable through user-scoped indexes. If a future cleanup
entry only has a user-scoped index, the implementation must either add a repository-prefixed index
or explicitly iterate every user row associated with that repository. Repository deletion must never
clean only the requesting user's rows.

Delete rows:

1. `ui_repositoryPullRequests_filters` via `by_repository`
2. `ui_repositoryResourceLinks_settings` via `by_repository`
3. `ui_repositoryTree_folderAssignments` via `by_repositoryId`
4. `repositoryStagedFiles` via `by_repository`
5. `repositoryStagedFileUpdates` via `by_repository`
6. `observations_repositoryFiles_blobs` via `by_repository`
7. `ui_repositoryFileTree_folderExpansions` via `by_repository`
8. `observations_repository_branchTrees` via `by_repository_and_branch` with the `repositoryId`
   prefix
9. `repositoryConvexProjects` via `by_repository`
10. `observations_repositoryConvexSchema_snapshots` via `by_repository`
11. `ui_repositoryConvexSchemaGraph_nodeLayouts` via `by_repository`
12. `repositoryCloudflareWorkers` via `by_repository`
13. `workflow_repositoryProvisioning_plans` via `by_repository`
14. `workflow_repositoryProvisioning_writeLocks` via `by_repository`
15. `workflow_repositoryProvisioning_events` via `by_repository_and_created_at_and_source_order`
16. `workflow_repositoryProvisioning_runs` via `by_repository_and_updated_at`

For storage-backed staged files and blobs, a batch deletes the repository rows first. It then uses
the global `by_storageId` indexes for both tables. It deletes a storage object only when no
surviving staged-file or blob row refers to it.

Preserve rows:

1. `workflow_repositoryDeletion_runs`
2. `workflow_repositoryDeletion_events`

The registry must be fail-closed. If a new repository-scoped table is added later, the table owner
must either add it to this cleanup registry or explicitly mark it preserved with a retention reason.

The `observations_repositoryFiles_blobs.by_repository` index is also required for sibling cleanup
outside the deletion Workflow. `fileStaging.deletePendingUploadBlob` must use the same
repository-scoped blob index when checking whether an uploaded storage object is protected by
staging.

## Deletion Gate Requirements

An active or failed deletion gate must block or hide:

1. file staging reads and writes
2. commits and media uploads
3. collaborative edits
4. branch refresh and remote-branch sync
5. infrastructure provisioning and retry
6. source setup completion writes for the same repository
7. provider attachment changes and external provider writes

Backend functions that already load the repository should check the repository deletion gate in the
same helper that checks connected GitHub state. Backend functions that currently mutate by
`repositoryId` without loading the repository must either load the repository and check the gate or
be moved behind a helper that does so.

Provisioning workflows from specs 096 and 097 must fail closed if they try to write connected state,
tree state, or provider state after deletion has started. That is a race-safety fallback, not
permission to start deletion while a known provisioning run is active.

## Dashboard Behavior

The delete dialog remains route-owned by a key-only `?delete` search flag on the selected repository
route, for example `/repo/samebase/samebase?delete`. A `?delete` URL without a selected repository
route is invalid and should be cleared.

When the target repository is not deleting:

1. show the same teardown options as today only if the repository is quiescent
2. show the current setup state and disable delete with a reason when the repository is not
   quiescent
3. disable the confirm button while the queueing action is pending
4. close the dialog when the deletion run is accepted

When the target repository is deleting or delete-failed:

1. do not open a second destructive dialog
2. show the card's deleting or failed-deletion state
3. keep repository-backed controls disabled

Deleting cards should show a quiet in-progress state derived from the current deletion run and
latest event. Failed-deletion cards should show the latest user-safe error and a retry action.

Retry creates a new `workflow_repositoryDeletion_runs` row with `retryOf` pointing at the failed
run, copies the failed run's retained deletion plan, patches the repository gate back to `deleting`,
and starts a new Workflow. Retry does not let the user edit teardown options in the first
implementation.

## Implementation Status

The bounded cleanup registry, durable deletion workflow, repository deletion gate, provider
teardown, retry runs, dashboard state, and repository-writer gates are implemented. The dashboard
view derives removal state from the repository gate, deletion runs, deletion events, and the shared
eligibility reader. It does not store separate UI state.

Focused provider-action tests for GitHub, Convex, and Cloudflare success, not-found, and failure
cases remain useful future coverage. This does not change the current workflow contract.

## Testing Plan

Backend:

1. queueing deletion creates a run before any provider delete
2. selected teardown options are converted into a validated deletion plan
3. invalid deletion plans are unrepresentable in persisted deletion runs
4. non-quiescent repositories fail before queueing and do not create deletion runs
5. invalid teardown options fail before queueing
6. provider not-found responses count as successful cleanup
7. provider failures leave the repository visible with `delete_failed`
8. retry uses the failed run's retained deletion plan
9. branch-heavy cleanup completes through multiple bounded batches
10. `observations_repositoryFiles_blobs` cleanup deletes storage objects and rows
11. pending-upload blob cleanup uses the repository-scoped blob index
12. `repositoryStagedFileUpdates` are deleted at repository scope
13. `workflow_repositoryProvisioning_runs` and `workflow_repositoryProvisioning_events` are deleted
    in batches
14. the repository row is deleted only after dependent cleanup succeeds
15. source setup and provider provisioning writes fail closed after deletion starts
16. simultaneous deletion and managed or manual provider-write claims permit only one operation

Frontend:

1. the delete dialog closes after the deletion request is accepted
2. non-quiescent repositories show disabled delete controls with a reason
3. deleting repositories keep a visible card until the repository row is removed
4. deleting repositories do not expose repository-backed controls
5. failed deletion shows the latest safe backend error
6. retry starts a new deletion run without changing options
7. direct delete URLs do not open a second dialog for deleting or failed-delete repositories

## Acceptance Criteria

1. Removal from Samebase is one user action backed by durable Workflow state.
2. No external provider delete runs before a deletion run and repository gate exist.
3. The repository deletion gate is separate from GitHub source-workspace `state`.
4. Deletion is available only for quiescent repositories; active provisioning states cannot enter
   the deletion workflow.
5. The durable deletion run stores a validated discriminated deletion plan, not raw UI checkbox
   state.
6. Provider teardown is idempotent and provider not-found is success.
7. Branch-heavy repository cleanup is bounded by table-specific batches.
8. No cleanup mutation loads all blobs, branches, staged files, collaborative updates, or
   provisioning history for a repository in one transaction.
9. The repository row is deleted once, last.
10. Failed deletion leaves a retryable visible state.
11. Repository-backed writers fail closed while deletion is active or failed.
12. Managed setup and manual provider writes cannot start after deletion claims the repository.
