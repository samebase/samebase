# Dashboard Reload Queue Research

## Document Control

- Status: Draft research
- Owner: dashboard reload, GitHub sync, branch cache freshness
- Created: 2026-05-09
- Rewritten: 2026-05-11
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `specs/079_DASHBOARD_UPDATED_STATUS_MANUAL_REFRESH_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`

## Short Answer

The refresh system should be optimized for clarity first.

The product rule:

- frontend reports demand
- backend schedules supply

The code shape should make that rule obvious from one top-level module. That
module should read like Workflow definitions do: a small set of named steps that
show how refresh intent becomes refresh work, without requiring the reader to
open every GitHub or Convex helper.

## Scope Classification

### Important Now

These are implementation constraints for the first queue work:

- Start from the persisted state model.
  - Write the logical TypeScript type first.
  - Then encode the same shape in Convex validators.
  - Prefer unions that make invalid request states unrepresentable.
- Create a durable refresh intent/request model.
- Let all relevant entry points enqueue bounded intent:
  - dashboard page load / visibility
  - dashboard manual refresh
  - existing-repository connection completion
  - later-compatible sources such as file view, commit, and pull
- Keep the backend responsible for deciding:
  - what work runs
  - when it runs
  - whether expensive enrichment is included
- Use Workpool for bounded execution of refresh jobs.
- Keep Workflow for lifecycle operations:
  - create a new Noter-managed vault
  - connect an existing GitHub repository
  - delete a vault
- Split the mental model of "refresh" into work units:
  - repository metadata sync
  - branch tree refresh
  - link enrichment
- Make manual refresh a priority signal, not an unconditional provider call.
- Preserve the deletion gate and provider cooldown/rate-limit behavior.

### Important Later

These are likely follow-ups after the first queue proves itself:

- Move file-view automatic refresh into the same queue.
- Move post-commit and pull cache refresh into the same queue if it stays clear.
- Split repository metadata, branch tree, and link enrichment into separate job
  types if the first combined worker gets hard to reason about.
- Move high-churn refresh status off `vaults`.
- Add dashboard summary rows if `getUserVaults` remains too expensive.
- Add queue/backlog observability.

### Future Pressure, Not Current Scope

These ideas should influence boundaries, but should not be built now:

- Running refresh work in a user's own Convex deployment.
- Packaging refresh execution as a Convex component.
- User-configurable plugins.
- A generic provider framework.

The only current lesson from those future ideas is single responsibility:
refresh orchestration should have a narrow input/output contract so it can be
moved later if that ever becomes useful.

### Not Needed Now

Avoid these in the first implementation:

- One Workpool per user, vault, or branch.
- A new Workflow for every refresh.
- A broad plugin system.
- A full dashboard query rewrite.
- A full replacement of existing vault refresh status fields.
- Speculative provider abstractions beyond the known work units.

## Clarity-Oriented Code Shape

Create one top-level refresh orchestration module. Exact file name can change,
but the purpose should be stable.

Suggested module:

- `apps/noter/convex/repositoryRefresh.ts`

The file should answer, at a glance:

- What can ask for refresh?
- What work units can refresh perform?
- How are duplicate requests coalesced?
- How does priority work?
- What does the worker execute?
- What status does the UI read?

The top-level code should look conceptually like this:

```ts
const refreshSystem = {
  makeRequest,
  ingestIntent,
  chooseWork,
  enqueueWorkpoolJob,
  runWorker,
  finishRequest,
};
```

The implementation does not need this exact object. The point is that the file
should read as a system map. Lower-level details can live elsewhere:

- GitHub calls stay in GitHub-specific helpers.
- Vault cache writes stay in vault-specific helpers.
- Workpool plumbing stays small and explicit.
- Policy calculation gets one named helper instead of scattered checks.

Prefer explicit closed unions over a generic framework:

- intent source:
  - `dashboard`
  - `manual`
  - `source_setup`
  - `file_view`
  - `commit`
  - `pull`
- work kind:
  - `repo_metadata`
  - `branch_tree`
  - `link_enrichment`

If a reader opens the orchestration file, they should understand the refresh
system before they understand Octokit, Cloudflare comments, or Workpool
internals.

## State Model

Start with the persisted state. The Convex schema can use validators, but this
is the logical TypeScript shape the validators should encode.

One request row should represent one work unit. If one entry point needs
metadata and branch tree refresh, it should create or coalesce two request rows.
That keeps impossible combinations out of the row.

