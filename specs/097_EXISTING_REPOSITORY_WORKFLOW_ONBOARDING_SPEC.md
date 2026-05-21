# Existing Repository Workflow Onboarding Spec

## Document Control

- Status: Accepted implementation reference; Phase 1 and Phase 2 runtime behavior shipped in `v1257`
  / `#733`
- Owner: Noter existing repository onboarding, vault source setup, and provisioning runs
- Created: 2026-05-08
- Last updated: 2026-05-09
- Related docs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `research/2026-05-08-existing-repository-workflow-onboarding.md`

## Summary

Connecting an existing GitHub repository remains one user action. The user chooses or opens a
repository, clicks connect, and then sees one visible setup run on the dashboard until the vault is
usable or clearly failed.

Internally this is not one implementation step. Existing repository connection must move from a
synchronous repository-first action to the same vault-first Workflow shape used by Noter-managed app
creation:

1. create an initializing vault and provisioning run before any GitHub API call
2. fetch and validate the existing GitHub repository inside Workflow
3. write connected GitHub identity before initial tree sync
4. show source setup progress and failure from run/events
5. keep Convex and Cloudflare unconfigured for imported repositories

Manual provider retry remains parked. This spec is only about durable source onboarding for existing
repositories.

## Current Runtime

`vaultActions.connectRepository` is currently synchronous and repository-first:

1. read the current user and GitHub provider connection
2. parse `repositoryFullName`
3. call `repos.get`
4. read the repository default branch
5. call `repos.getBranch`
6. call `git.getTree`
7. insert the connected vault through `internal.vault.addVault`
8. write `vaultBranchTrees`
9. return the connected vault id, canonical repository full name, and default branch

If any GitHub call fails, no vault, run, or provisioning event exists.

Connected existing-repository vault rows currently do not store the run that established the
connection. The target model requires that `runId` directly on connected
`githubMode: "connect_existing_repository"` vaults. No compatibility window is required for old
rows: the operator is the only production user and can delete incompatible existing-repository vault
rows before deploying the required shape.

Dashboard source setup summaries are currently derived for Noter-managed repositories only. Existing
repositories can be connected or stuck without a default-branch tree while `sourceSetup` still reads
as `not_applicable`.

The direct file route currently assumes `connectRepository` returns only after the tree exists.
After this spec, that route cannot immediately navigate to a file workspace, because the action
queues source setup and returns before the default branch tree is ready.

## Goals

1. Keep existing repository connect as one user action.
2. Insert a durable vault and run before external GitHub repository fetches.
3. Use `githubMode: "connect_existing_repository"` for provisioning, failed, and connected
   existing-repository states.
4. Add a dedicated run trigger and step taxonomy for existing repositories.
5. Require connected existing-repository vaults to store the `runId` that established the GitHub
   identity.
6. Preserve connected GitHub identity if initial tree sync fails after the repository is connected.
7. Show source setup running and failed states for existing repositories on the dashboard.
8. Keep provider setup `not_applicable` for existing repositories.
9. Route direct file-view connects to a stable setup surface instead of a blank file route.

## Non-Goals

1. Add manual provider retry UI.
2. Auto-provision Convex or Cloudflare for imported repositories.
3. Make empty repositories usable without a default branch and tree.
4. Change connected GitHub repository identity in place.
5. Build a generic provider framework.
6. Preserve old connected existing-repository production rows.
7. Add a multi-step onboarding wizard.

## Accepted Decisions

### One User Action

The product action is still single-step: click connect once. The app may show a running setup state
after that click, but it must not ask the user to perform a second confirmation or manually start
tree sync.

### Workflow Trigger

Add one provisioning run trigger for this flow:

```ts
type ExistingRepositoryInitialRunTrigger = "connect_existing_repository";
```

`"connect_existing_repository"` is the trigger for the initial import attempt. Do not record the
initial connect as a create-app trigger or as any other existing trigger. This spec does not add,
rename, or depend on provider retry trigger semantics.

### Step Taxonomy

Add a source setup step for repository validation:

```ts
type AppProvisioningStep =
  | "initialize_vault"
  | "validate_connections"
  | "fetch_github_repo"
  | "connect_github"
  | "sync_tree"
  | "finish";
// existing create-app and provider steps remain unchanged
```

The existing-repository workflow should not log `create_github_repo`. It should reuse
`connect_github` once the existing GitHub identity is accepted, and `sync_tree` for the initial
default-branch tree cache write.

Recommended user-facing log copy:

1. `initialize_vault`: "Queued existing repository connection."
2. `validate_connections`: "Checking provider connections."
3. `fetch_github_repo`: "Checking existing GitHub repository."
4. `connect_github`: "Connected the Noter vault to GitHub."
5. `sync_tree`: "Syncing the default branch tree."
6. `finish`: "Connected existing repository."

### Direct Target Shape

Connected existing-repository vaults must store `runId` directly:

