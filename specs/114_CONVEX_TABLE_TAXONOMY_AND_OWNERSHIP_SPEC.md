# Convex Table Taxonomy And Ownership Spec

Status: Accepted

## Goal

Make the application database understandable from two views:

1. table names show what kind of state a supporting table stores
2. feature model files show complete related table definitions together

This is a schema organization change. It does not change row shapes, indexes, workflows, provider
behavior, UI behavior, authorization, deletion behavior, or recovery behavior.

## Table Name Taxonomy

Concrete product, protocol, authorization, synchronization, and work-queue tables keep normal plural
names. A table is not put into a generic bucket merely because its rows are temporary or mutable.

Only these storage categories use a visible prefix:

- `workflow_`: state whose sole reason to exist is executing, recovering, or inspecting one named
  multi-step workflow
- `observations_`: captured provider or remote-system facts
- `derived_`: projections that can be rebuilt completely from other local rows
- `audit_`: append-only occurrences that production behavior never reads to authorize, decide,
  recover, or render live state
- `ui_`: persisted presentation settings, filters, expansions, or layouts

`operations_` is not a category because it catches unrelated protocol state, credentials, queues,
leases, synchronization rows, and workflows. `data_` is not a category because it makes primary
product facts look like another interchangeable storage class.

An events table is `audit_` only when removing all of its rows would not change current production
behavior. Provisioning, vault-deletion, and account-deletion events remain `workflow_` because live
behavior reads them. GitHub commit-check summaries are `derived_` because they are computed entirely
from the observed per-check rows. Convex schema snapshots and Git blobs remain observations because
they retain provider material that cannot be rebuilt from other local tables.

## Table Naming Rules

A prefixed name has the grammar `<category>_<subject>_<rowKind>`. Underscores mark those semantic
boundaries; camelCase joins multiple words inside one level. For example,
`workflow_vaultDeletion_events` is a workflow table, belongs to vault deletion, and contains event
rows. Keeping the subject before the row kind makes one feature's tables remain adjacent.

Unprefixed tables use one concrete plural camelCase name. Generic lifecycle nouns come from the
closed vocabulary in `docs/data-modeling-vocabulary.md`. A new generic noun must be defined there in
the same change.

Use concrete nouns instead of relational placeholders. In particular, persisted rows are not named
`target`, `ownership`, `claim`, `handoff`, `item`, `record`, `data`, `history`, or bare `state`.
Protocol-defined and product nouns remain valid when they have one precise meaning.

Every supporting-table definition starts with a plain-language comment that identifies one row and
why live behavior needs it. When the producer or consumer is not obvious, the comment names the
actual command, service, provider, or user action. It expands domain-specific terms instead of
repeating them. For example, a provisioning-plan comment says which choices it preserves and why
retries read them; "provisioning state" is not a definition.

### Unprefixed tables

```text
authSessions
authAccounts
authRefreshTokens
authVerificationCodes
authVerifiers
authRateLimits
users
agentActionLeases
providerConnections
providerOAuthCallbackStates
connectedMachines
machineRegistrationRequests
machineRegistrationRateLimits
machineCredentials
machineControlTokens
vaults
vaultApps
vaultCloudflareWorkers
vaultConvexProjects
vaultDomains
vaultRepositoryRefreshRequests
vaultStagedFiles
vaultStagedFileUpdates
codespaces
chatThreadContexts
chatMessagePayloads
aiProductionReadRequests
mcpOauthClients
mcpAuthorizationRequests
mcpAuthorizationCodes
mcpGrants
mcpAccessTokens
mcpRefreshTokens
mcpBrowserLoginTokens
```

### Workflow tables

```text
workflow_accountDeletion_runs
workflow_accountDeletion_events
workflow_vaultProvisioning_plans
workflow_vaultProvisioning_writeLocks
workflow_vaultProvisioning_runs
workflow_vaultProvisioning_events
workflow_vaultDeletion_runs
workflow_vaultDeletion_events
```

### Observation tables

```text
observations_vaultRepository_branches
observations_githubCommit_checks
observations_vaultRepository_branchTrees
observations_vaultConvexSchema_snapshots
observations_vaultFiles_blobs
```

### Derived tables

```text
derived_githubCommit_checkSummaries
```

### UI tables

```text
ui_user_settings
ui_workspaceSidebar_layouts
ui_vaultBranches_filters
ui_vaultResourceLinks_settings
ui_vaultConvexSchemaGraph_nodeLayouts
ui_vaultFileTree_folderExpansions
ui_agentGraphNode_layouts
```

### Audit tables

