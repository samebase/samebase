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

Frontend reports refresh demand. Backend schedules refresh supply.

Optimize for:

- schema-enforced state
- one readable orchestration module
- small reviewable phases
- no generic plugin/provider framework

## State Model

Start here. Convex validators must encode this shape.

```ts
type RepositoryRefreshRequest =
  | RepositoryMetadataRefreshRequest
  | BranchTreeRefreshRequest
  | LinkEnrichmentRefreshRequest;

type RepositoryMetadataRefreshRequest = RepositoryRefreshBase & {
  work: {
    kind: "repo_metadata";
    enrichment: RepositoryMetadataEnrichment;
  };
  intent:
    | DashboardRefreshIntent
    | ManualRefreshIntent
    | SourceSetupRefreshIntent;
};

type BranchTreeRefreshRequest = RepositoryRefreshBase & {
  work: {
    kind: "branch_tree";
    branch: string;
  };
  intent:
    | ManualRefreshIntent
    | FileViewRefreshIntent
    | CommitRefreshIntent
    | PullRefreshIntent;
};

type LinkEnrichmentRefreshRequest = RepositoryRefreshBase & {
  work: {
    kind: "link_enrichment";
    branch: string;
    provider: RepositoryRefreshLinkProvider;
  };
  intent: ManualRefreshIntent | DashboardRefreshIntent;
};

type RepositoryRefreshBase = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  dedupeKey: string;
  lifecycle: RepositoryRefreshLifecycle;
  createdAt: number;
  updatedAt: number;
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

type DashboardRefreshIntent = {
  source: "dashboard";
  trigger: "page_load" | "visibility";
};

type ManualRefreshIntent = {
  source: "manual";
  trigger: "dashboard_status_click";
};

type SourceSetupRefreshIntent = {
  source: "source_setup";
  runId: Id<"appProvisioningRuns">;
  mode: "create_repository" | "connect_existing_repository";
};

type FileViewRefreshIntent = {
  source: "file_view";
  trigger: "page_load" | "visibility";
};

type CommitRefreshIntent = {
  source: "commit";
};

type PullRefreshIntent = {
  source: "pull";
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

- no optional `branch` on the base row
- no `link_enrichment` without provider
- no provider/comment link parsing inside `repo_metadata`
- no `source_setup` without `runId`
- no `queued` row with `workpoolJobId`
- no `succeeded` row without result
- no caller-provided `dedupeKey`
- build rows through constructors only

## Orchestration File

Create one map-like module:

- `apps/noter/convex/repositoryRefresh.ts`

It should expose the system in this order:

```ts
type RepositoryRefreshPhase =
  | "make_request"
  | "ingest_intent"
  | "choose_work"
  | "enqueue_work"
  | "run_worker"
  | "finish_request";
```

Keep lower-level details elsewhere:

- GitHub API calls stay below orchestration.
- Vault cache writes stay below orchestration.
- Workpool calls stay thin.
- Policy lives in one helper.

## Phase 0: Type Review

Goal: agree on state before code.

Deliverable:

- this spec

No code.

## Phase 1: Schema And Constructors

Add:

- `repositoryRefreshRequests` table
- validators mirroring `RepositoryRefreshRequest`
- `makeRepositoryRefreshRequest`
- dedupe-key derivation
- state transition helpers

Do not:

- call Workpool
- change dashboard behavior
- call GitHub

Tests:

- constructors produce valid state
- branch work requires branch
- link work requires branch and provider
- source setup requires run id
- dedupe key is derived
- invalid lifecycle transitions fail

## Phase 2: Intent Ingest

Add enqueue mutations/actions.

Entry points:

- dashboard auto-refresh
- dashboard manual refresh if small
- existing-repository connection finish

Behavior:

- authenticate user
- load vault
- reject/no-op if deleting
- build typed request
- coalesce by dedupe key
- return request status

Do not:

- execute refresh work yet
- remove direct file-view refresh
- redesign dashboard query

## Phase 3: Metadata Worker

Add one Workpool worker for:

```ts
type Phase3Work = RepositoryMetadataRefreshRequest;
```

Behavior:

- re-read request
- re-check vault/deletion gate
- claim existing vault refresh lock
- run repository metadata sync
- update `vaultRemoteBranches`
- finish request
- preserve current vault refresh UI fields

This phase fixes:

- dashboard auto metadata freshness
- existing-repository connect branch-list visibility after setup

Do not:

- refresh every branch tree
- add link providers
- move file view yet

## Phase 4: Manual Priority

Manual refresh becomes queued priority intent.

Rules:

- can raise priority
- can request deeper metadata
- can target branch tree later
- cannot bypass deletion
- cannot bypass provider cooldown
- cannot bypass GitHub rate limit
- must coalesce with identical running work

## Phase 5: Branch Tree Work

Add:

```ts
type Phase5Work = BranchTreeRefreshRequest;
```

Entry points:

- file view page load / visibility
- manual branch refresh
- commit/pull if clearer than direct cache warming

Rules:

- branch is required by schema
- one branch per request
- metadata refresh does not imply tree refresh

## Phase 6: Link Enrichment

Add:

```ts
type Phase6Work = LinkEnrichmentRefreshRequest;
```

Current provider:

- `cloudflare_pages_comments`

Provider/comment links only enter through `LinkEnrichmentRefreshRequest`.
`repo_metadata` may fetch PR metadata, but it does not parse PR comments for
links.

Future provider examples are not scope. A second provider should add one closed
union member plus one internal handler.

## Later

Possible after queue proves useful:

- move high-churn refresh status off `vaults`
- add dashboard summary rows
- add backlog/latency observability
- package execution for another Convex deployment

These do not change Phase 1-3 scope.

## Non-Goals

- one Workpool per user/vault/branch
- Workflow per refresh
- user-configurable plugins
- generic provider framework
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
