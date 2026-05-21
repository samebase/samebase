# Dashboard Reload Sync Workpool Research

## Document Control

- Status: Simplified research
- Owner: dashboard reload, GitHub sync, branch cache freshness
- Created: 2026-05-09
- Simplified: 2026-05-11
- Authoritative implementation spec:
  - `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
- Related specs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`

## Core Rule

- Frontend reports demand.
- Backend owns supply.
- Spec 099 owns the implementation shape.

Research explains why. Spec 099 defines what to build.

## Merge-Critical Fixes From Review

These are the five points that must stay true before merging this PR.

### 1. No Superseded State Model

Do not keep or reintroduce the old request model.

Request rows must not store:

- `work`
- `priority`
- metadata depth
- ahead/behind settings
- provider/comment parser

Those are backend execution policy, not caller state.

The request row stores demand:

```ts
type RepositoryRefreshRequest = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  dedupeKey: string;
  demand: RepositoryRefreshDemand;
  lifecycle: RepositoryRefreshLifecycle;
  createdAt: number;
  updatedAt: number;
};

type RepositoryRefreshDemand = RepositoryScopeRefreshDemand | BranchScopeRefreshDemand;
```

### 2. Spec 099 Is Authoritative

If this research and Spec 099 conflict, Spec 099 wins.

The accepted state model is:

```ts
type RepositoryScopeRefreshDemand =
  | {
      scope: "repository";
      source: "dashboard";
      trigger: "page_load" | "visibility";
    }
  | {
      scope: "repository";
      source: "manual";
      trigger: "dashboard_status_click";
    }
  | {
      scope: "repository";
      source: "source_setup";
      runId: Id<"appProvisioningRuns">;
      mode: "create_repository" | "connect_existing_repository";
    };

type BranchScopeRefreshDemand =
  | {
      scope: "branch";
      branch: string;
      source: "file_view";
      trigger: "page_load" | "visibility";
    }
  | {
      scope: "branch";
      branch: string;
      source: "manual";
      trigger: "dashboard_status_click";
    }
  | {
      scope: "branch";
      branch: string;
      source: "commit";
    }
  | {
      scope: "branch";
      branch: string;
      source: "pull";
    };
```

This prevents:

- dashboard demand with a branch
- file-view demand without a branch
- commit demand without a branch
- pull demand without a branch
- source-setup demand without a provisioning run

### 3. Dedupe Shape Is Explicit

Callers never pass `dedupeKey`.

The backend derives it from `userId`, `vaultId`, and demand scope:

| Scope        | Key shape                              |
| ------------ | -------------------------------------- |
| `repository` | `user:{id}:vault:{id}:repository`      |
| `branch`     | `user:{id}:vault:{id}:branch:{branch}` |

Active row rule:

- active = `queued` or `running`
- one active row per `userId + dedupeKey`
- terminal rows are history
- running rows are reused
- queued rows upgrade only when incoming demand has stronger priority

### 4. Workpool Questions Move To The Workpool PR

This PR records demand. It does not execute queued rows.

The Workpool PR must decide these before implementation:

- stale `running` recovery
  - Example: worker starts, process crashes, row remains `running`.
- retry semantics
  - Example: provider rate-limits; decide attempt count, backoff, and final failure state.
- terminal row retention
  - Example: keep recent success/failure rows for debugging, then prune.
- result audit detail
  - Example: decide whether `result.refreshed` should include executed steps.
- pool topology
  - Example: one pool with priority/notBefore, or separate interactive and background pools.

Default for the next PR: start with the smallest Workpool shape that executes repository demand
clearly. Split only when the implementation proves one pool is unclear or unfair.

### 5. Future Pressure Stays Deferred

Do not add current state for operations that do not exist.

Deferred:

- `user_canceled`
  - No cancel UI or admin operation exists.
- free/paid thresholds
  - Pricing policy is not part of this PR.
- generic provider plugins
  - Provider parsing stays internal.
- extra provider parsers
  - Cloudflare Pages comments can be first; Netlify or CodeRabbit-style parsers can be added later
    as internal handlers.
- self-hosted/user Convex execution
  - This only pushes us toward narrow boundaries now.

## Current Entry Points

| Entry point                      | Current code                  | Queue direction                      |
| -------------------------------- | ----------------------------- | ------------------------------------ |
| Dashboard page load / visibility | frontend signals freshness    | backend selects user vaults          |
| Dashboard manual refresh         | one explicit vault demand     | backend priority policy              |
| Existing repo connect finish     | workflow completion           | backend enqueues source-setup demand |
| File view page load / visibility | direct branch refresh remains | later branch demand                  |
| Commit / pull                    | direct cache refresh remains  | later branch demand if clearer       |

Important current files:

- `apps/noter/convex/repositoryRefreshModel.ts`
  - state validators
  - constructors
  - priority derivation
  - dedupe derivation
- `apps/noter/convex/repositoryRefresh.ts`
  - demand ingest
  - dashboard backend fan-out
  - source setup enqueue
- `apps/noter/convex/appProvisioningWorkflowActions.ts`
  - existing-repository completion enqueue

## Backend Execution Policy

Demand can later expand into internal steps:

```ts
type RepositoryRefreshStep =
  | "discover_branches"
  | "sync_pull_requests"
  | "sync_branch_tree"
  | "sync_provider_links";
```

Steps are not caller choices and are not request-row fields.

Examples:

- dashboard demand may run branch discovery
- source-setup demand may run repository metadata sync
- source-setup demand may hydrate Cloudflare preview links once after connect or create, without
  adding provider/depth fields to request rows
- branch demand may run tree refresh
- provider-link refresh may parse Cloudflare Pages comments

## Manual Refresh Meaning

Manual refresh is stronger demand, not direct provider work.

It can:

- raise scheduler priority
- bypass a recent-success debounce if policy allows
- request backend-owned provider-link hydration
- target a repository or one branch

It cannot:

- bypass deletion
- bypass non-connected vault state
- bypass provider cooldown
- bypass GitHub rate limits
- choose metadata depth
- choose provider parsers

## What This PR Proves

This PR is mergeable only if it proves:

- durable request rows exist
- impossible demand states are unrepresentable
- dashboard sends one trigger, not vault batches
- backend owns dashboard fan-out
- existing-repository connect enqueues source-setup demand
- no caller can select work/depth/provider/priority/dedupe

## What The Workpool Runner PR Proves

This PR should prove:

- queued repository demand executes
- Workpool owns worker start/run/finish
- workers re-check vault state and deletion
- branch discovery updates after existing-repository connect
- Cloudflare preview links hydrate after existing-repository connect
- dashboard freshness no longer depends on frontend refresh loops
- status remains clear enough for the dashboard

Deliberate limits:

- one repository refresh Workpool
- no Workpool retries yet
- no retry counters on queued rows
- expired running leases fail the stale owner; the next demand creates fresh work
- internal post-write refresh chooses an explicit repository/branch target
- branch/file-view refresh stays on the existing direct path in this PR
- provider-link enrichment stays out of request rows
- passive dashboard refresh still avoids repo-wide preview-comment backfills for large repos

## Non-Goals

- Workflow per refresh
- one Workpool per user/vault/branch
- user-configurable plugins
- caller-selected refresh depth
- caller-selected provider parsing
- dashboard query rewrite before queue pressure is proven
- self-hosted execution in this PR