```ts
{
  state: "connected",
  githubMode: "connect_existing_repository",
  runId: Id<"appProvisioningRuns">,
  ghRepoId: string,
  owner: string,
  name: string,
  visibility: "private" | "public",
  defaultBranch: string,
  convex: { state: "not_configured" },
  cloudflare: { state: "not_configured" },
  connectedAt: number,
}
```

Do not add optional `runId`, synthetic historical runs, backfills, dual reads, or transitional
helpers for old connected existing-repository rows. Before the schema narrows, delete incompatible
production rows and any dependent vault-scoped rows that would fail validation.

### File Route UX

After "Connect this repo" is clicked from a direct file route, successful queue creation navigates
to the dashboard. The dashboard card is the setup surface for the queued run and provisioning log.

The file route should not try to render a repository workspace until the vault is connected and the
requested branch tree exists. A future inline file-route setup surface can be designed later if the
dashboard handoff feels too indirect.

### Empty Or Unreadable Repositories

An existing repository is accepted only after GitHub returns repository identity, visibility, a
default branch, and default branch metadata. Empty repositories, inaccessible default branches,
OAuth organization restrictions, rate limits, and deleted repositories fail source setup before
connected state.

The failed vault stores the requested `owner/name`, `runId`, and failed time. The user-safe reason
comes from provisioning events, not from a duplicated vault field.

### Connected Boundary

The workflow writes connected GitHub state before initial tree sync. From that point forward, tree
sync failure must not move the vault back to top-level `failed`.

A connected existing-repository vault without a usable default-branch tree is a connected vault with
failed source setup. Dashboard and route code must keep tree-dependent controls hidden until the
tree exists.

### Provider Setup Boundary

Existing repositories do not auto-provision Convex or Cloudflare. Connected existing-repository rows
initialize both provider states as `not_configured`, and dashboard provider setup remains
`not_applicable`.

## Target Flow

### Action

`vaultActions.connectRepository` becomes a queueing action:

1. authenticate the user
2. parse and validate the requested `owner/name` locally
3. check the local GitHub connection row
4. reject another non-deleted vault for the same normalized `owner/name`
5. insert the initializing vault and provisioning run in one mutation
6. start the connect-existing Workflow
7. return `{ vaultId, runId }`

Local validation can fail inline before insert. External GitHub API validation must happen after the
vault and run exist.

### Workflow

The connect-existing Workflow runs:

1. `validate_connections`: load the GitHub connection and fail the run if it is missing or unusable
2. `fetch_github_repo`: fetch the repository, default branch, branch commit, visibility, and
   immutable GitHub repository id
3. reject the run if the fetched `ghRepoId` belongs to another connected vault for the same user
4. `connect_github`: patch this vault to connected GitHub state with the same `runId`, canonical
   owner/name, visibility, default branch, and `not_configured` provider states
5. `sync_tree`: fetch and write the recursive default-branch tree into `vaultBranchTrees`
6. `finish`: mark the run succeeded

The repository fetch step should treat repo identity and default branch validation as one accepted
input shape. If that validation fails, the workflow records a failed source setup without writing
partial GitHub identity to the vault.

### Failure Handling

Before `connect_github` succeeds, a workflow failure moves the vault to:

```ts
{
  state: "failed",
  githubMode: "connect_existing_repository",
  runId: Id<"appProvisioningRuns">,
  owner: string,
  name: string,
  failedAt: number,
}
```

After `connect_github` succeeds, a workflow failure keeps the vault connected. The run becomes
failed and source setup derives the failed step and message from run/events.

Starting the Workflow can also fail. In that case the queueing action must mark the run and
initializing vault failed before returning an error response. The client only performs the dashboard
handoff after the queueing action returns successfully.

## Duplicate And Idempotency Rules

1. Before insert, reject another active vault for the same user and normalized requested
   `owner/name`.
2. After GitHub fetch, reject if the fetched `ghRepoId` belongs to a different connected vault for
   the same user.
3. If a workflow retries internally for the same `vaultId` and `runId`, it may continue only when
   the existing connected vault has the same `ghRepoId`.
4. Never mutate one connected vault to point at a different `ghRepoId`.
5. Persist GitHub's canonical owner/name casing after fetch; use normalized owner/name only for
   duplicate comparison.

## Dashboard Behavior

The dashboard should show the initializing vault immediately after queueing.

Existing-repository source setup applies to:

1. provisioning existing-repository vaults
2. failed existing-repository vaults
3. connected existing-repository vaults whose establishing run is still running or failed before the
   first usable default-branch tree exists

The `sourceSetup` summary should use the same shape already used for create-app source setup:

```ts
type SourceSetupSummary =
  | { status: "not_applicable" }
  | { status: "ready" }
  | {
      status: "running";
      runId: Id<"appProvisioningRuns">;
      step: AppProvisioningRunStep;
      updatedAt: number;
    }
  | {
      status: "failed";
      runId: Id<"appProvisioningRuns">;
      step: AppProvisioningRunStep;
      message: string;
      updatedAt: number;
    };
```

