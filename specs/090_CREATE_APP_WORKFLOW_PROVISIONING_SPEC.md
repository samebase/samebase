# Create App Workflow Provisioning Spec

## Document Control

- Status: Accepted phased implementation plan
- Owner: Noter app creation + infrastructure provisioning
- Created: 2026-05-02
- Related docs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `research/2026-05-02-workpool-refresh-and-tenant-compute.md`

## Summary

Adopt Convex Workflow for the create-new-app provisioning lifecycle so Noter can
show one durable, user-readable run instead of collapsing GitHub, Convex,
Cloudflare, env setup, and deployment state into a coarse dashboard label.

The first implementation slice should not rewrite the whole create path. It
should add durable provisioning logs and a simple dashboard log textarea so the
current async provisioning path becomes observable before the Workflow
migration.

## Current Runtime State

`vaultActions.createRepository` currently:

1. validates GitHub, Convex, and Cloudflare provider connections
2. creates the GitHub repository
3. seeds the starter app
4. fetches the initial branch tree
5. creates a Noter vault row
6. creates an `appProvisioningRuns` row
7. starts `internal.appProvisioningWorkflow.provisionVaultInfrastructure`

`appProvisioningWorkflow.provisionVaultInfrastructure` currently:

1. claims a vault-level provisioning lock
2. creates or reuses Convex project/deployment resources
3. creates preview Convex resources
4. creates or reuses Cloudflare Pages resources
5. configures provider env/build state
6. writes `vaultInfrastructure` and `vaultDomains`
7. marks the vault `ready`, `partial`, or `failed`

The dashboard currently surfaces this mostly through:

1. `vaults.infraState`
2. `vaults.infraLastError`
3. a retry button for failed or partial infrastructure
4. provider dashboard links when metadata exists

This is operationally useful but unclear during app creation because multiple
provider steps can succeed or fail under the same visible state.

Phase 1 shipped durable `appProvisioningEvents` and a dashboard log textarea.
Phase 2 adds app-owned run identity and stores the Workflow id so the app can
safely expose Workflow status, restart failed work, cancel work, or clean up
completed component records.

## Goals

1. Make create-new-app provisioning understandable from the dashboard.
2. Record durable, user-safe provisioning progress events.
3. Show a basic log textarea for each Noter-managed vault with recent
   provisioning events.
4. Preserve current idempotent provider helpers and retry behavior.
5. Migrate to Convex Workflow incrementally after the observable run model
   exists.

## Non-Goals

1. Rewrite repository creation, starter seeding, Convex provisioning, and
   Cloudflare provisioning in one PR.
2. Store secrets, tokens, provider credentials, env var values, or raw provider
   payloads in logs.
3. Add a polished timeline UI before the backend run model is proven.
4. Introduce BYO Convex worker execution in this slice.
5. Change provider connection requirements for app creation.

## Proposed Architecture

### 1. Provisioning Run Identity

Add an app-owned run table before moving execution into Workflow:

```ts
appProvisioningRuns: {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  workflowId?: string;
  trigger: "create" | "retry";
  state: "queued" | "running" | "succeeded" | "failed" | "canceled";
  currentStep?: AppProvisioningStep;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}
```

Indexes:

1. `by_vault_and_updated_at`
2. `by_user_and_updated_at`
3. `by_workflow_id`

Run rules:

1. Keep `workflowId` as an opaque component id string owned by this app table.
2. Query runs through app-owned authorization checks; do not expose component
   internals directly to React.
3. Store user-safe status and error text only. Secrets, tokens, env values,
   deploy keys, request headers, and raw provider payloads remain forbidden.
4. Legacy Phase 1 vaults may have provisioning events without a run. A retry for
   those vaults should start a new run instead of trying to invent a historical
   Workflow id.
5. Completed Workflow component records need a documented cleanup path after the
   app-owned run has durable terminal state.

### 2. Provisioning Events Foundation

Add an app-owned event table for provisioning visibility:

```ts
appProvisioningEvents: {
  userId: Id<"users">;
  vaultId?: Id<"vaults">;
  repositoryFullName?: string;
  runId?: Id<"appProvisioningRuns">;
  step:
    | "validate_connections"
    | "create_github_repo"
    | "seed_starter"
    | "create_vault"
    | "claim_infra"
    | "ensure_convex"
    | "ensure_convex_preview"
    | "ensure_cloudflare"
    | "record_domains"
    | "finish";
  level: "info" | "warn" | "error";
  message: string;
  createdAt: number;
}
```

Indexes:

1. `by_vault_and_created_at`
2. `by_user_and_created_at`

Logging rules:

