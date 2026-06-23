# Repository Refresh Queue Spec

## Document Control

- Status: Accepted current implementation plan
- Owner: dashboard reload, GitHub sync, branch cache freshness
- Created: 2026-05-11
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `archive/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `archive/079_DASHBOARD_UPDATED_STATUS_MANUAL_REFRESH_SPEC.md`
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

Browser activation events collapse before demand reaches Convex. Route load, Page Visibility
resumes, window focus, and future browser activation edges all mean the same thing to the backend:
the user is looking at a surface and wants it fresh if policy allows. Durable demand must not
preserve `page_load`, `visibility`, `focus`, or a one-value replacement like `surface_active` as
trigger fields. The demand `source` is the product-level trigger.

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

type RepositoryRefreshDemand = RepositoryScopeRefreshDemand | BranchScopeRefreshDemand;

type RepositoryScopeRefreshDemand =
  | {
      scope: "repository";
      source: "dashboard";
    }
  | {
      scope: "repository";
      source: "manual";
    }
  | {
      scope: "repository";
      source: "source_setup";
      runId: Id<"appProvisioningRuns">;
    };

type BranchScopeRefreshDemand =
  | {
      scope: "branch";
      branch: string;
      source: "file_view";
    }
  | {
      scope: "branch";
      branch: string;
      source: "manual";
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
      state: "scheduled";
      notBefore: number;
      queuedAt: number;
      scheduledAt: number;
      workpoolJobId: string;
    }
  | {
      state: "running";
      startedAt: number;
      leaseExpiresAt: number;
      workpoolJobId: string;
    }
  | {
      state: "succeeded";
      startedAt: number;
      completedAt: number;
      result: RepositoryRefreshResult;
    }
  | {
      state: "failed";
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
  | "worker_canceled"
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
- no user or vault prefix inside `dedupeKey`; row fields and indexes already carry `userId` and
  `vaultId`
- no repository demand with `branch`
- no branch demand without `branch`
- no dashboard branch fan-out
- no `source_setup` without `runId`
- no `queued` row with `workpoolJobId`
- no `scheduled` row with `leaseExpiresAt`
- no `running` row without `leaseExpiresAt`
- no `succeeded` row without result
- build rows through constructors only
- no `attempt` field while Workpool retries are disabled; add a real retry model only when retries
  ship
- no durable browser trigger values for `page_load`, `visibility`, `focus`, or `surface_active`;
  frontend browser events map to the entry point/source
- no manual trigger value such as `dashboard_status_click`; `source: "manual"` plus `scope` is
  enough
- no mirrored `source_setup.mode`; keep setup mode on the provisioning run and reference it by
  `runId`
- no result timestamp separate from `lifecycle.completedAt`

## Backend Execution Policy

Demand may later expand into internal steps:

```ts
type RepositoryRefreshStep =
  | "discover_branches"
  | "sync_pull_requests"
  | "sync_branch_tree"
  | "sync_provider_links";
```

Steps are not persisted request state in this target.

Examples:

- repository demand may run branch discovery and PR metadata
- branch demand may run tree refresh and provider-link refresh
- provider-link refresh may parse Cloudflare Pages comments today
- another provider parser should add an internal handler later

Do not model these as frontend request choices.

## State Matrix Rules

Only multiply dependent axes. If execution steps are backend policy, do not matrix `source × step`;
that would make callers own steps again.

Current dependency edges:

```txt
scope -> allowed source
source -> scheduler priority
scope -> dedupe key shape
lifecycle.state -> lifecycle fields
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

| Scope        | Key shape         |
| ------------ | ----------------- |
| `repository` | `repository`      |
| `branch`     | `branch:{branch}` |

`lifecycle.state -> lifecycle fields`:

| State       | Fields                                                  |
| ----------- | ------------------------------------------------------- |
| `queued`    | `notBefore`, `queuedAt`                                 |
| `scheduled` | `notBefore`, `queuedAt`, `scheduledAt`, `workpoolJobId` |
| `running`   | `startedAt`, `leaseExpiresAt`, `workpoolJobId`          |
| `succeeded` | `startedAt`, `completedAt`, `result`                    |
| `failed`    | `startedAt`, `failedAt`, `failure`                      |
| `canceled`  | `canceledAt`, `reason`                                  |

Tests should enumerate these edges with small matrices. When a forbidden state is still
representable, simplify the state shape first; add runtime guards only when the rule depends on live
database/provider/time facts.

## Target: State And Constructors

Add:

- `repositoryRefreshRequests` table
- demand validators
- `makeRepositoryRefreshRequest`
- dedupe-key derivation from demand scope
- scheduler priority derivation from demand source
- lifecycle transition helpers

This slice did not:

- call Workpool
- change dashboard behavior
- call GitHub
- encode exact work/depth/provider parsing in request rows

Tests:

- constructors produce valid demand rows
- repository demand cannot carry branch state
- branch demand requires branch
- source setup requires run id
- source setup does not mirror run mode into refresh demand
- passive and manual demand rows do not store one-value trigger fields
- dedupe key is derived
- priority is derived, not stored
- state matrices cover dependent axes only
- invalid lifecycle transitions fail

