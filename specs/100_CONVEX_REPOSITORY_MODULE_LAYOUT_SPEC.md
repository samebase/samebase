# Convex Repository Module Layout Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase backend
- Last updated: 2026-10-03
- Related docs:
  - [Repository removal workflow](./098_REPOSITORY_REMOVAL_WORKFLOW_SPEC.md)
  - [Pull request provider query](./116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md)
  - [Action catalog plan](../rfcs/125_INTENT_BASED_ACTION_CATALOG_PLAN.md#names-and-module-layout)

## Current Contract

Repository backend modules use `apps/samebase/convex/repository/`, with the registered function
exceptions below. Callers import the responsible named module directly. Root re-export shims and a
catch-all `repository/index.ts` are not allowed.

```text
apps/samebase/convex/repository.ts
apps/samebase/convex/repository/
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

- The root `repository.ts` owns the repository-level actions that the dashboard and MCP share
  (`repository:list`, `create`, `connect`, `retryProviderSetup`, `detachResource`). Their function
  paths are MCP tool names, so the module stays at the root. It runs in the default runtime because
  `list` is a query and `detachResource` is a mutation.
- `actions.ts` owns the Node halves of `repository:create` and `repository:connect`, and the public
  removal actions.
- `dashboard.ts` owns dashboard queries and persisted dashboard preferences.
- `records.ts` owns repository row creation, lookup, repository connection, and state transitions.
- `branches.ts` owns only the exact branch-tree cache and its refresh coordination.
- `pullRequestResources.ts` verifies loaded pull request ids against GitHub, then joins live
  provider resources. It does not persist pull request state.
- `providerObservationQueries.ts` reads the durable repository attachment graph needed by live
  provider actions.
- `model.ts` owns repository and attached-resource tables and reusable validators.
- `state.ts` owns runtime state guards.
- `deletion/*` owns deletion eligibility, durable workflow state, cleanup, and provider teardown.

Repository-wide pull request queries live at `convex/repositoryPullRequests.ts` because they are a
GitHub provider boundary, not a persisted repository submodel.

## Registered Function Path Exceptions

These modules keep their root paths because the paths identify registered functions:

- `infraProvisioning.ts`
- `repositoryProvisioningEvents.ts`
- `repositoryProvisioningRuns.ts`
- `repositoryProvisioningWorkflow.ts`
- `repositoryProvisioningWorkflowActions.ts`
- `repositoryWorkflowAuthority.ts`

The installed
[Workflow 0.4.6 manager stores function and completion callback handles when it starts a run](https://github.com/get-convex/workflow/blob/v0.4.6/src/client/index.ts#L621).
Samebase's
[create and retry admission passes the root Workflow and completion references](../apps/samebase/convex/repositoryProvisioningWorkflow.ts#L81).
A folder move would change those function paths while existing runs can still hold the old handles.

Provider actions can also continue after a deployment. The
[provisioning continuation check](../apps/samebase/convex/repositoryProvisioningWorkflowActions.ts#L92)
and the
[deletion continuation check](../apps/samebase/convex/repository/deletion/providerActions.ts#L44)
call the same registered root authority mutation. Keeping these runtime-owned paths preserves both
callers.

Backend organization therefore moves plain modules through direct imports and keeps these registered
paths stable. It does not require a production drain, a maintenance gate, or forwarding modules.

## Data Boundary

The module layout does not create compatibility aliases for function paths or schema tables.
Deleting a model updates all call sites and generated references directly.

The exact branch tree remains `observations_repository_branchTrees`. The repository module has no
remote branch catalog, repository refresh queue, commit-check mirror, or copied provider domain
table.

## Validation

- Generated API references use named repository modules.
- No root re-export shim preserves an old function path.
- Plain module moves preserve registered function paths, argument validators, and return validators.
- `branches.ts` has no repository-wide discovery or pull request list responsibility.
- Deletion cleanup covers every repository-owned table.
