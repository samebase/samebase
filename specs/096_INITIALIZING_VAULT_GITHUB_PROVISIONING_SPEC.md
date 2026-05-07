# Initializing Vault GitHub Provisioning Spec

## Document Control

- Status: Accepted next-phase implementation plan
- Owner: Noter app creation, existing repository onboarding, and vault model
- Created: 2026-05-07
- Related docs:
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `research/2026-05-06-vault-first-provisioning-model.md`

## Summary

Create a vault before GitHub provisioning completes, but only as an initializing
provisioning shell. The vault is the durable dashboard object for progress,
failure, and retry. It is not a usable repository workspace until its GitHub
state is explicitly connected.

This replaces the Phase 3 pre-vault run gap with a stable `vaultId` while
preserving the strong invariant that repository-backed behavior requires a
connected GitHub repository.

## Current Problem

The current Phase 3 runtime creates an `appProvisioningRuns` row before a vault
exists, then creates the vault only after GitHub repository creation, starter
seeding, and tree fetch succeed.

That means failures before `create_vault` are durable in run/event tables, but
they do not have the dashboard object users naturally expect to inspect and
retry. It also pushes future existing-repository onboarding toward a separate
shape, even though both flows need the same GitHub connection lifecycle.

## Goals

1. Create a durable vault row before external GitHub provisioning work starts.
2. Represent GitHub connection state as a required discriminated union.
3. Use the same GitHub state machine for Noter-managed repository creation and
   existing-repository connection.
4. Keep repository-backed features gated on connected GitHub state.
5. Make manual retry target one failed provider state on one vault.
6. Keep operation-specific fields inside the matching provisioning or failed
   variant.

## Non-Goals

1. Make repo-less vaults usable as source workspaces.
2. Allow changing the connected GitHub repository identity in place.
3. Build a generic provider framework.
4. Redesign unrelated editor, file staging, branch, PR, or Codespaces flows
   beyond the required connected-GitHub guard.
5. Add automatic Workflow restart-from-failed-step before manual provider-state
   retry semantics are clear.

## Vault Invariant

A vault may exist before GitHub is connected, but repository-backed behavior
must require connected GitHub state.

These behaviors must fail closed or stay hidden unless
`vault.github.state === "connected"`:

1. file tree reads
2. file staging
3. collaborative edits
4. branch metadata refresh
5. pull request metadata
6. GitHub Codespaces
7. commits and media uploads
8. infrastructure steps that require GitHub repository identity

Once a vault reaches connected GitHub state, its `ghRepoId` is immutable. If the
user wants to use a different repository, the product must create a new vault or
archive the old vault instead of mutating repository identity under existing
repo-bound data.

## State Model

Use required discriminated state objects instead of optional scattered provider
fields.

Conceptual shape:

```ts
vaults: {
  userId: Id<"users">;
  name: string;
  lifecycleState:
    | "creating"
    | "active"
    | "degraded"
    | "failed"
    | "archived";
  isNoterManaged: boolean;
  github: VaultGitHubState;
  convex: VaultConvexState;
  hosting: VaultHostingState;
  createdAt: number;
  updatedAt: number;
}
```

GitHub state:

```ts
type VaultGitHubState =
  | {
      state: "not_connected";
    }
  | {
      state: "provisioning";
      mode: "create_repository";
      runId: Id<"appProvisioningRuns">;
      requestedRepoName: string;
      visibility: "private" | "public";
      startedAt: number;
    }
  | {
      state: "provisioning";
      mode: "connect_existing_repository";
      runId: Id<"appProvisioningRuns">;
      repositoryFullName: string;
      startedAt: number;
    }
  | {
      state: "connected";
      connectionKind: "noter_managed" | "existing_repository";
      ghRepoId: string;
      owner: string;
      name: string;
      defaultBranch: string;
      treeSHA: string;
      commitSHA: string;
      connectedAt: number;
    }
  | {
      state: "failed";
      mode: "create_repository" | "connect_existing_repository";
      runId: Id<"appProvisioningRuns">;
      repositoryLabel: string;
      message: string;
      retryable: boolean;
      failedAt: number;
    };
```

Connected GitHub state describes repository identity. Provisioning and failed
states describe the current operation. Existing-repo connection must not carry
fake create-only fields such as requested visibility.

Convex and hosting should follow the same discriminated-state pattern:

1. `not_configured`
2. `provisioning`
3. `connected`
4. `failed`

Provider payloads that are large, frequently refreshed, or branch-specific
should live in provider-owned child tables. The connected GitHub state should
identify the repository and default branch; it should not force every branch
tree payload to remain inline on the vault forever.

## Create New App Flow

For Noter-managed repository creation:

1. validate local input shape
2. insert the vault with `lifecycleState: "creating"` and
   `github.state: "provisioning", mode: "create_repository"`
