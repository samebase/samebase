# Dashboard Sync And Reload Systems Research

## Document Control

- Status: Draft research
- Owner: Noter dashboard, source setup, GitHub refresh, and reload flows
- Created: 2026-05-09
- Related specs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `specs/079_DASHBOARD_UPDATED_STATUS_MANUAL_REFRESH_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
- Related research:
  - `research/2026-05-02-workpool-refresh-and-tenant-compute.md`
  - `research/2026-05-06-vault-first-provisioning-model.md`
  - `research/2026-05-08-existing-repository-workflow-onboarding.md`

## Prompt

Specs 096 and 097 moved new Noter-managed vault creation and existing GitHub
repository onboarding onto durable Convex Workflow-backed setup. Before
designing the next fix for dashboard reload/sync behavior, research the moving
systems already in place: source setup, provider setup, branch/tree syncing,
dashboard refresh decisions, file-route refresh decisions, cache behavior,
browser reloads, and possible Workpool boundaries.

This research treats code and accepted specs in this branch as source of truth.
The unmerged vault-deletion workflow branch was checked only as a future caveat:
after it lands, the main expected change is a deletion gate that refresh and
repo-backed writers must honor. It should not change the basic refresh queue
shape.

## Current Finding

Noter now has two different backend orchestration layers:

1. Source/provider setup is durable and run-backed. New app creation and
   existing repository connection create a vault plus `appProvisioningRuns` row,
   start Convex Workflow, append `appProvisioningEvents`, and let the dashboard
   derive `sourceSetup` and `providerSetup` summaries.
2. Repository reload/freshness is still client-triggered. The dashboard and file
   view call `api.github.refreshRepositoryTree` from React effects and click
   handlers. The backend provides a shared vault-level lock, debounce, cooldown,
   branch cache updates, and metadata sync, but it does not own a durable
   request/job model.

The dashboard reload issue should probably go lower than Workflow at first. Most
reload work is one-shot idempotent GitHub fetch plus Convex cache update, not a
long-lived multi-step operation with sleeps or external events. A
Workpool-backed refresh queue is the better fit after a durable request table
proves the job contract. Workflow remains the better primitive for source setup,
provider setup, deletion, and any later refresh flow that waits on provider
callbacks or has restartable named steps.

The practical current risk is not that refresh is completely unguarded. It is
that clients still decide when refresh work exists and how much fanout to
request. Multiple tabs can converge through backend claim/cooldown, but there is
no single durable backend record that says "this vault/branch refresh was
requested, queued, running, skipped, failed, or completed."

That durable record should also be the first product/billing boundary. Reload is
paid compute, even when a free plan still receives eventual refresh. A free user
with many vaults or branches may need slower claim windows, lower active refresh
slots, or smaller monthly/daily refresh budgets. A paid user may get faster
interactive claims and larger background budgets. This points toward logical
per-user queues from the first request-table design, even if the underlying
Workpool topology stays shared at first.

## Vocabulary

This codebase uses several "reload" meanings:

1. Browser reload: `window.location.reload()` or app boot recovery. This is not
   a repository freshness mechanism and should not be reintroduced for sync.
2. Repository refresh: GitHub metadata and branch tree cache refreshes through
   `api.github.refreshRepositoryTree`.
3. Source setup: the first usable default-branch tree for a newly created or
   newly connected vault.
4. Provider setup: Convex and Cloudflare provisioning after a Noter-managed
   vault has connected GitHub identity and usable source tree.
5. Codespace reload/rebuild: Codespace iframe and backend Codespace flows. One
   legacy Codespaces-first vault path still writes an empty tree placeholder.

## Accepted Spec Context

Spec 096 changed the vault model from "vault exists only after GitHub source
setup succeeds" to "vault can exist before GitHub is connected." The invariant
is that repo-backed behavior must still fail closed unless the vault has
connected GitHub state.

Spec 097 applied the same model to existing repository onboarding. Connecting an
existing repository now queues a visible vault/run first, then Workflow fetches
GitHub repo metadata, connects durable GitHub identity, syncs the initial tree,
and finishes.

The key source-state rule from both specs is: connected GitHub identity is
absorbing. A post-connect tree sync failure should not move the vault back to
top-level `failed`. It should remain connected and show source setup failure
from the run/events until the first usable tree exists.

## Data Model Map

`vaults` is the durable app container:

1. `state` is GitHub source-workspace state: `not_connected`, `provisioning`,
   `connected`, or `failed`.
2. `githubMode` distinguishes `create_repository` from
   `connect_existing_repository` for provisioning, connected, and failed states.
3. Connected variants store `runId`, immutable `ghRepoId`, `owner`, `name`,
   `visibility`, `defaultBranch`, provider states, and `connectedAt`.
4. The row still carries operational refresh fields: `lastTreeRefreshAt`,
   `treeRefreshStartedAt`, `lastTreeRefreshFailedAt`, `treeRefreshFailureKind`,
   `treeRefreshFailureMessage`, and `treeRefreshCooldownUntil`.

`vaultBranchTrees` is the branch-scoped source cache:

1. one row per `vaultId + branch`
2. stores `treeSHA`, optional `commitSHA`, full GitHub tree data,
   `lastTreeRefreshAt`, and optional `treeRefreshStartedAt`
3. current refresh claiming still uses the vault-level operational fields, not
   the per-branch `treeRefreshStartedAt`

`vaultRemoteBranches` is repository metadata:

1. branch name, head commit, default/protected flags, active/deleted-upstream
   state, and last sync time
2. optional last commit timestamps, ahead/behind counts, PR metadata, and
   Cloudflare preview metadata
3. dashboard branch rows and file-route branch resolution depend on this table

`appProvisioningRuns` and `appProvisioningEvents` are the setup log:

1. runs are vault-owned and have trigger `create`,
   `connect_existing_repository`, or `retry`
2. steps include source setup steps (`initialize_vault`, `validate_connections`,
   `create_github_repo`, `fetch_github_repo`, `connect_github`, `seed_starter`,
   `sync_tree`) and provider steps
3. events are user-safe messages linked by `runId` and `vaultId`

`vaultInfrastructure` and `vaultInfrastructureOwnership` support provider work:

1. `vaultInfrastructure` stores provider resource identifiers and operational
   status
2. `vaultInfrastructureOwnership` records the latest Workflow run allowed to
   write provider state for a vault
3. product-facing provider readiness is moving toward `vault.convex` and
   `vault.cloudflare`, not the old aggregate `infraState`

Other vault-scoped tables affected by reload/delete/source behavior include
`fileStaging`, `blobs`, `folderExpansionState`, `vaultDomains`, `codespaces`,
`agentGraphNodeLayout`, `agentThreadContext`, `aiProdAccessRequests`, and
`collaborativeUpdates`.

## Source Setup Workflows

The create-new-app action is now a queueing action:

1. `vaultActions.createRepository` authenticates, validates local input, checks
   GitHub connection presence, inserts an initializing vault/run through
   `internal.vault.createInitializingNoterManagedVaultForUser`, then starts
   `appProvisioningWorkflow.provisionApp`.
2. `provisionApp` validates provider connections, creates GitHub repository,
   connects the vault to GitHub, seeds the starter repo, syncs the initial tree,
   claims infrastructure ownership, provisions Convex and Cloudflare, and
   finishes.
3. `seed_starter` and `sync_tree` have idempotent retry policy. GitHub
   repository creation does not.

The existing-repository action follows the same shape:

1. `vaultActions.connectRepository` parses `owner/name`, checks GitHub
   connection presence, inserts an initializing existing-repository vault/run
   through `internal.vault.createInitializingExistingRepositoryVaultForUser`,
   then starts `appProvisioningWorkflow.connectExistingRepository`.
2. `connectExistingRepository` validates the connection, fetches repo/default
   branch metadata, connects the vault to GitHub, syncs the default branch tree,
   and appends the finish event.
3. Existing repositories leave `convex` and `cloudflare` as `not_configured`,
   and provider setup stays `not_applicable`.

Workflow completion is centralized through `handleProvisioningWorkflowComplete`.
On failure, it calls `infraProvisioning.markWorkflowProvisioningFailed`, which:

1. moves pre-GitHub provisioning vaults to top-level failed state
2. preserves connected GitHub identity for post-connect source setup failures
3. writes provider-specific failed state for infrastructure failures
4. records a user-safe error event

## Dashboard Query And Rendering

`vault.getUserVaults` is the dashboard query. It currently:

1. reads all vaults for the user
2. returns provisioning/failed pre-GitHub vaults as non-ready cards with empty
   branch lists
3. returns connected vaults with default branch tree status, staging counts,
   branch rows, provider dashboard links, and setup summaries
4. sorts by last edit time when present, otherwise vault creation time

Dashboard card readiness is still a broad legacy bucket:

1. `copying_files`
2. `ready`
3. `failed`

The more precise state is in the required summaries:

1. `sourceSetup`
   - `ready` when the default branch has a usable `vaultBranchTrees` row
   - `running` when the establishing run is queued/running and no usable tree
     exists
   - `failed` when the establishing run failed and no usable tree exists
   - `not_applicable` when setup does not apply or when the run is terminal but
     no failure/ready state is derivable
2. `providerSetup`
   - only applies to Noter-managed connected vaults with a usable source tree
   - reads `vault.convex`, `vault.cloudflare`, active infrastructure ownership,
     and the relevant run/events

The card renderer:

1. shows source setup sections for non-ready cards with running/failed
   `sourceSetup`
2. shows provider setup sections for ready Noter-managed cards with
   running/failed `providerSetup`
3. hides branch lists and repo-backed controls until the card is ready
4. uses `VaultProvisioningLogTextarea`, which subscribes to
   `appProvisioningEvents.listForVault`

Important dashboard reload caveat: the dashboard uses `useCacheQuery` for
`api.vault.getUserVaults`. This hook hydrates memory/IndexedDB cached data and
then replaces it when live Convex data arrives. That improves perceived load,
but it means first paint can show stale cached vault rows until the live query
settles.

## Dashboard Refresh Triggering

Dashboard GitHub refresh lives in `VaultDashboardRepositoryRefresh.ts`.

Automatic dashboard refresh:

1. runs when vault data is visible on initial page load
2. runs again when the document becomes visible
3. filters to `vault.state === "ready"`
4. skips vaults in active cooldown
5. calls `shouldAutoRefreshVault`
6. uses tab-local `claimRefreshDebounce("dashboard", repositoryFullName)`
7. batches refresh calls with `DASHBOARD_REFRESH_CONCURRENCY = 3`
8. calls `api.github.refreshRepositoryTree`

Manual dashboard refresh:

1. clicking the "Updated ..." status calls the same refresh action
2. it respects the same dashboard debounce bucket and cooldown state
3. it requests targeted Cloudflare preview hydration when branch rows are
   missing cached preview metadata

This means dashboard auto-refresh is controlled by React effects, browser
visibility, and per-tab memory. Backend state prevents a lot of duplicate work,
but no durable dashboard refresh request exists.

## File View Refresh Triggering

`FileView` has a separate refresh path:

1. `api.vault.getVaultByRepository` is intentionally called through live
   `useQuery`, not `useCacheQuery`, to avoid cached null causing a false route
   handoff
2. if the repo is unconnected, the route renders `RepositoryRouteConnectState`
3. clicking connect queues the existing-repository workflow and navigates to the
   dashboard through `queueExistingRepositoryAndNavigateToDashboard`
4. if the vault is connected but has no branch tree, the route renders
   `FileViewRepositorySetupState`
5. if a tree exists, the file view renders the editor

Automatic file-view refresh:

1. runs on initial visible load and on visibility resume
2. uses tab-local `claimRefreshDebounce("file_view", owner/repo/branch)`
3. calls `api.github.refreshRepositoryTree` with the active branch,
   `includeAheadBehind: true`, and `includePullRequestLinks: true`

Manual or workflow-like file-view refreshes also happen after draft PR creation,
pull/rebase paths, and commit paths. Those are not dashboard fanout, but they
share the same backend GitHub cooldown and tree cache machinery.

## GitHub Refresh Backend

`api.github.refreshRepositoryTree` is the main public refresh action.

The action:

1. authenticates the user
2. resolves a connected vault through `internal.vault.getByRepositoryFullName`
3. computes whether metadata sync and/or branch tree refresh is needed
4. claims the vault-level refresh lock through `internal.vault.claimTreeRefresh`
5. optionally runs `internal.github.syncRepositoryMetadata`
6. re-reads the vault after metadata sync because branch resolution may change
7. optionally runs `internal.github.refreshBranchTree`
8. releases the lock on success
9. records failure/cooldown on error

`claimTreeRefresh` is vault-level:

1. skips active cooldown unless forced
2. skips recent successful refresh unless the caller opted out
3. skips a non-stale in-progress lock
4. patches `vault.treeRefreshStartedAt`

`releaseTreeRefresh`:

1. only releases if the claim timestamp still matches
2. records `lastTreeRefreshAt` when requested
3. clears in-progress/failure state on success unless a newer failure/cooldown
   must be preserved
4. records failure kind, message, and cooldown on failure

`recordTreeRefreshFailure` lets related systems write shared cooldown/failure
without owning the active claim.

`computeRepositoryRefreshPlan` splits the work:

1. metadata sync happens when metadata is stale/missing, the requested branch is
   missing, the trigger demands it, or Cloudflare preview links are requested
2. branch tree refresh happens for the target branch according to trigger and
   branch state
3. page-load gets a shorter debounce than normal tree refresh, and missing
   branch reconfirmation has its own debounce

`syncRepositoryMetadata`:

1. fetches repo/default branch and lists all remote branches
2. optionally enriches branches with last commit timestamps, ahead/behind
   counts, PR links, and Cloudflare preview comment metadata
3. writes `vaultRemoteBranches`
4. marks branches missing upstream as `deleted_upstream`
5. prunes deleted-upstream branch artifacts when no staged changes exist

`refreshBranchTree`:

1. fetches a recursive Git tree for the resolved branch
2. fetches latest commit SHA
3. compares fetched tree/commit with the cached `vaultBranchTrees` row
4. writes only when the cache changed

Commit/check polling joins the same cooldown contract through
`githubChecks.getCommitStatus`. If GitHub check APIs are rate-limited, the
action records a shared tree refresh failure/cooldown on the vault so tree
refreshes and future polls pause together.

## Current Containment That Already Helps

The existing implementation has useful pieces to preserve:

1. repo-level shared cooldown stops immediate repeated GitHub calls after
   failures
2. rate-limit failures become visible in dashboard and file-view sync status
3. branch tree cache is branch-scoped
4. repo metadata freshness is separate from tree freshness
5. dashboard auto-refresh limits concurrent action calls to 3 per batch
6. large auto-refreshes reduce expensive ahead/behind and preview backfills
7. manual refresh respects cooldown instead of bypassing it

These are not throwaway. The next architecture should wrap them with a durable
request/job layer, not rewrite all GitHub fetching at once.

## Gaps And Fragile Boundaries

### Client-Owned Fanout

Dashboard and file view decide when refresh work exists. The backend can reject
or serialize individual refresh attempts, but it cannot show a single durable
request record for all tabs.

This creates gaps:

1. no cross-tab observable queue state
2. no backend-owned priority between dashboard background work and active file
   view work
3. no durable reason a request was skipped
4. no durable backlog, lag, retry, or cancellation state
5. no clean place to add per-user refresh budgets

### Tab-Local Debounce

`treeRefreshDebounce.ts` is a module-local `Map`. It helps one tab, but it is
not shared across tabs, devices, browser restarts, or deployments.

Backend claim/cooldown still protects provider traffic, but duplicate clients
can still produce extra action attempts and noisy logs before the claim rejects
them.

### Vault-Level Lock For Branch Work

The refresh lock is currently vault-level. That is conservative and protects
GitHub rate limits, but it also means one branch refresh can block metadata sync
or another branch refresh for the same vault.

A first Workpool queue can keep the vault-level lock. Branch-level concurrency
should not be added until the request table records enough job shape to prove it
will not increase provider fanout or write contention.

### Dashboard Query Cost

`getUserVaults` collects all user vaults, then for each connected vault reads
staging data, remote branches, and the default branch tree. That is acceptable
for the current single-operator shape, but a backend queue will make dashboard
freshness more visible and may reveal query-size pressure as vault and branch
counts grow.

The dashboard query should stay a subscriber, not the owner of refresh
execution.

### Source Setup Versus Refresh

Initial `sync_tree` inside Workflow writes `vaultBranchTrees` directly. Later
refreshes use `refreshRepositoryTree`. Both touch the same branch tree table,
but only later refreshes use the shared `claimTreeRefresh` lock.

That is currently acceptable because initial setup owns the first usable tree
and the dashboard gates controls until it exists. A future refresh queue should
be careful not to race a still-running source setup Workflow or deletion gate.

### Codespace-First Placeholder Tree

`codespaces/vaultIntegration.ts` still has a legacy `createVaultWithCodespace`
path. It creates an initializing existing-repository vault and connects it, but
then writes a branch tree row with an empty `tree` array as a deliberate
placeholder. The comment says the codespace-first reload path is broken and
should be owned by work-pool refresh later.

Do not count that path as proof that a connected vault has hydrated source
files. It can make `hasUsableDefaultBranchTree` true while the tree data is not
actually usable for file browsing.

### Browser Reloads Are Side Channels

Browser reloads exist for:

1. stale asset boot recovery
2. provider OAuth popup completion in the dashboard
3. auth sign-out

They should not be part of repository freshness. Spec 079 explicitly moved the
dashboard "Updated ..." click away from same-URL reload and toward
`api.github.refreshRepositoryTree`.

### Query Cache First Paint

`useCacheQuery` returns memory/IndexedDB cached query data until live Convex
data resolves. This is useful, but any refresh redesign should assume the
dashboard can briefly render stale cached cards on first paint.

A durable backend refresh request model would make this less confusing because
the live query could include the current request/run state after hydration.

## Workpool Versus Workflow

Workflow is already installed through `apps/noter/convex/convex.config.ts` and
is used for app/source/provider provisioning. The package uses Workpool under
the hood to bound step parallelism.

`@convex-dev/workpool` is installed in `apps/noter/package.json`, but there is
no direct named Workpool component installed in `convex.config.ts` yet.

There are two different design axes:

1. lifecycle primitive: Workflow versus scheduler action versus Workpool work
2. tenant scheduling: user/account queues, budgets, priority, and cost units

The tenant scheduling axis should be modeled in app data, not hidden inside a
specific Workpool topology. That keeps hosted Noter free/paid refresh policy
explicit, and it leaves room for later self-hosted or Convex-component
deployments where the tenant pays for the compute in their own Convex project.

Workpool fits repository reload because:

1. most refresh jobs are one-shot actions
2. the current refresh action is already idempotent-ish: it re-reads state,
   skips if fresh, fetches GitHub, and updates cache rows
3. refresh needs bounded parallelism, durable status, retry/cooldown, and
   onComplete hooks more than restartable named workflow steps
4. Workpool has lower determinism/versioning overhead than Workflow

Workflow fits source/provider/deletion because:

1. those operations have ordered steps users can understand
2. they cross provider boundaries
3. some steps are not safely retryable
4. failures need step-specific summaries and retry/restart semantics
5. they may need future waits, sleeps, external callbacks, or restart from a
   named step

Decision rule:

1. Workpool for bounded execution of independent refresh/cache jobs.
2. Workflow for durable user-visible operations with a lifecycle.
3. Request rows for tenant fairness, plan policy, budget accounting, and
   self-hosted/component portability.

## Recommended Next Architecture

Start with a durable refresh request model before adding Workpool mechanics. The
request model should include logical per-user queue policy from the beginning,
even if every current plan maps to the same limits in the first PR.

### Slice 1: Refresh Requests And Logical Queues

Add a `refreshRequests` table with fields shaped around the existing backend
contract:

1. `userId`
2. `queueKey`, initially user/account scoped
3. `vaultId`
4. optional `branch`
5. `kind`: `repo_metadata`, `branch_tree`, or `combined`
6. `priority`: `interactive`, `visible`, or `background`
7. `trigger`: `manual`, `page_load`, `visibility`, `post_commit`, or `polling`
8. `idempotencyKey`
9. `state`: `queued`, `running`, `succeeded`, `skipped`, `failed`, or `canceled`
10. `costUnits` or an estimated cost bucket
11. `planPriority` or an entitlement snapshot used for claim ordering
12. optional `notBefore` for delayed free/background work
13. timestamps
14. optional skip reason, delay reason, failure kind/message, and work id

Add a companion budget/queue state table only when the first implementation
needs durable counters. The likely shape is user/account scoped: active jobs,
recent cost units, period budget, next refill/reset, and the last claim time.
Avoid hard-coding the queue key to hosted user IDs in a way that would prevent a
future self-hosted component from using deployment, workspace, or account as the
paying subject.

Then add a cheap mutation like `requestRepositoryRefresh` that:

1. authenticates the user
2. checks the vault exists, belongs to the user, is connected, and is not under
   any future deletion gate
3. normalizes branch/kind/trigger
4. computes an idempotency key from user, vault, branch, kind, and a debounce
   bucket
5. assigns queue key, priority, cost estimate, entitlement snapshot, and
   optional `notBefore`
6. inserts or updates the request
7. schedules execution with `ctx.scheduler.runAfter(0, ...)` for the first PR

This first slice can keep the existing `refreshRepositoryTree` action as the
runner. The point is to prove request semantics, logical queue semantics, and UI
subscription shape before choosing component topology.

### Slice 2: Move Automatic Clients To Request Mutation

Update dashboard and file view automatic refresh paths:

1. keep React visibility/page-load effects as hints
2. replace direct `api.github.refreshRepositoryTree` calls with
   `requestRepositoryRefresh`
3. let the backend decide whether the request is queued, skipped, or merged with
   an existing request
4. keep manual explicit refresh wired to the higher-priority request path

The UI should subscribe to request status through existing vault/dashboard
queries so users can see queued/running/skipped/failed state without each tab
running its own action.

If a free user has enough vaults or branches that background reloads wait, the
UI should be able to distinguish "queued/backlogged" from "failed." The product
copy can stay minimal, but the state should exist so the dashboard does not make
delayed refresh look broken.

### Slice 3: Install Named Workpools

After request semantics are stable, install a small number of physical named
pools:

1. `interactiveRefreshWorkpool` for manual clicks, post-commit refreshes, and
   direct file-view work
2. `backgroundRefreshWorkpool` for dashboard visibility/page-load hints

Do not start by creating a physical Workpool component per vault, branch, or
user. Put per-user queueing, fairness, cost units, and plan budgets in request
claiming. Claiming should avoid draining one user's backlog while other users
have eligible work, and it should let paid/interactive work outrank free
background work without bypassing provider cooldowns.

Physical per-user or per-tenant execution components may become useful later if
the backend is split into Convex components or self-hosted deployments. That
should be an implementation topology change over the same durable request
contract, not the first version of the hosted scheduler.

The Workpool runner should:

1. re-read the request and vault state
2. re-run backend claim/cooldown checks before GitHub calls
3. call the existing metadata/tree internals
4. use `onComplete` to mark request status
5. retry only idempotent fetch/cache jobs

### Slice 4: Budget And Observability

Add metrics and state that answer:

1. how many requests were queued, skipped, running, failed, and succeeded
2. queue lag by priority
3. GitHub rate-limit cooldown by user/provider connection
4. per-vault and per-user refresh fanout
5. cost units spent, remaining, delayed, and skipped by plan/account
6. Workpool backlog and failure rate

This is where global per-user refresh budgets become enforceable and auditable.

### Hosted, Component, And Self-Hosted Direction

The request table is the portable contract:

1. hosted Noter can meter and prioritize refresh work by account/plan
2. future Convex components can expose the same request/claim/result boundary
3. self-hosted users can pay their own Convex compute while keeping the same
   logical scheduler semantics

This does not mean the first implementation should expose component boundaries
or self-hosting configuration. It does mean the queue key, budget policy, and
cost accounting should not be treated as afterthoughts, because changing them
later would require rewriting request identity, UI status, and billing history.

## Deletion Merge Caveat

The unmerged deletion workflow branch proposes a separate deletion gate and
dedicated deletion run/event tables. Once that lands, refresh and source writes
should honor deletion as a stronger gate than connected GitHub.

Expected changes to this research after deletion merges:

1. `requestRepositoryRefresh` must reject or skip vaults with active or failed
   deletion gates
2. `refreshRepositoryTree`, file staging, Codespaces, provider provisioning, and
   source setup completion writes need the same gate
3. dashboard cards may show deleting/delete-failed states alongside setup and
   refresh state
4. local cleanup should delete or detach refresh request records according to
   the deletion retention spec

This does not change the main conclusion. Refresh remains Workpool-shaped:
bounded, idempotent, cache-refresh work with durable request state. Deletion is
Workflow-shaped: ordered destructive orchestration with provider steps, batched
cleanup, and retry after partial failure.

## Open Questions

1. Should dashboard background refresh request status be visible on every card,
   or only when a request is running/failed?
2. Should manual refresh bypass the request idempotency bucket while still
   respecting provider cooldown, or should it merge into an existing queued job?
3. Should a branch tree refresh and repo metadata refresh be separate request
   rows when both are needed, or one combined row with separate result fields?
4. Should branch-specific Workpool jobs run concurrently inside one vault, or
   should vault-level serialization remain until production proves it is too
   slow?
5. How should the codespace-first placeholder tree be represented so a tree row
   does not imply source files are hydrated?
6. How long should completed refresh request status be retained?
7. Should `useCacheQuery` expose stale/live metadata so the dashboard can avoid
   showing cached "Updated ..." status as though it were live?
8. Is the paying queue subject always a user, or should the model start with an
   account/workspace-shaped key even before teams exist?
9. What is the first cost-unit model: per GitHub API call, per branch tree, per
   metadata sync, or a coarse refresh-size bucket?
10. Should free-plan background work be delayed through `notBefore`, lower claim
    priority, smaller active slots, or all three?
11. Which parts of the request/runner boundary should be kept component-shaped
    so a future self-hosted Convex deployment can own the compute cost?

## Recommended First PR

The first code PR should not install Workpool yet. It should add the durable
request table, logical queue fields, and one backend request mutation, then
migrate the dashboard automatic refresh hints to that mutation while leaving the
existing direct runner intact.

This gives the product one observable backend-owned reload request without
changing every GitHub sync path at once. It also creates the first place to
model free versus paid refresh treatment without adding billing enforcement
everywhere. After that, swapping request execution from scheduler to Workpool is
a contained mechanical change with a clearer success criterion: fewer
client-owned bursts and visible queued/running/skipped/delayed status on the
dashboard.
