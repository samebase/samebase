# Workpool Refresh And Tenant Compute Research

## Document Control

- Status: Draft research
- Owner: Noter backend/frontend sync flows
- Created: 2026-05-02
- Related specs:
  - `specs/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `specs/079_DASHBOARD_UPDATED_STATUS_MANUAL_REFRESH_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/064_THIN_INSTALLABLE_WEB_APP_SPEC.md`

## Prompt

Refreshing is currently messy and initiated by clients. Explore whether Noter should move refresh
orchestration behind a queue, including Convex Workpool, and whether Noter should become multitenant
enough that users can install a Convex component into their own deployment so expensive compute runs
on their Convex instance.

## Current Finding

Use a durable backend request model first, then choose Workpool or Workflow based on the shape of
the work:

1. use Workpool for bounded single-step refresh execution
2. use Workflow when the refresh or compute flow becomes a durable multi-step process with waits,
   sleeps, external events, restarts, or nested workflows

Do not make the first patch a packaged tenant component. The immediate architecture should move
client-side auto-refresh decisions into Convex, enqueue durable refresh jobs, and leave React
surfaces as subscribers plus explicit user-intent dispatchers.

The tenant-installed component idea is promising, but it is a product and trust boundary change. It
should start as a narrow remote worker/component research track after the hosted Noter refresh queue
proves the job contracts, idempotency keys, status model, and observability.

Trigger note: this research was written while the frontend still used separate page-load and
visibility refresh paths. The accepted queue contract in
`specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md` now treats route load, Page Visibility resume, and
window focus as the same passive source demand. Backend policy should not branch on those
browser-event subtypes.

## Current Runtime Shape

The dashboard and file view currently call `api.github.refreshRepositoryTree` from React effects and
click handlers:

- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - page load and visibility effects fan out across ready vaults
  - client-side batching uses `DASHBOARD_REFRESH_CONCURRENCY`
  - client memory debounce uses `claimRefreshDebounce("dashboard", ...)`
- `apps/noter/src/components/FileView/FileView.tsx`
  - visibility/page-load refresh calls the same action for the active branch
  - draft PR creation awaits a manual tree refresh before navigating
- `apps/noter/src/lib/treeRefreshDebounce.ts`
  - debounce state is a module-local `Map`, so it is per browser tab/runtime

The backend already has important containment:

- `apps/noter/convex/vault.ts`
  - `claimTreeRefresh` gives each vault one repo-level lock
  - `releaseTreeRefresh` records success, failure, and cooldown state
  - `recordTreeRefreshFailure` preserves active cooldowns
- `apps/noter/convex/github.ts`
  - `refreshRepositoryTree` computes whether to sync metadata, refresh branch tree data, or skip
  - `syncRepositoryMetadata` can include branch timestamps, PR links, ahead/behind, and Cloudflare
    preview metadata
  - `refreshBranchTree` updates branch-scoped tree cache

This means the true problem is not that every refresh is unguarded. The problem is that clients
still decide when and how many refreshes to request, while the backend only accepts or rejects each
individual request.

## Workpool Notes

The Workpool component is a good match for Phase 3 of the accepted GitHub sync rollout because it
provides:

1. bounded parallelism for async actions and mutations
2. retry behavior with backoff and jitter for idempotent actions
3. `onComplete` callbacks for durable status updates
4. reactive job status stored in Convex
5. cancellation APIs for queued or retrying work

Registry check from this worktree:

- `@convex-dev/workpool` latest: `0.4.6`
- description: `A Convex component for managing async work.`
- license: `Apache-2.0`
- repository: `get-convex/workpool`

Important constraints from the Workpool docs:

1. Workpool behaves like scheduled async functions with a concurrency limit; it is not a free
   replacement for direct function calls.
2. It has coordination overhead, so Noter should use a small number of pools and avoid creating one
   pool per vault, branch, or user.
3. Retried actions must be idempotent.
4. High-volume enqueueing should use batch APIs where practical.
5. Pool parallelism should stay within Convex plan limits.

Sources:

- [Convex Workpool component](https://www.convex.dev/components/workpool)
- [get-convex/workpool README](https://github.com/get-convex/workpool)
- [Convex component docs](https://docs.convex.dev/components)
- [Convex component authoring docs](https://docs.convex.dev/components/authoring)

## Workflow Notes

Workflow is not a competing queue primitive so much as a higher-level durable orchestration
primitive built on Workpool. It lets application code define durable functions with typed arguments
and return values, whose steps are regular Convex queries, mutations, actions, or nested workflows.

Registry check from this worktree:

- `@convex-dev/workflow` latest: `0.3.12`
- description: `Convex component for durably executing workflows.`
- license: `Apache-2.0`
- repository: `get-convex/workflow`
- peer dependencies include `@convex-dev/workpool` `^0.3.0 || ^0.4.0`

Capabilities that matter for Noter:

1. workflow status can be observed reactively by many users
2. workflow steps can run in sequence or in parallel
3. action step retries are configurable per step
4. workflows can sleep or wait for external events without consuming resources
5. workflows can be canceled and restarted from a failed step
6. the overall workflow has an `onComplete` handler
7. Workpool is used underneath to bound step parallelism

Workflow constraints that matter for Noter:

1. workflow handlers must be deterministic
2. side effects like `fetch`, env reads, and cryptographic randomness belong in step functions, not
   in the workflow definition
3. step input/output history is journaled, so large payloads should be stored in tables or file
   storage and passed by ID
4. changing workflow step order or structure while old workflows are active can cause determinism
   violations
5. completed workflow storage needs cleanup

Sources:

- [Convex Workflow component](https://www.convex.dev/components/workflow)
- [get-convex/workflow README](https://github.com/get-convex/workflow)
- [Convex agent workflow docs](https://docs.convex.dev/agents/workflows)

## Workpool Versus Workflow

For the current refresh mess, the first backend queue should still look closer to Workpool than
Workflow:

1. most automatic refresh jobs are one-shot read/update jobs
2. the existing `refreshRepositoryTree` action already computes skip, metadata-sync, and
   tree-refresh decisions
3. current UI needs durable request status more than durable step replay
4. Workpool has less API surface and fewer determinism/versioning concerns

Workflow becomes a better fit when the unit of work has a real lifecycle:

1. create or refresh repository metadata
2. wait for GitHub, Cloudflare, or remote worker callback
3. run a follow-up branch tree refresh
4. notify or update UI when preview/build state completes
5. recover from a specific failed step after code or provider outage fixes

So the decision rule is:

1. Workpool for bounded execution of independent refresh tasks.
2. Workflow for long-lived orchestration where the order, delays, events, and restart point matter.

## Create App Provisioning Is Workflow-Shaped

The clearest Workflow candidate is not the first refresh queue. It is the new-app experience.

Current source-of-truth behavior:

1. `vaultActions.createRepository` validates GitHub, Convex, and Cloudflare provider connections.
2. It creates a GitHub repository, seeds the starter app, reads the initial tree, creates the vault
   row, then schedules `internal.infraProvisioning.provisionVaultInfrastructure`.
3. `infraProvisioning.provisionVaultInfrastructure` claims provisioning, ensures Convex resources,
   ensures preview Convex resources, ensures Cloudflare Pages resources/env/deploy setup, writes
   infrastructure/domain rows, and marks the vault `ready`, `partial`, or `failed`.
4. `VaultDashboard` mostly exposes this as coarse `infraState` text and a retry action.

That shape is hard to explain in UI because the product is doing several provider operations, but
the user sees only "creating", "provisioning", or "failed". Workflow would let Noter model the
operation the way users understand it:

1. check required provider connections
2. create GitHub repository
3. seed starter app
4. create vault record
5. create Convex project/deployments/deploy keys
6. create Cloudflare Pages project
7. set Cloudflare/Convex environment and deploy settings
8. record production URL and dashboard links
9. mark app ready

The UI should subscribe to an app-owned `appProvisioningRuns` or `vaultProvisioningRuns` record
rather than infer progress from scattered vault fields. A compact timeline can show the single
actionable state:

1. `Blocked`: connect GitHub, Convex, or Cloudflare
2. `Running`: current step and last successful step
3. `Needs input`: select Cloudflare account, reconnect expired provider token, or approve provider
   access
4. `Retryable`: failed step with a retry button that restarts from the failed step
5. `Ready`: production URL and provider dashboard links

Workflow is useful here because the run has step order, durable status, restart points, and possible
waits for external provider state. A plain Workpool job can run the provisioning action, but it does
not by itself create a user-readable step model.

### Provisioning Workflow Sketch

Keep secrets in provider connection rows and pass only IDs or redacted metadata through the workflow
journal.

```ts
const createAppWorkflow = workflow.define({
  args: {
    userId: v.id("users"),
    repoName: v.string(),
    private: v.boolean(),
    runId: v.id("appProvisioningRuns"),
  },
  handler: async (step, args) => {
    const repo = await step.runAction(internal.appProvisioning.createGitHubRepo, {
      userId: args.userId,
      repoName: args.repoName,
      private: args.private,
      runId: args.runId,
    });

    const vault = await step.runMutation(internal.appProvisioning.createVaultFromRepo, {
      userId: args.userId,
      repo,
      runId: args.runId,
    });

    const convex = await step.runAction(internal.appProvisioning.ensureConvexResources, {
      vaultId: vault.vaultId,
      runId: args.runId,
    });

    const hosting = await step.runAction(internal.appProvisioning.ensureCloudflareResources, {
      vaultId: vault.vaultId,
      convex,
      runId: args.runId,
    });

    await step.runMutation(internal.appProvisioning.finishAppProvisioning, {
      vaultId: vault.vaultId,
      hosting,
      runId: args.runId,
    });
  },
});
```

This is intentionally illustrative, not final API shape. The implementation should version the
workflow name or args because active workflows are sensitive to step-structure changes.

### Create App Recommendation

Do this as its own product track, separate from refresh:

1. Add an app-owned provisioning-run table with stable step names and user-facing status.
2. Keep the current provider helpers and infra idempotency, but update each step through the run
   record.
3. Convert infra provisioning to Workflow first, after vault creation.
4. Once that UI is solid, consider moving GitHub repo creation and starter seeding into the same
   workflow.
5. Keep retry scoped to the failed or blocked step; do not make users restart the whole app creation
   when Convex or Cloudflare is the only failing segment.

## Proposed Hosted Architecture

Noter already installs a Convex component in `apps/noter/convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();