Provider setup stays `not_applicable` for existing repositories even after GitHub connects, because
imported repositories do not provision infrastructure.

Tree-dependent links, branch rows, source workspace entrypoints, staging, editor, chat, and
infrastructure controls remain hidden until the default-branch tree exists.

## Entry Points

### `/add`

When the user clicks Connect:

1. disable the clicked button while the queueing action is pending
2. queue the initializing vault and run
3. navigate to the dashboard after the run is queued
4. let the dashboard show setup progress and failure

The repository picker should hide repositories that already have an initializing, failed, or
connected vault for the same `repositoryFullName`. Failed vaults remain visible on the dashboard
with the existing delete action. Phase 1 does not add manual retry UX; deleting the failed vault is
the explicit operator path that unblocks a fresh connect attempt for the same repository.

### Direct File Route

When the user opens an unconnected repository URL and clicks Connect this repo:

1. queue the initializing vault and run
2. navigate to the dashboard after the run is queued
3. avoid rendering blank file-route content while the branch tree does not exist

The queueing action no longer needs to return `defaultBranch`, because the file route is not the
immediate post-click destination.

## Production Cleanup

Before deploying the schema that requires connected existing-repository `runId`, inspect production
for `githubMode: "connect_existing_repository"` vaults without `runId`.

Because the operator is the only production user, the accepted cleanup is:

1. delete those existing-repository vaults
2. delete dependent vault-scoped rows for those vaults
3. deploy the direct required schema and code
4. reconnect the repositories through the new flow if still needed

This cleanup is operator action, not product behavior. Do not hide destructive cleanup inside normal
user flows.

## Implementation Plan

Phase 1 and Phase 2 runtime behavior shipped together in `v1257` / `#733`. Keep this checklist as
the landed behavior contract, not as still-open runtime scope.

### Phase 1: Backend Workflow And Direct State

1. Add `connect_existing_repository` to `AppProvisioningRunTrigger`.
2. Add `fetch_github_repo` to provisioning step validators and log formatting.
3. Require `runId` on connected existing-repository vaults.
4. Add the initializing-vault/run mutation for existing repositories.
5. Replace synchronous `connectRepository` with the queueing action.
6. Add the connect-existing Workflow and failure handling.
7. Keep Convex and Cloudflare state `not_configured`.
8. Add backend tests for success, pre-connected failure, post-connected tree failure, duplicates,
   and required `runId`.

### Phase 2: Dashboard And Entrypoints

1. Return source setup summaries for existing-repository setup states.
2. Render the provisioning log for existing-repository running and failed source setup.
3. Update `/add` to navigate to the dashboard after queueing.
4. Update the direct file route to navigate to the dashboard after queueing.
5. Ensure file-route content stays hidden until branch tree data exists.
6. Add route-level or production-component tests for dashboard source setup and direct-route
   handoff.

These phases may land in one implementation PR if the diff stays small and the tests cover both
backend and UI behavior. They should split if the route and dashboard changes obscure the
state-machine review.

## Testing Plan

Backend:

1. connecting an existing repository inserts a vault before external GitHub fetches
2. the run uses trigger `connect_existing_repository`
3. successful connect writes connected existing-repository state with `runId`, `ghRepoId`, canonical
   owner/name, visibility, default branch, and `not_configured` providers
4. pre-connected GitHub fetch or validation failure moves the vault to failed existing-repository
   state
5. tree sync failure after connected state preserves connected GitHub identity
6. connected existing-repository rows require `runId`
7. duplicate `owner/name` and duplicate `ghRepoId` cases fail closed
8. existing repositories never start Convex or Cloudflare provisioning

Frontend:

1. `/add` hides a repository once its initializing vault exists
2. `/add` disables only the pending repository connect action and navigates to the dashboard after
   queueing
3. dashboard shows running source setup and provisioning logs for existing repositories
4. dashboard shows failed source setup and the latest event-derived failure message for existing
   repositories
5. direct file-route connect navigates to the dashboard instead of returning to a blank file route
6. tree-dependent controls stay hidden until a usable default-branch tree exists

## Acceptance Criteria

1. Existing repository connect is one user action.
2. A durable vault and run exist before external GitHub repository fetches.
3. The initial run is classified as `connect_existing_repository`.
4. Existing-repository logs distinguish fetching an existing repo from creating a new repo.
5. Connected existing-repository state stores the run that established GitHub identity.
6. Old connected existing-repository rows are removed before the direct required schema deploy; no
   compatibility path is added.
7. Initial tree sync failure after connection does not erase connected GitHub identity.
8. Existing-repository source setup is visible from the dashboard.
9. Existing-repository provider setup remains not applicable.
10. The direct file route does not go blank during queued source setup.