3. insert the provisioning run with required `vaultId`
4. start the create-app Workflow
5. create the GitHub repository
6. seed the starter app
7. sync default branch and tree state
8. write `github.state: "connected", connectionKind: "noter_managed"`
9. provision Convex and hosting provider state
10. mark the vault `active`, `degraded`, or `failed`

External provider validation happens after the vault exists so failures have a
visible dashboard target. Local input validation can happen before insert when
it does not require provider calls.

## Existing Repository Flow

Connecting an existing repository must use the same vault/run/GitHub state
model:

1. validate local repository name shape
2. insert the vault with `lifecycleState: "creating"` and
   `github.state: "provisioning", mode: "connect_existing_repository"`
3. insert the provisioning run with required `vaultId`
4. start a connect-existing Workflow
5. fetch and validate the existing GitHub repository
6. sync default branch and tree state
7. write `github.state: "connected", connectionKind: "existing_repository"`
8. leave Convex and hosting `not_configured` unless the product explicitly asks
   to provision them
9. mark the vault `active` or `failed`

This flow is currently an action. Moving it to Workflow is part of this model so
existing-repo onboarding gets the same observability and retry surface as
Noter-managed repository creation.

## Provisioning Runs

New create and connect workflows should create runs with a required `vaultId`.
The Phase 3 `vaultId: null` run state remains historical compatibility for the
repository-first runtime and should not be the target shape for this phase.

Run and event helpers should continue to record user-safe status only. Secrets,
tokens, env values, deploy keys, request headers, and raw provider payloads
remain forbidden in run/event records.

## Dashboard Behavior

The dashboard should render the vault immediately after insert.

Provider rows should read from explicit state:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: not configured, provisioning, connected, failed
3. Hosting: not configured, provisioning, connected, failed

Repo-backed controls should stay hidden or disabled until GitHub is connected.
Manual retry buttons should target the failed provider state on that vault.

## Migration

The normal Convex path is widen, migrate, and narrow because existing vault rows
currently require GitHub fields. If production vaults must be preserved, use the
standard multi-deploy migration.

Because Noter currently has one real operator/user and the operator is willing
to remove existing production vaults, this phase may use a direct reset
shortcut:

1. explicitly delete vault-scoped production data through an operator-approved
   cleanup
2. deploy the new required state shape
3. update current call sites directly without old/new vault compatibility

The reset must include dependent vault-scoped tables, not only `vaults`. Likely
affected tables include:

1. `vaultBranchFilters`
2. `vaultRemoteBranches`
3. `vaultBranchTrees`
4. `vaultInfrastructure`
5. `vaultInfrastructureOwnership`
6. `appProvisioningRuns`
7. `appProvisioningEvents`
8. `vaultDomains`
9. `codespaces`
10. `fileStaging`
11. `blobs`
12. `folderExpansionState`
13. `agentGraphNodeLayout`
14. `agentThreadContext`
15. `aiProdAccessRequests`
16. `collaborativeUpdates`

The cleanup must fail closed and must not be hidden inside the product flow.

## Implementation Sequence

1. Define `VaultGitHubState`, `VaultConvexState`, `VaultHostingState`, and
   `VaultLifecycleState` validators.
2. Add a typed helper for code paths that require connected GitHub state.
3. Move root vault identity away from required top-level `ghRepo*` fields.
4. Update create-app to insert the initializing vault before starting provider
   work.
5. Update app provisioning runs/events so new create/connect runs require
   `vaultId`.
6. Update create-app Workflow steps to mutate GitHub, Convex, and hosting state
   as steps start, succeed, or fail.
7. Move existing-repository connection onto Workflow using the same GitHub state
   model.
8. Update dashboard queries and controls to render provider states and gate
   repo-backed actions.
9. Add provider-specific retry actions for failed provider state.
10. Revisit Workflow restart-from-failed-step only after the manual provider
    retry model is working.

## Testing Plan

Backend:

1. create-app inserts a vault before external GitHub calls
2. create-app run is created with required `vaultId`
3. create-app success writes connected Noter-managed GitHub state
4. create-app GitHub failure writes failed GitHub state on the vault
5. existing-repo connection writes connected existing-repository GitHub state
6. connected GitHub identity cannot change to a different `ghRepoId`
7. repo-backed helpers reject pre-GitHub vaults

Frontend:

1. dashboard shows initializing vault provider state
2. repo-backed controls are hidden or disabled before GitHub connection
3. failed GitHub state shows a retry target on the vault
4. existing-repo connected vault renders like other connected vaults after the
   GitHub state is connected

## Acceptance Criteria

1. New Noter-managed app creation has a visible vault before GitHub provisioning
   completes.
2. Existing-repository connection uses the same GitHub state model.
3. Repo-backed features cannot run against pre-GitHub vaults.
4. Connected GitHub repository identity is immutable.
5. Failed provider states are visible and retryable from the vault.
