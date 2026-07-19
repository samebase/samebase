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

## Table Naming Rules

After its lifecycle prefix, a supporting table name starts with its domain and ends with the thing
one row represents. Generic lifecycle nouns come from the closed vocabulary in
`docs/data-modeling-vocabulary.md`. A new generic noun must be defined there in the same change.

Use concrete nouns instead of relational placeholders. In particular, persisted rows are not named
`target`, `ownership`, `claim`, `handoff`, `item`, `record`, `data`, `history`, or bare `state`.
Protocol-defined and product nouns remain valid when they have one precise meaning.

Every supporting-table definition starts with a plain-language comment that identifies one row and
why live behavior needs it. When the producer or consumer is not obvious, the comment names the
actual command, service, provider, or user action. It expands domain-specific terms instead of
repeating them. For example, a provisioning-plan comment says which choices it preserves and why
retries read them; "provisioning state" is not a definition.

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
operations_providerOauthCallbackStates
operations_vaultRepositoryRefreshRequests
operations_vaultProvisioningPlans
operations_vaultProvisioningWriteLocks
operations_vaultProvisioningRuns
operations_vaultProvisioningEvents
operations_vaultDeletionRuns
operations_vaultDeletionEvents
operations_fileStaging
operations_collaborativeFileUpdates
operations_aiProductionReadRequests
operations_mcpAuthorizationRequests
operations_mcpAuthorizationCodes
operations_mcpAccessTokens
operations_mcpRefreshTokens
operations_mcpBrowserLoginTokens
```

### Observation tables

```text
observations_vaultRemoteBranches
observations_vaultCommitCheckSnapshots
observations_vaultCommitChecks
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
audit_aiProductionReadEvents
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
    pricingBillingCycle: optional(union(literal("monthly"), literal("annual"))),
    editorChatOpen: optional(boolean()),
    globalChatOpen: optional(boolean()),
  }).index("by_user", ["userId"]),
};
```

Do not create a separate row validator only to pass it into `defineTable`. A named validator stays
separate only when another table, argument, result, or runtime boundary genuinely reuses it.

The package-owned Convex Auth tables are the exception. `identityTables` includes the definitions
from `@convex-dev/auth` so they continue to follow that package's schema contract instead of copying
and silently diverging from it.

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
reset instead of building temporary dual-schema migration code for a single active user.

### Production reset boundary

Rows in renamed tables do not block deployment merely because the old tables still contain data. The
new schema leaves those tables undeclared, and they can be deleted after the new schema is live.
Deleting them before deployment is unnecessary and does not repair references stored in durable
tables.

Two durable row shapes can block this deployment because they store IDs for renamed operation
tables:

- `vaults.runId` points to the old `appProvisioningRuns` table.
- `users.accountDeletion.runId` points to the old `accountDeletionRuns` table.

Before the production schema dry run, `vaults` must be empty and no `users` row may contain an
`accountDeletion` marker. Finish the corresponding workflow instead of deleting only its operation
run, because the durable row is the schema blocker.

### Operator checklist

Perform these steps in order:

1. Stop starting vault creation or deletion, account deletion, provider connection, MCP
   authorization, editor sync, and machine-link operations until the new schema is live.
2. Export a production snapshot, including file storage. Follow
   [`docs/convex-production-reads.md`](../docs/convex-production-reads.md) so the command cannot
   accidentally select a worktree deployment, then run:

   ```bash
   npx convex export --prod --include-file-storage --path convex-production-pre-table-taxonomy.zip
   ```

3. Finish or resolve every active vault deletion and account deletion. An account deletion in
   `needs_attention` must be retried from `/admin/account-deletions` until the workflow completes
   and the `users.accountDeletion` marker disappears.
4. Verify that `vaults` has no rows and that no `users` row contains `accountDeletion`.
5. Verify that no relevant Workflow, Workpool, or scheduled function is still running. Waiting jobs
   must complete or be cancelled before deployment so old code cannot recreate reset data during the
   cutover.
6. From `apps/samebase`, using the production environment selection from
   [`docs/convex-production-reads.md`](../docs/convex-production-reads.md), require a successful
   schema dry run:

   ```bash
   npx convex deploy --dry-run --yes --typecheck disable --codegen disable
   ```

   Repository type checking and tests remain separate required CI checks. `--typecheck disable`
   prevents the production dry run from duplicating those checks.

7. Merge and deploy the PR. Do not perform writes from an older application deployment during the
   cutover.
8. Confirm that the application loads and the newly named tables exist.
9. Delete the old tables listed below from the Convex dashboard. Keep the production export until
   the reset has been verified.
10. Reconnect or recreate reset state as needed, then test vault creation and deletion, machine
    sync, MCP authorization, and provider connection flows.

### Renamed tables to delete after deployment

Delete the old name only after the new schema is live. The right column identifies the new table
that receives future writes.

| Old table                                | New table                                           |
| ---------------------------------------- | --------------------------------------------------- |
| `accountDeletionRuns`                    | `operations_accountDeletionRuns`                    |
| `accountDeletionEvents`                  | `operations_accountDeletionEvents`                  |
| `agentActionLeases`                      | `operations_agentActionLeases`                      |
| `agentBrowserHandoffs`                   | `operations_mcpBrowserLoginTokens`                  |
| `agentGraphNodeLayout`                   | `ui_agentGraphNodeLayout`                           |
| `machineRegistrationRequests`            | `operations_machineRegistrationRequests`            |
| `machineRegistrationBootstrapRateLimits` | `operations_machineRegistrationBootstrapRateLimits` |
| `machineCredentials`                     | `operations_machineCredentials`                     |
| `machineControlTokens`                   | `operations_machineControlTokens`                   |
| `dashboardSettings`                      | `ui_dashboardSettings`                              |
| `workspaceSidebarState`                  | `ui_workspaceSidebarState`                          |
| `vaultBranchFilters`                     | `ui_vaultBranchFilters`                             |
| `vaultResourceLinksState`                | `ui_vaultResourceLinksState`                        |
| `vaultConvexSchemaSnapshots`             | `observations_vaultConvexSchemaSnapshots`           |
| `vaultConvexSchemaGraphLayouts`          | `ui_vaultConvexSchemaGraphLayouts`                  |
| `vaultRemoteBranches`                    | `observations_vaultRemoteBranches`                  |
| `githubCommitCheckSnapshots`             | `observations_vaultCommitCheckSnapshots`            |
| `githubCommitCheckItems`                 | `observations_vaultCommitChecks`                    |
| `vaultBranchTrees`                       | `observations_vaultBranchTrees`                     |
| `repositoryRefreshRequests`              | `operations_vaultRepositoryRefreshRequests`         |
| `vaultInfrastructureTargets`             | `operations_vaultProvisioningPlans`                 |
| `vaultInfrastructureOwnership`           | `operations_vaultProvisioningWriteLocks`            |
| `appProvisioningRuns`                    | `operations_vaultProvisioningRuns`                  |
| `appProvisioningEvents`                  | `operations_vaultProvisioningEvents`                |
| `vaultDeletionRuns`                      | `operations_vaultDeletionRuns`                      |
| `vaultDeletionEvents`                    | `operations_vaultDeletionEvents`                    |
| `fileStaging`                            | `operations_fileStaging`                            |
| `blobs`                                  | `observations_vaultFileBlobs`                       |
| `folderExpansionState`                   | `ui_folderExpansionState`                           |
| `collaborativeUpdates`                   | `operations_collaborativeFileUpdates`               |
| `oauthStates`                            | `operations_providerOauthCallbackStates`            |
| `aiProdAccessRequests`                   | `operations_aiProductionReadRequests`               |
| `aiProdAccessAudit`                      | `audit_aiProductionReadEvents`                      |
| `mcpAuthRequests`                        | `operations_mcpAuthorizationRequests`               |
| `mcpAuthorizationCodes`                  | `operations_mcpAuthorizationCodes`                  |
| `mcpAccessTokens`                        | `operations_mcpAccessTokens`                        |
| `mcpRefreshTokens`                       | `operations_mcpRefreshTokens`                       |
| `mcpAccessAudit`                         | `audit_mcpAccessEvents`                             |

The reset has these expected operator-visible effects:

- Connected-machine credentials and control tokens are cleared. Run `samebase-sync connect` again.
- MCP access and refresh tokens are cleared. Reauthorize MCP clients.
- Pending provider OAuth callbacks cannot finish. Restart those connection flows.
- Dashboard, workspace sidebar, branch filter, folder expansion, resource-link, and graph-layout
  preferences return to defaults.
- Commit checks, branch trees, remote branches, Convex schema snapshots, and file blob observations
  rebuild when their owning feature runs again.
- Pending provisioning, deletion, repository refresh, collaborative update, and staged-file work is
  discarded.
- Old account-deletion receipts, MCP access events, and AI production-read events remain available
  only in the production export.

Durable `providerConnections`, `connectedMachines`, `mcpOauthClients`, and `mcpGrants` keep their
rows. Resetting their associated operation or token tables does not delete the provider-side
resources they represent.

### Post-deployment verification

The reset is complete when:

- the production schema contains the new table names and none of the old table names
- the app loads without schema-validation or scheduled-function failures
- a new vault can be created and deleted
- machine sync works after reconnecting
- an MCP client can authorize and use a refreshed token
- a provider connection can complete a fresh OAuth flow

The implementation stopping rule is strict:

> If the PR changes what an operation does rather than only where its table is defined and what the
> table is called, move that behavior to another task.
