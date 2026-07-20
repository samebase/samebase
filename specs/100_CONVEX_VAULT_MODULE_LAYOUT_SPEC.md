# Convex Vault Module Layout Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase backend
- Last updated: 2026-07-21
- Related docs:
  - [Vault deletion workflow](./098_VAULT_DELETION_WORKFLOW_SPEC.md)
  - [Pull request provider query](./115_PULL_REQUEST_PROVIDER_QUERY_SPEC.md)

## Current Contract

Vault backend modules live under `apps/samebase/convex/vault/`. Callers import the responsible named
module directly. Root re-export shims and a catch-all `vault/index.ts` are not allowed.

```text
apps/samebase/convex/vault/
  actions.ts
  branches.ts
  dashboard.ts
  dashboardModel.ts
  model.ts
  records.ts
  state.ts
  pullRequestResources.ts
  providerObservationQueries.ts
  deletion/
    cleanup.ts
    eligibility.ts
    events.ts
    model.ts
    providerActions.ts
    runs.ts
    state.ts
    workflow.ts
```

## Ownership

- `actions.ts` owns public vault lifecycle actions.
- `dashboard.ts` owns dashboard queries and persisted dashboard preferences.
- `records.ts` owns vault row creation, lookup, repository connection, and state transitions.
- `branches.ts` owns only the exact branch-tree cache and its refresh coordination.
- `pullRequestResources.ts` joins live provider resources for currently visible pull request heads.
  It does not persist pull request state.
- `providerObservationQueries.ts` reads the durable vault attachment graph needed by live provider
  actions.
- `model.ts` owns vault and attached-resource tables and reusable validators.
- `state.ts` owns runtime state guards.
- `deletion/*` owns deletion eligibility, durable workflow state, cleanup, and provider teardown.

Repository-wide pull request queries live at `convex/repositoryPullRequests.ts` because they are a
GitHub provider boundary, not a persisted vault submodel.

## Data Boundary

The module layout does not create compatibility aliases for function paths or schema tables.
Deleting a model updates all call sites and generated references directly.

The exact branch tree remains `observations_vaultRepository_branchTrees`. The vault module has no
remote branch catalog, repository refresh queue, commit-check mirror, or copied provider domain
table.

## Validation

- Generated API references use named vault modules.
- No root re-export shim preserves an old function path.
- `branches.ts` has no repository-wide discovery or pull request list responsibility.
- Deletion cleanup covers every vault-owned table.