1. Messages must be concise and operator-facing.
2. Messages must not include credentials, env values, deploy keys, tokens,
   cookies, request headers, or raw provider responses.
3. Provider identifiers such as repo full name, project name, account ID,
   deployment name, and dashboard-safe URLs are allowed when already visible in
   the app.
4. Query results must be explicitly sorted by `createdAt`, with `_creationTime`
   or document ID as a stable tie-breaker.

Phase 1 shipped the event table without `runId`. Phase 2 should add `runId` as
optional, link new Workflow-backed events to the active run, and keep old events
readable.

### 3. Starter Dashboard Log Textarea

For Noter-managed vaults, add a basic read-only textarea under the existing
developer/infra dashboard surface.

The textarea should:

1. subscribe to recent provisioning events for the vault
2. render plain timestamped lines
3. keep the newest entries visible by source order, not client mutation
4. stay empty or hidden when no events exist
5. avoid extra explanatory copy

This intentionally starts as a simple textarea, not a designed stepper, so the
team can verify the run model before designing richer chrome.

### 4. Workflow Target

After event logging exists, adopt Convex Workflow for the provisioning
lifecycle.

Target workflow steps:

1. `validate_connections`
2. `create_github_repo`
3. `seed_starter`
4. `create_vault`
5. `ensure_convex`
6. `ensure_convex_preview`
7. `ensure_cloudflare`
8. `record_domains`
9. `finish`

Each step should call a narrow internal function that remains idempotent where
provider APIs allow it.

Workflow rules:

1. Keep secrets in `providerConnections`; pass IDs or redacted metadata through
   workflow step arguments and results.
2. Keep large provider payloads out of workflow arguments/results.
3. Version workflow names or args when changing active step structure.
4. Use Workflow restart-from-failed-step behavior only after each step is
   idempotent or has an explicit compensation path.
5. Record user-facing status in app-owned tables instead of exposing Workflow
   component internals directly to React.

### 5. Migration Sequence

Phase 1: Durable logs.

1. Add `appProvisioningEvents`.
2. Add internal logging helpers.
3. Add public vault-scoped log query.
4. Instrument the current create/provision path with safe events.
5. Show a read-only textarea on dashboard cards.

Phase 2: Workflow component install and post-vault infra workflow.

1. Add `@convex-dev/workflow`.
2. Install the Workflow component in `convex.config.ts`.
3. Add `appProvisioningRuns` and optional `runId` links on new provisioning
   events.
4. Create `appProvisioningWorkflow.ts`.
5. Split the current infra action into a deterministic workflow handler plus
   narrow idempotent step functions. Provider side effects, env reads, and
   network calls must stay inside step actions, not in the workflow handler.
6. Move only post-vault infra provisioning into Workflow.
7. Keep `vaultActions.createRepository` responsible for GitHub repo creation
   until infra Workflow behavior is proven.
8. Keep the Phase 1 textarea as the only shipped UI change unless the run record
   exposes an immediately useful, minimal status line.

Phase 3: Full create-app Workflow.

1. Move GitHub repository creation and starter seeding into Workflow steps.
2. Track a run before the vault exists.
3. Link the run to `vaultId` once the vault row is created.
4. Let retry resume from the failed step instead of re-running completed
   provider operations.

## UI States

The eventual dashboard timeline should collapse to one actionable state:

1. `Blocked`: provider connection or provider selection missing
2. `Running`: current step in progress
3. `Needs input`: user must reconnect or choose a provider account
4. `Retryable`: failed step can resume
5. `Ready`: app production URL and provider links are available

The Phase 1 textarea is the low-cost bridge to these states.

## Testing Plan

Backend:

1. log helper inserts user-safe events for a vault
2. log query rejects access for non-owners
3. query returns deterministic chronological order
4. failed infra provisioning records an error-level event
5. retry appends new events without deleting prior events

Frontend:

1. Noter-managed vault with events shows a read-only textarea
2. vault without events does not render empty log chrome
3. failed/partial infra cards keep the existing retry action
4. log lines do not overlap existing dashboard card controls

Workflow follow-up:

1. workflow resumes after an action step failure without repeating completed
   provider operations
2. changing workflow versions does not break in-flight runs
3. completed workflow/component records are cleaned up on a documented cadence

## Acceptance Criteria

1. New app provisioning has durable, user-visible logs.
2. Dashboard cards expose recent provisioning logs in a simple read-only
   textarea for Noter-managed vaults.
3. Logs do not contain secrets or raw provider payloads.
4. Existing create, retry, and infra state behavior remains compatible.
5. The spec defines the incremental path from observable scheduler-based
   provisioning to Convex Workflow-backed provisioning.
