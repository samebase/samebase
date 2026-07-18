# Convex Table Taxonomy And Ownership Spec

Status: Accepted

## Goal

Make the application database understandable from two views:

1. table names show what kind of state a supporting table stores
2. feature model files show complete related table definitions together

This is a schema organization change. It does not change row shapes, indexes, workflows, provider
behavior, UI behavior, authorization, deletion behavior, or recovery behavior.

## Table Name Taxonomy

Durable product facts keep normal names. Supporting tables use one visible prefix:

- `operations_`: live processes, protocol state, leases, credentials, queues, or unsaved work that
  current behavior reads or mutates
- `observations_`: captured external state, including provider snapshots and caches
- `audit_`: append-only history that production behavior never reads to authorize or decide an
  operation
- `ui_`: persisted presentation preferences or layout
- `derived_`: fully recomputable local projections with no irreplaceable source material

An events table is `audit_` only when live behavior never depends on it. Mutable progress events
used by a workflow or UI remain `operations_`.

No current table qualifies for `derived_`. Convex schema snapshots retain raw provider state, and
Git blobs cache provider content, so both are observations.

### Normal durable tables

```text
authSessions
authAccounts
authRefreshTokens
authVerificationCodes
authVerifiers
authRateLimits
users
providerConnections
connectedMachines
vaults
vaultApps
vaultCloudflareWorkers
vaultConvexDeployments
vaultDomains
codespaces
agentThreadContext
chatMessageMetadata
mcpOauthClients
mcpGrants
```

### Operational tables

```text
operations_accountDeletionRuns
operations_accountDeletionEvents
operations_agentActionLeases
operations_machineRegistrationRequests
operations_machineRegistrationBootstrapRateLimits
operations_machineCredentials
operations_machineControlTokens
operations_providerOauthStates
operations_vaultRepositoryRefreshRequests
operations_vaultInfrastructureTargets
operations_vaultInfrastructureOwnership
operations_vaultProvisioningRuns
operations_vaultProvisioningEvents
operations_vaultDeletionRuns
operations_vaultDeletionEvents
operations_fileStaging
operations_collaborativeUpdates
operations_aiProdAccessRequests
operations_mcpAuthRequests
operations_mcpAuthorizationCodes
operations_mcpAccessTokens
operations_mcpRefreshTokens
operations_agentBrowserHandoffs
```

### Observation tables

```text
observations_vaultRemoteBranches
observations_vaultCommitCheckSnapshots
observations_vaultCommitCheckItems
observations_vaultBranchTrees
observations_vaultConvexSchemaSnapshots
observations_vaultFileBlobs
```

### UI tables

```text
ui_dashboardSettings
ui_workspaceSidebarState
ui_vaultBranchFilters
ui_vaultResourceLinksState
ui_vaultConvexSchemaGraphLayouts
ui_folderExpansionState
ui_agentGraphNodeLayout
```

### Audit tables

```text
audit_aiProdAccessEvents
audit_mcpAccessEvents
```

## Feature Ownership

The root `convex/schema.ts` is the only Convex schema entrypoint. It imports feature-owned table
objects and spreads them into one `defineSchema` call.

Feature model files own these table objects:

```text
identityTables
accountDeletionTables
agentTables
providerConnectionTables
connectedMachineTables
userPreferenceTables
vaultDashboardTables
vaultTables
vaultBranchTables
commitCheckTables
convexSchemaGraphTables
repositoryRefreshTables
appProvisioningTables
vaultDeletionTables
codespacesTables
editorTables
chatTables
prodAccessTables
mcpTables
```

Vault-adjacent features remain separate when they have their own lifecycle. Editor staging,
repository refresh, provisioning, deletion, chat, agent state, Codespaces, and MCP do not become
members of `vaultTables` merely because they reference a vault.

## Definition Shape

Each table object shows complete row fields and indexes at the ownership site:

```ts
export const userPreferenceTables = {
  ui_dashboardSettings: defineTable({
    userId: id("users"),
    accountPanelOpen: optional(boolean()),
    providersPanelOpen: boolean(),
    machinesPanelOpen: optional(boolean()),
    workspaceSidebarExpanded: optional(boolean()),
    editorChatOpen: optional(boolean()),
    globalChatOpen: optional(boolean()),
  }).index("by_user", ["userId"]),
};
```

Do not create a separate row validator only to pass it into `defineTable`. A named validator stays
separate only when another table, argument, result, or runtime boundary genuinely reuses it.

Types derived from a table use its validator as the single source of truth:

```ts
export type DashboardSettings = Infer<typeof userPreferenceTables.ui_dashboardSettings.validator>;
```

Feature model files imported by the root schema must not import `_generated/dataModel`, because the
generated data model imports the root schema.

## Rollout

The code lands in one PR with two reviewable checkpoints:

1. rename tables and mechanically update every code, test, and current-documentation reference
2. colocate complete definitions in feature model objects and delete table-only validator
   indirection

Convex table renames create new table identities. This rollout deliberately uses a one-time data
reset instead of building temporary dual-schema migration code for a single active user. The PR does
not perform or authorize the production reset itself. Before deployment, the operator must quiesce
Workflows, Workpool jobs, and scheduled functions, preserve any data they want to keep, and
explicitly authorize the reset.

The implementation stopping rule is strict:

> If the PR changes what an operation does rather than only where its table is defined and what the
> table is called, move that behavior to another task.