app.use(agent);

export default app;
```

Workpool or Workflow would extend that same component installation seam rather than introducing a
new backend framework.

### 1. Keep Client Surfaces Dumb

React should stop deciding refresh cadence for automatic work. It should:

1. subscribe to vault/tree/metadata status
2. dispatch explicit user intent for manual refresh
3. render backend-owned pending, cooling down, failed, and stale states

Visibility and page-load signals can remain useful as hints, but they should call a cheap mutation
like `refreshQueue.requestDashboardRefresh` instead of directly calling GitHub work.

### 2. Add A Refresh Request Table

Add a durable backend-owned request record, conceptually:

```ts
refreshRequests: {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  branch?: string;
  kind: "branch_tree" | "repo_metadata" | "combined";
  priority: "interactive" | "visible" | "background";
  trigger: "manual" | "page_load" | "visibility" | "post_commit" | "polling";
  idempotencyKey: string;
  state: "queued" | "running" | "succeeded" | "skipped" | "failed" | "canceled";
  requestedAt: number;
  startedAt?: number;
  finishedAt?: number;
  skipReason?: "cooldown" | "recent_success" | "in_progress" | "branch_not_found";
  failureKind?: "failed" | "rate_limited";
  failureMessage?: string;
  workId?: string;
}
```

The key invariant: a unique logical refresh has one durable backend record that all tabs observe.

### 3. Enqueue Through A Small Pool Set

Start with two Workpool installs:

1. `interactiveRefreshWorkpool`
   - manual clicks, post-commit refreshes, newly created PR branches
   - low parallelism, higher priority
2. `backgroundRefreshWorkpool`
   - dashboard stale metadata, page-load/visibility hints
   - lower priority and aggressively debounced

Avoid per-user pools at first. Put user/vault fairness in request claiming and idempotency keys, not
in component topology.

### 4. Make Refresh Jobs Idempotent

Each enqueued action should:

1. re-read the refresh request and current vault state
2. re-run backend claim/cooldown checks before GitHub calls
3. mark skipped when another job already made the cache fresh
4. use the existing `refreshBranchTree` and `syncRepositoryMetadata` internals
5. always finish through an `onComplete` mutation that records status

The runner should reuse the current internal split points instead of moving GitHub logic into the
queue module:

1. `computeRepositoryRefreshPlan`
2. `computeRepositoryTreeMetadataSyncPlan`
3. `internal.github.syncRepositoryMetadata`
4. `internal.github.refreshBranchTree`
5. `internal.vault.claimTreeRefresh`
6. `internal.vault.releaseTreeRefresh`
7. `internal.vault.recordTreeRefreshFailure`

Workpool retries should only wrap actions whose external side effects are safe to repeat. Read-only
GitHub fetches plus Convex cache updates are mostly idempotent; PR creation, commits, comments, and
destructive operations are not.

### 5. Split Heavy Metadata From Cheap Tree Refresh

Keep the accepted Phase 2 split:

1. branch-tree refresh updates one branch tree and commit SHA
2. repo-metadata sync updates branch list, PR links, ahead/behind, preview URLs, and timestamps

The queue should encode this split in job type so a focused file view does not accidentally enqueue
a repo-wide metadata scan.

## Why This Beats Client-Side Refresh

1. Multiple tabs converge on the same durable request.
2. Backoff and cooldown become observable data, not tab-local behavior.
3. Dashboard fanout is controlled by backend policy, not viewport timing.
4. Manual refresh can be prioritized without bypassing cooldown.
5. Production monitoring can track backlog, lag, failure rate, and retry rate.

## Multitenant / User-Owned Convex Compute

The idea has two different meanings and they should not be merged too early.

### Hosted Multitenancy

Noter hosted app can become more explicitly tenant-aware while still running all backend work in
Noter's Convex deployment. This means:

1. tenant/org IDs become first-class around users, vaults, provider connections, and audit records
2. refresh budgets can be tenant-scoped
3. billing can map expensive GitHub/AI/preview work to a tenant
4. auth and approval boundaries stay centralized

This is the right prerequisite for any BYO compute story.

### BYO Convex Component

Publishing a Noter refresh/runtime component would let a user install part of Noter into their own
Convex deployment. This could shift some background compute and third-party API traffic away from
Noter's deployment, but the boundary is hard:

1. components cannot read the parent app's tables unless data is passed in
2. components cannot use the app's `ctx.auth`
3. components cannot read the app's environment variables
4. component public functions are internal references from the parent app
5. IDs across component boundaries become strings
6. packaged components require their own codegen, build, exports, example app, and tests

A packaged component therefore works best for a narrow, self-contained refresh engine API, not for
moving the whole Noter app into someone else's Convex.

## BYO Compute Models

### Model A: Hosted Queue Only

Noter owns the queue, runs all refresh work, and exposes better status.

This is the best first implementation. It reduces the current mess without changing deployment,
billing, auth, or support boundaries.

### Model B: Hosted Control Plane, Remote Worker

Noter remains the control plane. A user-owned deployment installs a Noter worker component that
accepts signed refresh jobs, performs GitHub/compute-heavy work, and reports results back to hosted
Noter through a narrow callback/API.

This is the most realistic BYO compute path. It keeps Noter's product shell and account model
centralized while moving selected expensive jobs. Workflow is more interesting here than for the
initial hosted queue because the control plane may need to:

1. enqueue remote work
2. wait for an external callback or polling signal
3. retry only the callback/polling step after transient outages
4. cancel or restart a failed remote execution without duplicating completed work

Open design questions:

1. how hosted Noter authenticates to the user deployment
2. how the user deployment authenticates callbacks to hosted Noter
3. whether results are pushed back or pulled by Noter
4. which secrets live in each deployment
5. how to prevent a compromised user deployment from writing untrusted state
6. who owns observability and support when the remote worker is slow or broken

### Model C: Fully Self-Hosted Noter App

Users run the entire Noter Convex/backend/frontend stack themselves.

This maximizes compute offload but is a different product. It complicates OAuth apps, Cloudflare
front door assumptions, billing, support, upgrades, and security response. It should not be coupled
to the refresh queue refactor.

## Recommendation

Implement this in three research-to-delivery tracks:

1. Hosted refresh queue
   - add durable refresh request state
   - start execution with scheduler or Workpool
   - reserve Workflow for multi-step refresh/provisioning flows
   - move dashboard/file-view automatic refreshes to cheap request mutations
   - keep existing GitHub internals, claim/cooldown state, and UI status
2. Tenant budget model
   - add tenant/account identifiers only where current workflows need them
   - define per-tenant refresh budgets and observability
   - keep hosted Noter as the only deployment boundary
3. BYO worker spike
   - design a minimal packaged component around one job type
   - prove function-handle/callback/auth flow in an example app
   - do not move production refreshes until hosted queue semantics are stable

## First Implementation Slice

The first real PR should be small enough to review:

1. add a `refreshRequests` table and validators
2. add `requestRepositoryRefresh` mutation
3. make it compute an idempotency key from user, vault, branch, kind, and a debounce bucket
4. leave actual GitHub work on the existing action for the first slice
5. update dashboard auto-refresh to call the request mutation and subscribe to request status

The first execution path can use `ctx.scheduler.runAfter(0, ...)` so request dedupe, status reads,
and UI shape can land before the component dependency. After that lands, swap request execution from
direct scheduling to Workpool.

The reason to avoid Workpool in the very first code patch is to separate data model semantics from
queue mechanics. If the request table is wrong, Workpool will make the wrong thing durable.

## Concrete Workpool Follow-Up Slice

After the request table is proven:

1. install `@convex-dev/workpool`
2. add named Workpool components in `apps/noter/convex/convex.config.ts`
3. create a small `convex/refreshQueue.ts` app wrapper
4. enqueue only the existing runner action, not arbitrary GitHub functions
5. use `onComplete` to update `refreshRequests`
6. expose request status through existing vault/dashboard queries

The Workpool PR should not change BYO compute boundaries. Its success criterion is that multiple
tabs and dashboard fanout converge on durable backend work.

## Concrete Workflow Follow-Up Slice

Use Workflow after Workpool only if a real multi-step lifecycle appears. A good candidate would be
Cloudflare preview hydration or BYO worker execution:

1. define `refreshRepositoryWorkflow`
2. run metadata sync as one step
3. run branch tree refresh as a second step only if metadata says it is needed
4. sleep or wait for preview/remote-worker completion when applicable
5. use `onComplete` to update the same `refreshRequests` row
6. add cleanup for completed workflow records

Avoid Workflow for the first dashboard/file-view refresh patch. The durable request table can give
the UI one observable status record without inheriting workflow determinism and migration
constraints too early.

## Risks

1. Queueing can hide freshness bugs if the UI only sees "queued" and not why the backend skipped
   work.
2. Workpool overhead can make small refreshes slower if Noter over-queues.
3. Retrying non-idempotent work would create production bugs.
4. Tenant-owned compute creates a new trust boundary and a support surface.
5. A packaged component can become a compatibility promise before the API is stable.
6. Workflow handlers can break old in-flight work if the step structure changes before those
   workflows finish.

## Open Questions

1. Should manual refresh show queue position or only state?
2. What are the exact priority rules between visible file view work and dashboard background work?
3. Should repo metadata sync be per user, per vault, or per provider connection when multiple users
   connect the same repository?
4. What job result data is safe to accept from a user-owned deployment?
5. Do we want BYO compute for GitHub refresh only, AI work only, or both?
