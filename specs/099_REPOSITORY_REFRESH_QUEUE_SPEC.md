# Repository Refresh Queue Spec

## Document Control

- Status: Draft implementation plan for review
- Owner: dashboard reload, GitHub sync, branch cache freshness
- Created: 2026-05-11
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `specs/079_DASHBOARD_UPDATED_STATUS_MANUAL_REFRESH_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`
  - `research/2026-05-09-dashboard-reload-sync-workpool-research.md`

## Contract

Frontend reports freshness demand.

Backend owns refresh supply:

- exact steps
- depth
- priority
- `notBefore`
- cooldowns
- provider/comment parsing
- Workpool fan-out

Persist demand, not old frontend refresh mechanics.

## State Model

Start here. Convex validators must encode this shape.

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

type RepositoryRefreshDemand =
  | RepositoryScopeRefreshDemand
  | BranchScopeRefreshDemand;

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

type RepositoryRefreshLifecycle =
  | {
      state: "queued";
      notBefore: number;
      queuedAt: number;
    }
  | {
      state: "running";
      attempt: number;
      startedAt: number;
      workpoolJobId: string;
    }
  | {
      state: "succeeded";
      attempt: number;
      startedAt: number;
      completedAt: number;
      result: RepositoryRefreshResult;
    }
  | {
      state: "failed";
      attempt: number;
      startedAt: number;
      failedAt: number;
      failure: RepositoryRefreshFailure;
    }
  | {
      state: "canceled";
      canceledAt: number;
      reason: RepositoryRefreshCancelReason;
    };

type RepositoryRefreshResult =
  | {
      kind: "no_work_needed";
    }
  | {
      kind: "refreshed";
      refreshedAt: number;
    };

type RepositoryRefreshFailure =
  | {
      kind: "rate_limited";
      retryAfter: number;
      message: string;
    }
  | {
      kind: "provider_error";
      cooldownUntil: number;
      message: string;
    };

type RepositoryRefreshCancelReason =
  | "superseded"
  | "vault_deleting"
  | "vault_deleted";
```

Schema rules:

- no `work` field on request rows
- no caller-provided provider parser
- no caller-provided metadata depth
- no caller-provided ahead/behind setting
- no caller-provided `priority`
- no caller-provided `dedupeKey`
- no repository demand with `branch`
- no branch demand without `branch`
- no dashboard branch fan-out
- no `source_setup` without `runId`
- no `queued` row with `workpoolJobId`
- no `succeeded` row without result
- build rows through constructors only

## Backend Execution Policy

Demand may later expand into internal steps:

```ts
type RepositoryRefreshStep =
  | "discover_branches"
  | "sync_pull_requests"
  | "sync_branch_tree"
  | "sync_provider_links";