## Target: Demand Ingest

Add enqueue mutations/actions.

Entry points:

- dashboard auto-refresh signal
- dashboard manual refresh
- existing-repository connection finish

Behavior:

- authenticate user
- dashboard entry point accepts no caller-selected work or trigger fields and no arguments:

```ts
enqueueDashboardRepositoryRefresh();
```

- dashboard entry point selects connected, non-deleting vaults for the authenticated user in bounded
  backend pages
- dashboard pagination is internal Convex state only
- route load, Page Visibility, and window focus are frontend event sources only; the browser never
  passes the event subtype to Convex
- browser never passes `vaultIds`
- browser never passes cursor
- browser never loops pages
- manual entry point loads one requested vault and blocks if deleting
- source setup entry point validates the provisioning run and stores only the `runId`; setup mode
  stays on that run
- build typed demand
- coalesce by dedupe key
- dashboard signal returns `null`; explicit one-vault/setup entry points return enqueue status

Accepted enqueue policy:

- backend computes `notBefore`; callers do not pass it
- initial created/updated rows use `notBefore = now`
- active means `queued`, `scheduled`, or `running`
- there should be one active row per `userId + vaultId + dedupeKey`
- terminal rows are history; a new matching demand creates a new row
- Workpool job creation transitions `queued -> scheduled`
- worker start transitions `scheduled -> running`
- running leases start only when worker code starts
- running rows are reused only while the lease is valid
- queued rows are updated only when incoming demand has stronger priority
- scheduled rows are updated only when incoming demand has stronger priority
- scheduled-row upgrades replace `demand`, set `lifecycle.notBefore = now`, set `updatedAt = now`,
  and preserve `workpoolJobId`, `createdAt`, `lifecycle.queuedAt`, and `lifecycle.scheduledAt`
- queued-row upgrades replace `demand`, set `lifecycle.notBefore = now`, set `updatedAt = now`, and
  preserve `createdAt` plus `lifecycle.queuedAt`
- weaker or equal queued/scheduled duplicates return the existing row without a write
- deletion/non-connected vault state returns `blocked`; do not create a canceled request row for
  work that should never run

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
      kind: "already_scheduled";
      requestId: Id<"repositoryRefreshRequests">;
    }
  | {
      kind: "already_running";
      requestId: Id<"repositoryRefreshRequests">;
    }
  | {
      kind: "blocked";
      reason: "vault_deleting" | "vault_not_connected";
    };