```ts
type RepositoryRefreshRequest =
  | (RepositoryRefreshRequestBase & {
      state: "queued";
      notBefore: number;
      queuedAt: number;
    })
  | (RepositoryRefreshRequestBase & {
      state: "running";
      attempt: number;
      startedAt: number;
      workpoolJobId: string;
    })
  | (RepositoryRefreshRequestBase & {
      state: "succeeded";
      attempt: number;
      startedAt: number;
      completedAt: number;
      result: RepositoryRefreshResult;
    })
  | (RepositoryRefreshRequestBase & {
      state: "failed";
      attempt: number;
      startedAt: number;
      failedAt: number;
      failure: RepositoryRefreshFailure;
    })
  | (RepositoryRefreshRequestBase & {
      state: "canceled";
      canceledAt: number;
      reason: RepositoryRefreshCancelReason;
    });

type RepositoryRefreshRequestBase = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  intent: RepositoryRefreshIntent;
  work: RepositoryRefreshWork;
  priority: RepositoryRefreshPriority;
  createdAt: number;
  updatedAt: number;
};

type RepositoryRefreshIntent =
  | {
      source: "dashboard";
      trigger: "page_load" | "visibility";
    }
  | {
      source: "manual";
      trigger: "dashboard_status_click";
    }
  | {
      source: "source_setup";
      runId: Id<"appProvisioningRuns">;
      mode: "create_repository" | "connect_existing_repository";
    }
  | {
      source: "file_view";
      trigger: "page_load" | "visibility";
    }
  | {
      source: "commit";
    }
  | {
      source: "pull";
    };

type RepositoryRefreshWork =
  | {
      kind: "repo_metadata";
      enrichment: RepositoryMetadataEnrichment;
    }
  | {
      kind: "branch_tree";
      branch: string;
    }
  | {
      kind: "link_enrichment";
      branch: string;
      provider: RepositoryRefreshLinkProvider;
    };

type RepositoryMetadataEnrichment =
  | {
      kind: "none";
    }
  | {
      kind: "pull_request_metadata";
      includeAheadBehind: boolean;
    };

type RepositoryRefreshLinkProvider = "cloudflare_pages_comments";

type RepositoryRefreshPriority = "background" | "normal" | "manual" | "system";

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

This type intentionally avoids these impossible states:

- `branch_tree` without a branch
- `link_enrichment` without a branch and provider
- `source_setup` without the run that caused it
- `queued` with a Workpool job id
- `running` without an attempt and start time
- `succeeded` without a result
- `failed` without a failure kind

Implementation notes:

- If Convex needs an indexed string key, store a derived `dedupeKey`, but do not
  let callers pass it by hand.
- Build requests through one constructor/helper so `dedupeKey`, `priority`, and
  `notBefore` stay consistent with `intent` and `work`.
- Define Convex result validators before handlers, then derive TypeScript types
  from those validators in the final implementation.

## Current Entry Points

| Entry point                      | Current behavior                                                            | Queue behavior                                                   |
| -------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Dashboard page load / visibility | React batches direct `refreshRepositoryTree` calls                          | Enqueue bounded dashboard intent                                 |
| Dashboard manual refresh         | "Updated ..." click calls direct refresh                                    | Enqueue higher-priority manual intent                            |
| Existing repository connect      | Workflow syncs default branch tree, but branch list may require page reload | Enqueue `source_setup` metadata refresh when connection finishes |
| File view page load / visibility | Direct refresh for active branch                                            | Later: enqueue branch-scoped intent                              |
| Commit / pull paths              | Direct cache refresh or shared lock usage                                   | Later: enqueue high-priority branch intent if clear              |

Important existing functions:

- `VaultDashboardRepositoryRefresh.ts`
  - `useVisibleDashboardRepositoryTreeRefresh`
  - `refreshVaultTreesIfNeeded`
- `VaultLastUpdatedStatus.tsx`
- `FileView.tsx`
  - `refreshTreeIfNeeded`
- `appProvisioningWorkflow.ts`
  - `connectExistingRepository`
- `appProvisioningWorkflowActions.ts`
  - `syncVaultTreeForRepository`
  - `finishExistingRepositoryConnection`
- `github.ts`
  - `refreshRepositoryTree`
  - `syncRepositoryMetadata`
  - `refreshBranchTree`
- `vault.ts`
  - `claimTreeRefresh`
  - `releaseTreeRefresh`
  - `recordTreeRefreshFailure`
  - `syncVaultRemoteBranches`
  - `upsertVaultBranchTree`

## Refresh Work Units

Refresh intent is cheap.

- It records that some surface wants fresher data.
- It can be emitted by many tabs or machines.
- It should be rate-limited enough to avoid accidental spam.
- It should not imply provider work must run immediately.

Repository metadata sync is expensive but broad.

- Updates `vaultRemoteBranches`.
- Discovers branch list, default branch changes, upstream deletions, timestamps.
- May include pull request metadata.
- May include ahead/behind.
- Does not parse preview/comment links; those enter through `link_enrichment`.
- Should be budgeted for branch-heavy repositories.

Branch tree refresh is expensive and narrow.

- Updates `vaultBranchTrees`.
- Fetches recursive GitHub tree data for one branch.
- Should usually be branch-scoped.
- Should not run only because metadata refreshed.

Link enrichment is optional.

- Current source: Cloudflare Pages links from PR comments.
- Possible future source: CodeRabbit comments or another deployment bot.
- Should be developer-extensible through a closed internal dispatch.
- Should not be a user plugin system.

## Proposed Backend Flow

Ingest:

- authenticate user
- load vault
- reject or no-op if deletion is active
- build a typed `RepositoryRefreshRequest`
- derive the dedupe key from `intent` and `work`
- coalesce by the derived dedupe key
- return request status

Choose work:

- inspect queued/running requests for the same user/vault/branch
- apply cooldowns and GitHub rate-limit state
- apply free/paid policy
- decide priority and `notBefore`
- decide which work units to run now

Execute:

- Workpool worker re-reads the request
- worker re-checks vault state and deletion gate
- worker claims the current vault refresh lock
- worker runs selected metadata/tree/enrichment helpers
- worker writes cache updates
- worker records status

Finish:

- clear running state
- preserve existing UI status fields for now
- record failure/cooldown in one place
- leave enough status for the dashboard to explain queued/running/failed refresh

## Manual Refresh Semantics

Manual refresh is stronger intent.

It can:

- raise priority
- target one vault or branch
- request deeper metadata
- request link enrichment
- bypass recent-success debounce when product behavior allows it

It must still respect:

- deletion gates
- provider cooldowns
- GitHub rate limits
- active in-flight work with the same idempotency key
- user plan policy

## Free And Paid Freshness

The policy boundary should be the user.

Why:

- GitHub API budget is tied to the user's token.
- A user may open many tabs or machines.
- A user may have many vaults and branches.
- Paid freshness should not require React code changes.

Free users should still get reloads:

- fewer running jobs
- longer automatic intervals
- lower enrichment depth
- slower rotation across many vaults

Paid users can get:

- shorter automatic intervals
- more running jobs
- higher priority
- deeper automatic metadata/enrichment

## First Useful Slice

Build only the smallest version that proves the model.

- Add refresh request validators and table.
- Add the clear orchestration module.
- Add enqueue for refresh intent.
- Wire dashboard auto-refresh to enqueue.
- Wire existing-repository connection finish to enqueue metadata refresh.
- Include dashboard manual refresh as priority intent if the UI change stays
  small.
- Add one Workpool worker that can reuse existing refresh internals.
- Preserve current vault refresh status fields so the dashboard does not need a
  full rewrite.

Tests:

- duplicate browser requests coalesce
- manual request raises priority
- existing-repository connection queues branch metadata visibility work
- deletion gate blocks queued work
- cooldown/rate-limit state delays work
- free and paid policy choose different scheduling

## Later Slices

- Move file-view automatic refresh to the queue.
- Move commit/pull refresh to the queue if it stays clearer than direct cache
  warming.
- Split combined worker into separate job kinds if needed.
- Move high-churn refresh status out of `vaults`.
- Add dashboard summary rows if `getUserVaults` gets too heavy.
- Add internal link enrichers for sources beyond Cloudflare Pages comments.
- Add queue/backlog observability.

## Open Decisions

- Should the first worker run combined metadata-plus-default-tree, or split job
  kinds immediately?
- After existing-repository connect, should the queued work run only repository
  metadata or also targeted branch tree/link enrichment?
- How much should manual refresh bypass recent-success debounce?
- Where should the derived free/paid refresh policy live?
- When deletion starts, should queued jobs be canceled immediately or no-op when
  workers observe the gate?

## Recommendation

Build refresh as backend intent ingestion plus Workpool execution.

Optimize the implementation for an operator reading one orchestration file and
understanding the whole system. Keep future self-hosted/component ideas as
boundary pressure only. The current job is not to make refresh generic; it is to
make refresh explicit, durable, and easy to follow.