```

Steps are not Phase 1 persisted request state.

Examples:

- repository demand may run branch discovery and PR metadata
- branch demand may run tree refresh and provider-link refresh
- provider-link refresh may parse Cloudflare Pages comments today
- another provider parser should add an internal handler later

Do not model these as frontend request choices.

## State Matrix Rules

Only multiply dependent axes. If execution steps are backend policy, do not
matrix `source × step`; that would make callers own steps again.

Current dependency edges:

```txt
scope -> allowed source
source -> scheduler priority
scope -> dedupe key shape
lifecycle.state -> lifecycle fields
result.kind -> result fields
failure.kind -> failure fields
```

`scope -> allowed source`:

| Scope        | Sources                                 | User story                              |
| ------------ | --------------------------------------- | --------------------------------------- |
| `repository` | `dashboard`, `manual`, `source_setup`   | vault-level freshness, branch discovery |
| `branch`     | `file_view`, `manual`, `commit`, `pull` | one branch needs freshness              |

`source -> scheduler priority`:

| Source         | Priority     | Stored? |
| -------------- | ------------ | ------- |
| `dashboard`    | `background` | no      |
| `manual`       | `manual`     | no      |
| `source_setup` | `system`     | no      |
| `file_view`    | `normal`     | no      |
| `commit`       | `system`     | no      |
| `pull`         | `system`     | no      |

`scope -> dedupe key shape`:

| Scope        | Key shape                              |
| ------------ | -------------------------------------- |
| `repository` | `user:{id}:vault:{id}:repository`      |
| `branch`     | `user:{id}:vault:{id}:branch:{branch}` |

`lifecycle.state -> lifecycle fields`:

| State       | Fields                                          |
| ----------- | ----------------------------------------------- |
| `queued`    | `notBefore`, `queuedAt`                         |
| `running`   | `attempt`, `startedAt`, `workpoolJobId`         |
| `succeeded` | `attempt`, `startedAt`, `completedAt`, `result` |
| `failed`    | `attempt`, `startedAt`, `failedAt`, `failure`   |
| `canceled`  | `canceledAt`, `reason`                          |

Tests should enumerate these edges with small matrices. When a forbidden state
is still representable, simplify the state shape first; add runtime guards only
when the rule depends on live database/provider/time facts.

## Phase 1: Schema And Constructors

Add:

- `repositoryRefreshRequests` table
- demand validators
- `makeRepositoryRefreshRequest`
- dedupe-key derivation from demand scope
- scheduler priority derivation from demand source
- lifecycle transition helpers

Do not:

- call Workpool
- change dashboard behavior
- call GitHub
- encode exact work/depth/provider parsing in request rows

Tests:

- constructors produce valid demand rows
- repository demand cannot carry branch state
- branch demand requires branch
- source setup requires run id
- dedupe key is derived
- priority is derived, not stored
- state matrices cover dependent axes only
- invalid lifecycle transitions fail

## Phase 2: Demand Ingest

Add enqueue mutations/actions.

Entry points:

- dashboard auto-refresh batch
- dashboard manual refresh if small
- existing-repository connection finish

Behavior:

- authenticate user
- load vault
- block if deleting
- build typed demand
- coalesce by dedupe key
- return request status

Accepted enqueue policy:

- backend computes `notBefore`; callers do not pass it
- Phase 2 created/updated rows use `notBefore = now`
- active means `queued` or `running`
- there should be one active row per `userId + dedupeKey`
- terminal rows are history; a new matching demand creates a new row
- running rows are reused unchanged
- queued rows are updated only when incoming demand has stronger priority
- queued-row upgrades replace `demand`, set `lifecycle.notBefore = now`, set
  `updatedAt = now`, and preserve `createdAt` plus `lifecycle.queuedAt`
- weaker or equal queued duplicates return the existing queued row without a
  write
- deletion returns `blocked`; do not create a canceled request row for work that
  should never run

Priority strength:

```txt
system > manual > normal > background
```

Return shape:

```ts
type EnqueueRepositoryRefreshResult =
  | {
      kind: "created";
      requestId: Id<"repositoryRefreshRequests">;
    }
  | {
      kind: "updated";
      requestId: Id<"repositoryRefreshRequests">;
    }
  | {
      kind: "already_queued";
      requestId: Id<"repositoryRefreshRequests">;
    }
  | {
      kind: "already_running";
      requestId: Id<"repositoryRefreshRequests">;
    }
  | {
      kind: "blocked";
      reason: "vault_deleting";
    };
```

Implementation shape:

- one shared enqueue helper owns all coalescing
- public/browser entry points build demand, then call the helper
- backend setup entry points build demand, then call the helper
- do not duplicate active-row lookup rules in each entry point

Implemented shape:

- `repositoryRefresh.enqueueDashboardRepositoryRefresh`
  - accepts up to 50 `vaultIds`
  - deduplicates repeated ids inside one batch
- `repositoryRefresh.enqueueManualRepositoryRefresh`
- `repositoryRefresh.enqueueSourceSetupRepositoryRefresh`
- active lookup uses `userId + dedupeKey + lifecycle.state`
- dashboard still runs the current GitHub refresh action until Phase 3 has a
  worker
- existing-repository finish enqueues `source_setup`

Do not:

- execute refresh work yet
- expose exact step/depth choices to callers
- remove direct file-view refresh
- redesign dashboard query

## Phase 3: Repository Worker

Add one Workpool worker for repository demand.

Behavior:

- re-read request
- re-check vault/deletion gate
- choose internal repository steps
- run repository metadata sync
- update `vaultRemoteBranches`
- finish request
- preserve current vault refresh UI fields

This phase fixes:

- dashboard auto metadata freshness
- existing-repository connect branch-list visibility after setup

Do not:

- refresh every branch tree unless policy explicitly chooses it
- expose provider choices to frontend
- move file view yet

## Phase 4: Manual Priority

Manual refresh becomes queued priority demand.

Rules:

- can raise scheduling priority
- can ask backend policy for deeper freshness
- cannot bypass deletion
- cannot bypass provider cooldown
- cannot bypass GitHub rate limit
- must coalesce with identical running demand

## Phase 5: Branch Demand Worker

Add worker behavior for branch demand.

Entry points:

- file view page load / visibility
- manual branch refresh
- commit/pull if clearer than direct cache warming

Rules:

- branch is required by schema
- one branch per demand row
- repository demand does not imply every branch refresh
- backend chooses tree/provider-link steps

## Later

Possible after queue proves useful:

- move high-churn refresh status off `vaults`
- add dashboard summary rows
- add backlog/latency observability
- package execution for another Convex deployment
- add a second provider-link parser, such as Netlify comments

These do not change Phase 1-3 scope.

## Non-Goals

- one Workpool per user/vault/branch
- Workflow per refresh
- user-configurable plugins
- generic provider framework
- caller-selected refresh depth
- caller-selected provider parsing
- dashboard query rewrite before the queue proves pressure
- self-hosted execution in the first implementation

## Review Order

Review in this order:

1. state model
2. impossible states
3. phase boundaries
4. entry points
5. Workpool usage
6. future pressure