```

Implementation shape:

- one shared enqueue helper owns all coalescing
- public/browser entry points build the one matching source demand, then call backend helpers
- backend setup entry points build demand, then call the helper
- do not duplicate active-row lookup rules in each entry point

Target shape:

- `repositoryRefresh.enqueueDashboardRepositoryRefresh`
  - accepts no args
  - caller does not pass `vaultIds`
  - caller does not pass cursor
  - returns `null`
  - converts the first bounded vault page into repository demand
  - schedules `repositoryRefresh.enqueueDashboardRepositoryRefreshPage` when more vaults remain
- `repositoryRefresh.enqueueDashboardRepositoryRefreshPage`
  - internal mutation only
  - accepts `userId` and internal cursor
  - converts one bounded page into repository demand
  - schedules itself until the backend reaches the end
- `repositoryRefresh.enqueueManualRepositoryRefresh`
- `repositoryRefresh.enqueueSourceSetupRepositoryRefresh`
  - validates `appProvisioningRuns.trigger`
  - rejects mismatched run/user/vault state
  - rejects runs that have not reached `succeeded`
  - rejects retry runs because retry runs do not define new setup refresh demand
- `repositoryRefresh.completeExistingRepositoryConnectionAndEnqueueRefresh`
  - marks the existing-repository run `succeeded`
  - writes the finish event
  - enqueues source-setup demand in the same mutation
- active coalescing identity is `userId + vaultId + dedupeKey`; `lifecycle.state` may be used only
  to scan/filter active rows or terminal rows, not to define a different active row identity
- existing-repository finish enqueues `source_setup`

Do not:

- expose dashboard fan-out, batch size, or pagination to React
- expose exact step/depth choices to callers
- execute branch-scoped queued rows yet
- remove direct file-view refresh
- redesign dashboard query

## Target: Workpool Runner

Execute queued repository demand through one backend Workpool.

Behavior:

- install `repositoryRefreshWorkpool`
- enqueue repository-scoped rows into Workpool from backend mutations
- transition queued rows to `scheduled` with `workpoolJobId`
- re-read request when the worker starts
- transition scheduled rows to `running` with `leaseExpiresAt` when worker code starts
- re-check vault/deletion gate when the worker starts
- cancel scheduled/running work if the vault was deleted or started deleting
- fail scheduled/running work if the vault is no longer connected
- refresh the lease after worker start
- choose internal repository steps from demand source
- call the internal GitHub refresh action with `scope: "repository"` and backend-selected args
- `dashboard` demand requests branch/PR metadata and may request PR check snapshots subject to the
  backend large-repo budget
- `manual` and `source_setup` demand request PR check snapshots from backend policy, not from
  caller-provided provider/depth fields
- current snapshot target policy is broad: `pullRequestCheckBranchNames: []` means all remote
  branches; branches without PRs clear cached snapshots locally, branches with PRs read GitHub check
  runs and commit statuses for their PR head SHA
- passive `dashboard` demand uses one backend passive refresh policy; demand does not preserve
  route-load, Page Visibility, or window-focus distinctions
- `source_setup` uses distinct backend execution policy so the one-time create/connect finish path
  does not inherit passive dashboard large-repo caps
- update `vaultRemoteBranches` through the existing metadata sync path
- refresh the default branch tree when backend policy requires it
- finish the request as `succeeded`, `failed`, or `canceled`
- Workpool `canceled` completion marks `worker_canceled`
- public direct branch refresh accepts `vaultId` plus required branch/options, validates
  `userId + vaultId`, then derives repository coordinates from the vault and calls the same internal
  helper with `scope: "branch"`
- internal post-write refresh uses explicit `target: { scope: "repository" }` or
  `target: { scope: "branch"; branch: string }`; no optional branch fallback
- keep file-view branch refresh on the existing direct action until the branch demand worker moves
  it

Deferred:

- targeted preview-link hydration for a subset of branches after passive dashboard refresh
- bounded preview-link hydration for `source_setup` and manual repository refresh; current behavior
  is correct structurally but too broad for large repos

Retry policy:

- Workpool retries are off in this first runner.
- Provider failures become terminal request failures.
- Existing vault cooldown fields decide when later demand may make another row.
- No retry counters are added to request state.
- If a running lease expires, the next matching demand fails the stale owner and creates or upgrades
  fresh work.

Dashboard cleanup:

- dashboard route load, Page Visibility resume, and window focus send the same backend demand signal
- dashboard manual refresh sends one vault-level demand
- React does not loop vaults, batch ids, choose depth, or call GitHub directly

This target fixes:

- dashboard auto metadata freshness
- existing-repository connect branch-list display after setup
- existing-repository connect PR check snapshot display after setup

Do not:

- refresh every branch tree unless policy explicitly chooses it
- expose provider choices to frontend
- move file view yet

## Target: Frontend Refresh Cleanup

Remove dashboard-era refresh mechanics that duplicate backend ownership.

Rules:

- dashboard route emits the same demand when the surface becomes active from route load, Page
  Visibility resume, or window focus
- dashboard route does not wait for `vaults` before emitting demand
- backend treats "no connected vaults" as an empty dashboard demand page
- manual dashboard refresh sends only `{ vaultId }`
- a small dashboard demand hook owns the queue mutations
- React may listen to multiple browser events, but it does not pass browser event subtype to Convex
- React may use a small local duplicate-request guard for browser event storms; durable freshness
  debounce, cooldown, pagination, and scheduling stay in Convex
- React does not import the GitHub refresh action for dashboard freshness
- React does not batch, paginate, or loop dashboard repository refresh
- React does not compute dashboard metadata staleness or missing preview-link policy before sending
  demand
- React does not choose ahead/behind, PR metadata, provider links, or target branches
- React renders PR check snapshot summaries from Convex query data; it does not keep Cloudflare
  preview-link rendering helpers or frontend hydration-target selection helpers
- dashboard naming should say "refresh demand", not "tree refresh", unless it calls direct tree
  refresh code
- file-view direct refresh keeps a branch-scoped debounce key; no branchless refresh bucket remains
- direct GitHub tree refresh uses passive or manual action intent; the old repository-tree
  `page_load`, `visibility`, and `focus` trigger contract is gone
- direct GitHub tree refresh accepts vault, branch, and action intent from React; the public action
  owns ahead/behind, PR metadata, and provider-link depth
- generic frontend duplicate-request guards live in `refreshDebounce`, not a dashboard/tree-refresh
  named module

Keep:

- file-view branch refresh on direct `github.refreshRepositoryTree`
- draft-PR branch hydration on direct `github.refreshRepositoryTree`
- Cloudflare MCP token health polling; it is provider auth maintenance, not repository freshness
- provider OAuth popup reload; it is connection-state recovery, not repository freshness

This cleanup proves:

- dashboard freshness is a route-level demand signal
- frontend has no vault-list gate before dashboard demand
- dashboard repository-refresh code has names matching the queue contract
- no file-view branch behavior moves before the branch-demand worker

## Target: Basic Manual Priority

Manual repository refresh is queued demand with `manual` priority.

Current policy:

- repository manual refresh requests PR check snapshots
- provider choice stays backend-owned

Still later:

- branch-level manual refresh
- explicit provider cooldown bypass rules if the product needs them

## Later: Branch Demand Worker

Add worker behavior for branch demand.

Entry points:

- file view surface activation
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

These do not change the current refresh queue target.

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
3. PR boundaries
4. entry points
5. Workpool usage
6. future pressure