```text
audit_aiProductionRead_events
audit_mcpAccess_events
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
githubCommitCheckTables
vaultConvexSchemaGraphTables
vaultRepositoryRefreshTables
vaultProvisioningTables
vaultDeletionTables
codespacesTables
vaultEditorTables
chatTables
aiProductionReadTables
mcpTables
```

Vault-adjacent features remain separate when they have their own lifecycle. Editor staging,
repository refresh, provisioning, deletion, chat, agent state, Codespaces, and MCP do not become
members of `vaultTables` merely because they reference a vault.

## Definition Shape

Each table object shows complete row fields and indexes at the ownership site:

```ts
export const userPreferenceTables = {
  ui_user_settings: defineTable({
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
export type DashboardSettings = Infer<typeof userPreferenceTables.ui_user_settings.validator>;
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

Two durable row shapes can block this deployment because they store IDs for renamed workflow tables:

- `vaults.runId` points to the old `appProvisioningRuns` table.
- `users.accountDeletion.runId` points to the old `accountDeletionRuns` table.

Before the production schema dry run, `vaults` must be empty and no `users` row may contain an
`accountDeletion` marker. Finish the corresponding workflow instead of deleting only its workflow
run, because the durable row is the schema blocker.

### Operator checklist

Perform these steps in order:

1. Stop starting vault creation or deletion, account deletion, provider connection, MCP
   authorization, editor sync, and machine-link operations until the new schema is live.
2. In the production deployment's Convex Dashboard, open Backup & Restore, create a manual backup
   with file storage included, and wait for it to finish. Dashboard backups stay outside the
   repository and can be restored directly. See the
   [Convex Backup & Restore documentation](https://docs.convex.dev/database/backup-restore).

3. Finish or resolve every active vault deletion and account deletion. An account deletion in
   `needs_attention` must be retried from `/admin/account-deletions` until the workflow completes
   and the `users.accountDeletion` marker disappears.
4. Verify that `vaults` has no rows and that no `users` row contains `accountDeletion`.
5. Verify that no relevant Workflow, Workpool, or scheduled function is still running. Waiting jobs
   must complete or be cancelled before deployment so old code cannot recreate reset data during the
   cutover.
6. From this candidate branch's `apps/samebase` directory, derive only the production deployment
   name from the primary checkout, clear `CONVEX_DEPLOY_KEY`, and require a successful schema dry
   run. Running this from the primary checkout would test `main`, not the candidate schema.

   ```bash
   primary_checkout="$(
     git worktree list --porcelain |
       awk '$1 == "worktree" { worktree=$2 } $1 == "branch" && $2 == "refs/heads/main" { print worktree; exit }'
   )"
   production_deployment="$(
     node -e '
       const fs = require("node:fs");
       const line = fs
         .readFileSync(process.argv[1], "utf8")
         .split(/\n/)
         .find((entry) => entry.trimStart().startsWith("CONVEX_DEPLOYMENT="));
       if (!line) process.exit(2);
       const value = line.split("=").slice(1).join("=");
       console.log(value.replace(/\s+#.*$/, "").trim().replace(/^[\x27\x22]|[\x27\x22]$/g, ""));
     ' "$primary_checkout/apps/samebase/.env.local"
   )"
   CONVEX_DEPLOYMENT="$production_deployment" CONVEX_DEPLOY_KEY= \
     npx convex deploy --dry-run --yes --typecheck disable --codegen disable
   ```

   Repository type checking and tests remain separate required CI checks. `--typecheck disable`
   prevents the production dry run from duplicating those checks.

7. Merge and deploy the PR. Do not perform writes from an older application deployment during the
   cutover.
8. Confirm that the application loads and the newly named tables exist.
9. Delete the old tables listed below from the Convex dashboard. Keep the production backup until
   the reset has been verified.
10. Recreate reset preferences or pending work only when needed, then test vault creation and
    deletion, machine sync, MCP authorization, and provider connection flows.

### Renamed tables to delete after deployment

Delete the old name only after the new schema is live. The right column identifies the new table
that receives future writes.

Deleting every vault removes the renamed vault-local rows, but it does not empty every renamed
table. Before deployment, expect these old tables may still contain rows: `accountDeletionRuns`,
`accountDeletionEvents`, `agentBrowserHandoffs`, `machineRegistrationBootstrapRateLimits`,
`dashboardSettings`, `workspaceSidebarState`, `githubCommitCheckSnapshots`,
`githubCommitCheckItems`, `vaultDeletionRuns`, `vaultDeletionEvents`, `oauthStates`,
`aiProdAccessRequests`, `aiProdAccessAudit`, `mcpAuthRequests`, `mcpAccessAudit`,
`agentThreadContext`, and `chatMessageMetadata`. They do not need an in-place migration under this
one-user reset, but their contents remain available only in the backup after the old tables are
deleted.

| Old table                                | New table                                  |
| ---------------------------------------- | ------------------------------------------ |
| `accountDeletionRuns`                    | `workflow_accountDeletion_runs`            |
| `accountDeletionEvents`                  | `workflow_accountDeletion_events`          |
| `agentBrowserHandoffs`                   | `mcpBrowserLoginTokens`                    |
| `agentGraphNodeLayout`                   | `ui_agentGraphNode_layouts`                |
| `machineRegistrationBootstrapRateLimits` | `machineRegistrationRateLimits`            |
| `dashboardSettings`                      | `ui_user_settings`                         |
| `workspaceSidebarState`                  | `ui_workspaceSidebar_layouts`              |
| `vaultBranchFilters`                     | `ui_vaultBranches_filters`                 |
| `vaultResourceLinksState`                | `ui_vaultResourceLinks_settings`           |
| `vaultConvexSchemaSnapshots`             | `observations_vaultConvexSchema_snapshots` |
| `vaultConvexSchemaGraphLayouts`          | `ui_vaultConvexSchemaGraph_nodeLayouts`    |
| `vaultRemoteBranches`                    | `observations_vaultRepository_branches`    |
| `githubCommitCheckSnapshots`             | `derived_githubCommit_checkSummaries`      |
| `githubCommitCheckItems`                 | `observations_githubCommit_checks`         |
| `vaultBranchTrees`                       | `observations_vaultRepository_branchTrees` |
| `repositoryRefreshRequests`              | `vaultRepositoryRefreshRequests`           |
| `vaultInfrastructureTargets`             | `workflow_vaultProvisioning_plans`         |
| `vaultInfrastructureOwnership`           | `workflow_vaultProvisioning_writeLocks`    |
| `appProvisioningRuns`                    | `workflow_vaultProvisioning_runs`          |
| `appProvisioningEvents`                  | `workflow_vaultProvisioning_events`        |
| `vaultDeletionRuns`                      | `workflow_vaultDeletion_runs`              |
| `vaultDeletionEvents`                    | `workflow_vaultDeletion_events`            |
| `fileStaging`                            | `vaultStagedFiles`                         |
| `blobs`                                  | `observations_vaultFiles_blobs`            |
| `folderExpansionState`                   | `ui_vaultFileTree_folderExpansions`        |
| `collaborativeUpdates`                   | `vaultStagedFileUpdates`                   |
| `oauthStates`                            | `providerOAuthCallbackStates`              |
| `aiProdAccessRequests`                   | `aiProductionReadRequests`                 |
| `aiProdAccessAudit`                      | `audit_aiProductionRead_events`            |
| `mcpAuthRequests`                        | `mcpAuthorizationRequests`                 |
| `mcpAccessAudit`                         | `audit_mcpAccess_events`                   |
| `agentThreadContext`                     | `chatThreadContexts`                       |
| `chatMessageMetadata`                    | `chatMessagePayloads`                      |

The reset has these expected operator-visible effects:

- Existing connected-machine credentials and control tokens keep working because those table names
  do not change. Only the unauthenticated registration rate-limit counters reset.
- Existing MCP clients, grants, authorization codes, access tokens, and refresh tokens keep working
  because those table names do not change. Pending browser approvals and audit events reset.
- Pending provider OAuth callbacks cannot finish. Restart those connection flows.
- Dashboard, workspace sidebar, branch filter, folder expansion, resource-link, and graph-layout
  preferences return to defaults.
- Commit checks, branch trees, remote branches, Convex schema snapshots, and file blob observations
  rebuild when their owning feature runs again.
- Pending provisioning, deletion, repository refresh, collaborative update, and staged-file work is
  discarded.
- Dormant chat thread context and message payload rows remain available only in the backup.
- Old account-deletion receipts, MCP access events, and AI production-read events remain available
  only in the production backup.

Durable `providerConnections`, `connectedMachines`, `mcpOauthClients`, and `mcpGrants` keep their
rows. The rename does not delete the provider-side resources they represent.

### Post-deployment verification

The reset is complete when:

- the production schema contains the new table names and none of the old table names
- the app loads without schema-validation or scheduled-function failures
- a new vault can be created and deleted
- machine sync still works with the existing credential
- an MCP client can still authorize a request with its existing token
- a provider connection can complete a fresh OAuth flow

The implementation stopping rule is strict:

> If the PR changes what an operation does rather than only where its table is defined and what the
> table is called, move that behavior to another task.
