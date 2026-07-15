# Initializing Vault GitHub Provisioning Spec

## Document Control

- Status: Accepted next-phase implementation plan
- Owner: Samebase app creation, existing repository onboarding, and vault model
- Created: 2026-05-07
- Related docs:
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `rfcs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `research/2026-05-06-vault-first-provisioning-model.md`

## Summary

Create a vault before GitHub provisioning completes, but only as an initializing provisioning shell.
The vault is the durable dashboard object for progress, failure, and retry. It is not a usable
repository workspace until its GitHub state is explicitly connected.

This replaces the pre-vault run gap with a stable `vaultId` while preserving the strong invariant
that repository-backed behavior requires a connected GitHub repository. GitHub connection means
durable repository identity, not a fresh branch tree. Branch tree data is cache state and
repo-backed file/tree behavior must still fail closed until the relevant branch snapshot exists.
Convex and Cloudflare app-root resource rows only exist for connected GitHub vaults, so those
integrations cannot exist while GitHub is still provisioning or failed.

After the vault-first creation path is visible and understandable, remove the temporary
compatibility layers before treating manual retry UI as proof of the durable model. The primary
product promise is still simple: the user clicks New App and either gets a usable app or a clear
setup failure.

## Current Problem

The pre-vault-first runtime creates an `appProvisioningRuns` row before a vault exists, then creates
the vault only after GitHub repository creation, starter seeding, and tree fetch succeed.

That means failures before `create_vault` are durable in run/event tables, but they do not have the
dashboard object users naturally expect to inspect and retry. It also pushes future
existing-repository onboarding toward a separate shape, even though both flows need the same GitHub
connection lifecycle.

## Goals

1. Create a durable vault row before external GitHub provisioning work starts.
2. Represent GitHub connection state as a required discriminated union.
3. Use the same GitHub state machine for Samebase-managed repository creation and
   existing-repository connection.
4. Keep Convex and Cloudflare state present only on connected GitHub variants.
5. Keep repository-backed features gated on connected GitHub state.
6. Keep failures structured enough that a later retry action can target one failed provider state on
   one vault.
7. Keep operation-specific fields inside the matching provisioning or failed variant.
8. Give every temporary compatibility layer an explicit removal phase before adding optional UI
   proof surfaces on top of it.

## Non-Goals

1. Make repo-less vaults usable as source workspaces.
2. Allow changing the connected GitHub repository identity in place.
3. Build a generic provider framework.
4. Redesign unrelated editor, file staging, branch, PR, or Codespaces flows beyond the required
   connected-GitHub guard.
5. Add generic user-facing retry before source setup visibility and compatibility cleanup are
   complete.
6. Add automatic restart-from-failed-step controls. Step-local backend retries for idempotent
   provider work are still in scope after visibility is clear.

## Vault Invariant

A vault may exist before GitHub is connected, but repository-backed behavior must require connected
GitHub state.

These behaviors must fail closed or stay hidden unless `vault.state === "connected"`:

1. file tree reads
2. file staging
3. collaborative edits
4. branch metadata refresh
5. pull request metadata
6. GitHub Codespaces
7. commits and media uploads
8. infrastructure steps that require GitHub repository identity

Once a vault reaches connected GitHub state, its `ghRepoId` is immutable. If the user wants to use a
different repository, the product must create a new vault or archive the old vault instead of
mutating repository identity under existing repo-bound data.

The top-level GitHub state is also one-way after connection. Repository access problems, deleted
repos, permission loss, branch refresh failures, Convex failures, and Cloudflare failures must not
transition a connected vault to top-level `failed`. Model those as connected-only provider state,
child-table operational state, or derived dashboard summaries while preserving the connected GitHub
identity.

## State Model

Use required discriminated state objects instead of optional scattered provider fields.

Conceptual shape:

```ts
/** Persisted vault row: base fields plus exactly one source-workspace state. */
type VaultRow = VaultBase & VaultGitHubState;

/** Fields every vault row has regardless of GitHub connection state. */
type VaultBase = {
  /** Ownership and authorization boundary for the vault. */
  userId: Id<"users">;
};
```

The TypeScript mental model can be `VaultBase & VaultGitHubState`. The Convex schema should still
define `vaults` as a union of complete row validators that share the base fields, because the
validator API represents persisted discriminated unions as concrete object variants.

Do not store an overall `lifecycleState` for `creating`, `active`, `degraded`, or `failed`. Those
are dashboard summaries derived from the provider states. Keeping both a top-level lifecycle and
provider state would create two sources of truth that can drift. If the product later needs a
user-controlled state such as archive/hide, model that as a separate explicit field instead of
mixing it with provisioning health.

GitHub state:

```ts
/**
 * GitHub is the gate for a vault becoming a usable source workspace.
 * These fields live on the vault row itself; `state` is top-level because
 * GitHub is the source-workspace state of the vault.
 */
/** GitHub visibility values currently supported by Samebase's create flow. */
type GitHubRepositoryVisibility = "private" | "public";

/**
 * GitHub repository owner/name pair.
 * The enclosing state defines whether this is requested, targeted, or confirmed.
 */
type GitHubRepositoryCoordinates = {
  /** GitHub user or organization owner. */
  owner: string;

  /** GitHub repository name. */
  name: string;
};

/**
 * Repository coordinates plus visibility.
 * Used for requested create intent and connected GitHub metadata.
 */
type GitHubRepositoryWithVisibility = GitHubRepositoryCoordinates & {
  /** Repository visibility, either requested intent or current GitHub metadata. */
  visibility: GitHubRepositoryVisibility;
};

type VaultGitHubState =
  | {
      /** Explicit empty state for future manual connection flows. */
      state: "not_connected";
    }
  | ({
      /** GitHub repository creation is in progress for this vault. */
      state: "provisioning";

      /**
       * Distinguishes create-repo provisioning from existing-repo connection.
       * This is named for GitHub because the vault row is flattened.
       */
      githubMode: "create_repository";

      /** Durable run that owns the in-flight create-repository operation. */
      runId: Id<"appProvisioningRuns">;

      /** Timestamp when this GitHub provisioning attempt started. */
      startedAt: number;
    } & GitHubRepositoryWithVisibility)
  | ({
      /** Existing GitHub repository connection is in progress for this vault. */
      state: "provisioning";

      /**
       * Distinguishes existing-repo connection from repository creation.
       * This is named for GitHub because the vault row is flattened.
       */
      githubMode: "connect_existing_repository";

      /** Durable run that owns the in-flight existing-repo connection. */
      runId: Id<"appProvisioningRuns">;

      /** Timestamp when this GitHub connection attempt started. */
      startedAt: number;
    } & GitHubRepositoryCoordinates)
  | ({
      /** GitHub is connected; repo-backed vault behavior is now allowed. */
      state: "connected";

      /** Records whether this vault created the repo or attached an existing repo. */
      githubMode: "create_repository" | "connect_existing_repository";

      /** Durable run that established this GitHub connection. */
      runId: Id<"appProvisioningRuns">;

      /** Immutable GitHub repository id; prevents in-place repo replacement. */
      ghRepoId: string;

      /** Default branch for source views and initial tree sync. */
      defaultBranch: string;

      /** Convex infrastructure state, only valid after GitHub is connected. */
      convex: VaultConvexState;

      /** Cloudflare infrastructure state, only valid after GitHub is connected. */
      cloudflare: VaultCloudflareState;

      /** Timestamp when the vault first became a usable source workspace. */
      connectedAt: number;
    } & GitHubRepositoryWithVisibility)
  | ({
      /** Latest GitHub repository creation attempt failed. */
      state: "failed";

      /** Failed GitHub operation kind; selects the valid retry behavior. */
      githubMode: "create_repository";

      /** Durable run that recorded the failure. */
      runId: Id<"appProvisioningRuns">;

      /** Timestamp when the latest failure was recorded. */
      failedAt: number;
    } & GitHubRepositoryWithVisibility)
  | ({
      /** Latest existing GitHub repository connection attempt failed. */
      state: "failed";

      /** Failed GitHub operation kind; selects the valid retry behavior. */
      githubMode: "connect_existing_repository";

      /** Durable run that recorded the failure. */
      runId: Id<"appProvisioningRuns">;

      /** Timestamp when the latest failure was recorded. */
      failedAt: number;
    } & GitHubRepositoryCoordinates);
```

Connected GitHub state describes repository identity. Provisioning and failed states describe the
current operation. Existing-repo provisioning and failed variants must not carry fake create-only
fields such as requested visibility.

Connected is an absorbing GitHub identity state. Once a vault reaches `state: "connected"`, it must
not move back to top-level `state: "failed"`. Top-level failed variants mean "GitHub never became
connected." Later failures must be represented inside connected-only provider state, provider-owned
child tables, or a future connected-only GitHub health state. This preserves Convex and Cloudflare
state instead of making it unrepresentable by leaving the connected variant.

The extracted repository field groups are deliberately small. `owner`/`name` belong together because
every repo-targeted state needs the same coordinates. `visibility` joins that group only where the
state has either requested create visibility or confirmed GitHub visibility. State-specific fields
such as `runId` and `defaultBranch` stay inline on the variants that give them meaning.

State transitions should not discard known GitHub facts. Moving from provisioning to connected
should carry forward `owner`, `name`, and visibility, replacing requested intent with confirmed
GitHub metadata when the provider response differs. If the workflow learns durable repository facts
such as `ghRepoId` or confirmed visibility and then a later step fails before the normal connected
write, do not fall back to the basic failed variant. Either write the connected GitHub state before
continuing to later work, or add a richer explicit state that preserves the learned repository
identity.

Convex and Cloudflare fields live only on the connected GitHub variant. They are infrastructure for
a connected repository, not peer state that can exist while GitHub is still provisioning or failed.
This encodes the vault mental model: GitHub is the source workspace gate, and Convex/Cloudflare
depend on it. This is why connected-to-failed is forbidden: a top-level failed GitHub state cannot
represent connected-only infrastructure state.

Convex and Cloudflare should still follow the same discriminated-state pattern:

1. `not_configured`
2. `provisioning`
3. `connected`
4. `failed`

Provider payloads that are large, frequently refreshed, or branch-specific should live in
provider-owned child tables. The connected GitHub state should identify the repository and default
branch; it should not force every branch tree payload to remain inline on the vault forever.

## Field Rationale

Every stored field should either enforce a durable domain invariant, preserve user intent that
cannot be derived later, or support a known query/sort path. If a field only mirrors another field,
prefer deriving it so bad states become unrepresentable.

Base vault fields:

1. `userId`: required ownership and authorization boundary.
2. Convex `_creationTime`: stable creation ordering and audit timestamp. Do not duplicate this as
   `createdAt` unless a non-Convex boundary needs that name.

Do not add `updatedAt` in the first vault-state pass. It should exist only when there is a shipped
query or workflow that intentionally sorts by explicit recency. It must not be treated as lifecycle
state, and UI lists that should not reshuffle must use a stable sort instead.

Root `displayName` should not be part of this shape. Its only durable utility is before GitHub
connection, and those states already carry better operation intent. Dashboard labels should derive
from `owner/name` in every state that has a GitHub target.

Reusing `owner` and `name` across provisioning, failed, and connected variants is intentional. In
provisioning and failed states, they are the requested or targeted GitHub repository. In connected
state, they are the current repository coordinates used for API calls and display. The `state` field
makes that meaning explicit.

The `not_connected` state deliberately has no user-supplied label. If future manual blank-vault
creation needs a user-named placeholder, add a separate field with a concrete product reason instead
of carrying a root label now.

Root `isSamebaseManaged` should also not be part of this shape. It is ambiguous between "Samebase
created the GitHub repository" and "Samebase manages infrastructure." The repo-origin question is
represented by `githubMode`; infrastructure management is represented by connected-only Convex and
Cloudflare states.

GitHub state fields:

1. `state`: the primary source-workspace discriminant for the vault. It is intentionally top-level
   because GitHub connection is what makes a vault usable. It is not a lifecycle summary.
2. `githubMode`: required on every repo-targeted state because creating a new repository and
   connecting an existing repository need different fields before connection and remain useful
   provenance after connection. It is not present on `not_connected` because no GitHub operation has
   been selected yet.
3. `runId`: ties the current GitHub state to a durable run and event log. In provisioning state, it
   owns the in-flight attempt. In failed state, it is the run that recorded the latest failure. In
   connected state, it is the run that established the GitHub connection. It must not mean "latest
   run for this vault" because later Convex/Cloudflare retries can have their own runs.
4. `owner`: GitHub user or organization owner. In `create_repository` provisioning and failed
   states, this is the requested owner for the new repo. In `connect_existing_repository`
   provisioning and failed states, this is the existing repo owner being targeted. In connected
   state, this is the current owner used for API calls and display.
5. `name`: repository name. In provisioning and failed states, this is the requested or targeted
   repository name. In connected state, this is the current GitHub repository name.
6. `visibility`: in `create_repository` provisioning and failed states, this is requested create
   intent. In connected state, this is current GitHub metadata that should be refreshed when GitHub
   visibility changes. Existing-repo provisioning and failed states must not carry visibility unless
   the workflow has already fetched repository metadata; in that case use connected state or a
   richer explicit failure state instead of dropping the learned fact.
7. Failed states preserve the same `owner` and `name` target fields used by the attempt, plus any
   operation-specific fields such as create-only `visibility`. Do not collapse them into a generic
   `repositoryLabel`.
8. `failedAt`: timestamp when the latest failure was recorded.

Do not store a `message` or `retryable` boolean on failed states. Failure messages should be derived
from provisioning events for the failed `runId` and relevant step, which keeps user-safe text
normalized with the full event history. Retry availability should be derived from the failed state,
the failed run/event step, and the retry action's current validation of user/provider prerequisites.
Stored summaries and booleans would add state that can drift when auth, billing, provider limits,
text, or retry policy changes. If a future retry decision needs durable classification that cannot
be derived, add a structured failure code with concrete meanings instead of a generic boolean.

Create-repository state must store `owner` now, even if the first UI only defaults it to the
authenticated GitHub account. The target owner can later be a user account or organization, and
retry must not infer that target from mutable provider connection state.

The target create owner is product input, not backend-discovered technical state. The New App UI
should present the available GitHub user/org destinations and pass the selected owner into
create-app. Once that exists, the backend can insert the initializing vault and run before any
GitHub API request because `owner`, `name`, and `visibility` are all local request intent. Any
temporary backend fallback that calls GitHub to recover a missing API-key username is a known UX
gap, not the target architecture; fix it with owner selection instead of adding more pre-vault
GitHub discovery.

The create-repository failed variant stores only requested create intent. If a GitHub repository was
actually created and cannot be cleaned up after a later step fails, that is a different state and
must include explicit GitHub repository identity for cleanup/retry. Do not hide a retained external
repository behind requested `owner` and `name`.

Connected GitHub fields:

1. `githubMode`: records whether the repo came from repository creation or existing-repo onboarding.
   It is connected-state provenance after success.
2. `runId`: records the run that established the connected GitHub identity. Later provider retries
   must not overwrite it unless they are retrying the GitHub connection itself.
3. `ghRepoId`: immutable repository identity. This is the field that prevents accidental in-place
   repository replacement.
4. `owner` and `name`: current dashboard-safe repository label and API target.
5. `visibility`: current repository visibility from GitHub metadata.
6. `defaultBranch`: repository metadata needed for default source views.
7. `convex` and `cloudflare`: connected-only infrastructure state that is only meaningful after
   GitHub is connected.
8. `connectedAt`: audit timestamp for when the vault first became a usable repository workspace.

Branch tree state such as `treeSHA` and branch head `commitSHA` should live in branch/tree child
tables, not in connected GitHub state, unless implementation finds a concrete atomicity requirement
that cannot be represented otherwise. Those values refresh over time and would otherwise duplicate
branch-cache state. If a connected vault has no branch tree row yet, the vault is still connected to
GitHub, but source-file routes, staging, branch views, and infrastructure steps that need tree shape
must wait, refresh, or fail closed instead of treating a missing or stale tree cache as GitHub
disconnection.

The Phase 1 implementation still keeps several pre-vault-first fields on the vault row as
compatibility mirrors because current source reads, file-view flows, branch refresh code,
Codespaces, and dashboard/provisioning reads still consume them directly. This includes
default-branch tree snapshot fields, repo-refresh operational fields, Codespace/devcontainer fields,
and infrastructure summary fields. These mirrors are accepted Phase 1 reality, not the target model.
They should stay clearly marked in the schema and move in a named cleanup phase once those call
sites consume connected-only state or vault-scoped child tables.

Do not add new product meaning to vault-row `treeSHA` or `treeData`. During this project they are
compatibility mirrors for legacy call sites; new or touched branch/tree behavior should prefer
`vaultBranchTrees` and only fall back to the vault-row snapshot while the migration is still
incomplete. Phase 4 removes those mirrors from the vault row instead of preserving two sources of
tree truth.

## Compatibility Exit Gates

Temporary compatibility is allowed only when it protects a narrow rollout step and has a named
removal gate. The vault-first work currently tolerates these temporary layers:

1. vault-row default-branch tree mirrors such as `treeSHA`, `treeData`, and default-branch
   `commitSHA`
2. runtime fallback reads from vault-row tree mirrors when `vaultBranchTrees` should be the
   canonical branch tree source
3. app provisioning run/event schema compatibility for historical pre-vault records, especially
   nullable run `vaultId` and optional event `runId`
4. dashboard query compatibility that compresses source readiness into
   `state: "copying_files" | "ready" | "failed"` instead of explicit source setup and
   tree-availability summaries
5. temporary New App owner discovery that calls GitHub before vault/run insert because the UI does
   not yet collect the target user/org owner
6. delete UI limitations around create attempts that might have created a GitHub repository before
   connected identity was written
7. top-level `vaults.infra*` aggregate fields that compress Convex and Cloudflare state into one
   dashboard/provisioning status

Manual provider retry should not be the next proof point while these layers are still active. Retry
becomes more meaningful after source reads are canonical, new runs always have a vault, dashboard
state is explicit, and the create flow gets owner/name/visibility from local product intent before
external provider calls.

## Create New App Flow

For Samebase-managed repository creation:

1. validate local input shape, including the selected GitHub user/org owner
2. in one mutation, insert the vault, insert the provisioning run with required `vaultId`, then
   patch the vault to `state: "provisioning", githubMode: "create_repository", runId, owner, name`
3. start the create-app Workflow
4. create the GitHub repository
5. write `state: "connected", githubMode: "create_repository"` with the same `runId`, immutable repo
   identity, Convex and Cloudflare state initialized, and confirmed repository visibility stored
6. seed the starter app
7. sync default branch and tree cache state into `vaultBranchTrees`; during the compatibility
   window, also update the temporary vault-row mirror
8. provision Convex and Cloudflare state
9. let the dashboard derive the vault summary from provider states

External provider validation happens after the vault exists so failures have a visible dashboard
target. Local input validation can happen before insert when it does not require provider calls.
GitHub owner selection is local product intent by this point; the create action should not need to
call GitHub only to decide where the repository will be created.

## Existing Repository Flow

Connecting an existing repository must use the same vault/run/GitHub state model:

1. validate local repository name shape
2. in one mutation, insert the vault, insert the provisioning run with required `vaultId`, then
   patch the vault to
   `state: "provisioning", githubMode: "connect_existing_repository", runId, owner, name`
3. start a connect-existing Workflow
4. fetch and validate the existing GitHub repository
5. write `state: "connected", githubMode: "connect_existing_repository"` with Convex and Cloudflare
   state initialized and fetched repository visibility stored
6. sync default branch and tree state
7. leave Convex and Cloudflare `not_configured` unless the product explicitly asks to provision them
8. let the dashboard derive the vault summary from GitHub, Convex, and Cloudflare states

This flow is currently an action. Moving it to Workflow is part of this model so existing-repo
onboarding gets the same observability and retry surface as Samebase-managed repository creation.

## Provisioning Runs

Runs are workflow attempts, not one-per-vault records. A vault can have many historical runs over
time:

1. the initial create-repository attempt
2. a retry of failed GitHub repository creation
3. a connect-existing attempt
4. retries for Convex or Cloudflare state

Each retry should create a new run instead of mutating the previous terminal run. When a failed
GitHub state is retried, the vault moves back to `state: "provisioning"` with the new `runId`. If
the retry succeeds, connected GitHub state keeps that same `runId` as the provenance for the
connection. If the retry fails, failed GitHub state keeps that new `runId` as the latest failure.
Older runs and events remain historical records queryable by vault.

Convex and Cloudflare retries should use their own provider-state `runId`s. They must not overwrite
connected GitHub `runId` unless the retry is actually changing GitHub state.

New create and connect workflows should create runs with a required `vaultId`. Because provisioning
state also stores `runId`, the implementation should use one internal mutation to insert the vault,
insert the run, and patch the vault into provisioning state before starting the Workflow. The
historical `vaultId: null` run state remains compatibility for the repository-first runtime and
should be removed once legacy records are cleaned up or no longer queried.

Run and event helpers should continue to record user-safe status only. Secrets, tokens, env values,
deploy keys, request headers, and raw provider payloads remain forbidden in run/event records.

## Dashboard Behavior

The dashboard should render the vault immediately after insert.

The vault label should be derived from GitHub state:

1. provisioning or failed: targeted `owner/name`
2. connected: current `owner/name`
3. not connected: generic GitHub connection prompt, unless a future feature adds a justified
   user-supplied placeholder name

Provider rows should read from explicit state:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: unavailable until GitHub is connected, then not configured, provisioning, connected, or
   failed
3. Cloudflare: unavailable until GitHub is connected, then not configured, provisioning, connected,
   or failed

Repo-backed controls should stay hidden or disabled until GitHub is connected. If manual retry
buttons later exist, they should target the failed provider state on that vault.

Dashboard summary labels such as creating, active, degraded, or failed should be derived from
provider states. For example:

1. `creating`: one or more required provider states are provisioning
2. `active`: GitHub is connected and required provider states are connected or intentionally not
   configured
3. `degraded`: GitHub is connected, but a non-blocking provider state failed
4. `failed`: GitHub failed before the vault became usable as a source workspace

These labels are presentation logic unless a future query or product workflow needs a stored
materialized summary.

A connected vault may render a failed or degraded dashboard summary, but its stored GitHub state
remains `connected`. The summary describes current health; the state describes whether the vault has
durable repository identity.

## Convex And Cloudflare State Direction

The product model should not treat Convex and Cloudflare as one generic `infraState`. They are
separate provider legs of the app after GitHub source setup succeeds, and they can progress, fail,
and retry independently.

The current target state model is:

1. GitHub/source state says whether the vault has durable repository identity and enough tree data
   for source-backed work
2. `vaultConvexDeployments` stores connected Convex production deployments by `vaultId` + `appRoot`
3. `vaultCloudflareWorkers` stores connected Cloudflare Workers by `vaultId` + `appRoot`
4. dashboard labels such as creating, active, degraded, failed, or partial are derived from those
   resource rows, active ownership, and run/event state
5. provider retry actions target the failed block run, not a generic aggregate infra status

Top-level `vaults.infraState`, `vaults.infraLastError`, `vaults.infraLastProvisionedAt`, and
`vaults.infraProvisioningStartedAt` are the current compatibility shortcut for dashboard and
provisioning code. They should not gain new product meaning. Phase 5 should replace their reads and
writes with explicit app-root resource rows and block-run state, then remove the aggregate fields
from the vault row after production data is clean.

`vaultConvexDeployments`, `vaultCloudflareWorkers`, `vaultDomains`, and
`vaultInfrastructureOwnership` keep the external resource metadata and operational details needed to
call providers, such as project ids, deployment names, account ids, deploy-key ids, domains,
provisioning version, and ownership. They should not become a competing aggregate user-visible
source of truth for whether the app is ready.

## Migration

The normal Convex path is widen, migrate, and narrow because existing vault rows currently require
GitHub fields. If production vaults must be preserved, use the standard multi-deploy migration.

Because Samebase currently has one real operator/user and the operator is willing to remove existing
production vaults, this phase may use a direct reset shortcut:

The important project data is pushed to GitHub. Convex currently stores connections, provisioning
metadata, UI state, and derived/cache-like vault data. For this single-user app, the reset does not
need a preservation-style backup and restore ceremony. It does need an explicit operator-confirmed
cleanup so the reset is scoped to the intended vault-owned rows and is not hidden inside normal
product behavior.

1. explicitly delete vault-scoped production data through an operator-approved cleanup
2. deploy the new required state shape
3. update current call sites directly without old/new vault compatibility

The schema change should land with the current code updates that are required to typecheck against
it. Changing `vaults` from required top-level GitHub fields to explicit state variants will affect
generated Convex types across backend and frontend call sites. In a multi-user preservation path
that type fallout would usually require separate widen, migrate, and narrow PRs. For this
single-user reset path, the simpler implementation is one destructive schema-and-code PR after the
operator has confirmed the cleanup scope.

The reset must include dependent vault-scoped tables, not only `vaults`. Likely affected tables
include:

1. repository inventory root, snapshot, item, and label-chunk tables, plus any GitHub account
   rate-budget lease currently owned by the vault
2. `vaultBranchTrees`
3. `vaultInfrastructure`
4. `vaultInfrastructureOwnership`
5. `appProvisioningRuns`
6. `appProvisioningEvents`
7. `vaultDomains`
8. `codespaces`
9. `fileStaging`
10. `blobs`
11. `folderExpansionState`
12. `agentGraphNodeLayout`
13. `agentThreadContext`
14. `aiProdAccessRequests`
15. `collaborativeUpdates`

The cleanup must fail closed: if the cleanup cannot prove it is targeting the intended vault-scoped
tables and rows, it must abort before deletion and report the failure outside the product flow. The
cleanup must not be hidden inside the product flow.

## Implementation Phases

This spec defines the Vault-First Provisioning initiative. Implementation should land as smaller
internal phases so each squash commit preserves a reviewable product step without tying the work to
the historical Phase 1-3 Workflow migration labels.

### Vault-First Phase 1: Vault State Model

Goal: change the persisted vault shape and make repository-backed code explicit about requiring
connected GitHub state.

Scope:

1. satisfy and record the destructive-reset prerequisites from the Migration section
2. define `VaultBase`, `VaultGitHubState`, `VaultConvexState`, and `VaultCloudflareState` validators
3. define `vaults` as a union of full row variants that share the base fields
4. replace always-required repository identity fields with connected-only GitHub variant fields
5. update backend and frontend call sites in the same PR so the generated Convex types compile
   against the new required shape
6. add a typed helper for code paths that require connected GitHub state
7. keep current create-app ordering intact for this phase; when it creates a vault after GitHub
   succeeds, write the `connected` GitHub variant

Stop before creating initializing vaults ahead of GitHub provisioning.

Implementation note: Phase 1 intentionally keeps old vault-row mirrors required by existing
file-view, branch-cache, Codespaces, and dashboard/provisioning call sites. Those fields should
remain documented as compatibility mirrors in the schema. Moving them to connected-only state or
child tables is a separate cleanup project, not hidden Phase 1 scope.

### Vault-First Phase 2: Initializing Vault Creation

Goal: make a new Samebase-managed app visible as a vault before external GitHub work starts.

Scope:

1. update create-app to create the initializing vault and first run together before starting
   provider work
2. update app provisioning runs/events so new create runs require `vaultId`
3. update create-app Workflow steps to mutate `state`, `githubMode`, `owner`, `name`, `visibility`,
   connected-only Convex/Cloudflare state, and branch-tree cache state as steps start, succeed, or
   fail
4. keep any remaining pre-vault GitHub owner discovery fallback narrow and documented as UX debt,
   because the target model is New App owner selection before vault/run insert

Connected GitHub state must not require a branch tree snapshot. Phase 2 may keep the vault-row tree
fields as optional compatibility mirrors while current source views finish moving to
`vaultBranchTrees`.

Stop before building broad retry UX.

### Vault-First Phase 3: Dashboard Provider Visibility

Goal: show initializing and failed provider state from the vault and event data without making
pre-GitHub vaults usable as source workspaces.

Current Phase 2 gap: if `seed_starter` or `sync_tree` fails after the vault has connected GitHub
identity, the vault stays correctly connected and no longer exposes infra provisioning, but the
dashboard can still read as generic `setting up...`. Phase 3 must surface that run failure from
`appProvisioningRuns` and `appProvisioningEvents` instead of leaving the user to infer it from
missing tree state. This is a visibility gap, not a reason to move connected vaults back to
top-level failed.

The existing provisioning textarea is still the right raw log surface. The problem is placement and
summary state: today the textarea is rendered inside ready-vault developer tools, while the affected
vault is not ready because it has no usable default-branch tree. Phase 3 should reuse that event log
instead of building a second log model, but expose it on non-ready connected cards when the current
create-app run is still running or failed during source setup.

Source setup in this phase means the post-GitHub steps needed before the vault can safely behave as
a source workspace: `seed_starter` and initial `sync_tree`. This is separate from tree freshness
after the first successful sync. A tree becoming stale later is normal refresh state; a failed
initial `sync_tree` means the app never reached the minimum usable source state.

Recommended dashboard query shape:

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

Keep the current broad `state: "copying_files" | "ready" | "failed"` result as the card readiness
bucket, then add a required `sourceSetup` summary with this shape. Use `not_applicable` for
existing-repo vaults and pre-GitHub create attempts, because Phase 3 is only about the source setup
gap after GitHub identity is connected. The concrete Convex validator should mirror this union with
required fields in each status arm.

Scope:

1. update dashboard queries and controls to render provider states
2. derive failure messages from provisioning events for the failed `runId`
3. gate repo-backed actions behind connected GitHub state
4. keep tree-dependent controls, including infra provisioning, gated on a usable default-branch tree
   from `vaultBranchTrees` or the temporary mirror
5. show post-GitHub source setup failures, especially `seed_starter` and `sync_tree`, on connected
   Samebase-managed vault cards without replacing their connected GitHub state
6. make provisioning logs visible for non-ready setup/failed cards that have provisioning events,
   not only inside ready-state developer tools

Stop before implementing retry controls.

Implementation outline:

1. Add a small query-level dashboard summary for the current GitHub/source setup run, derived from
   the vault's `runId`, run state/current step, and latest error event.
2. Preserve the existing legacy `state: "copying_files" | "ready" | "failed"` shape only as the
   card's broad readiness bucket while adding explicit source setup status for copy and error text.
3. Treat connected-without-tree as setup in progress when the run is still queued/running, and as
   setup failed when the establishing create run failed before the first usable tree, especially
   during `seed_starter` or `sync_tree`.
4. Keep infra controls hidden until the default-branch tree is usable; do not make tree absence mean
   GitHub disconnection.
5. Render the latest failure message and provisioning log on the card so the user can see which
   provider/source step failed before retry UI exists.
6. Keep the ready-vault developer-tools log unchanged, but make the log component usable from the
   non-ready card body when setup summary status is `running` or `failed`.

Frontend behavior:

1. A pre-GitHub failure still renders as a failed create attempt, because the repository identity
   was not established.
2. A connected Samebase-managed vault without a usable tree renders as setup in progress while its
   create-app run is queued/running.
3. A connected Samebase-managed vault whose create-app run failed in `seed_starter` or `sync_tree`
   renders as setup failed, shows the latest failure message, and shows the provisioning log.
4. GitHub links and delete affordances continue to use the connected repository identity.
5. Branch lists, source workspace links, chat, and infra controls remain hidden until a usable
   default-branch tree exists.

Observed Phase 3 happy path, from a local end-to-end run on 2026-05-08:

1. after clicking New App, the dashboard creates a new card quickly with `setting up...` but no body
   content yet
2. once GitHub identity is connected, the card shows the source setup summary and provisioning
   textarea for `connect GitHub`, `seed starter`, and `sync tree`
3. when the first usable tree lands, the source setup summary disappears
4. because the old dashboard readiness model now sees a ready Samebase-managed vault while infra is
   briefly `not_started`, the legacy `Provision infra` action can flash
5. once infra provisioning starts, the action disappears and the card can look bare until repository
   links arrive
6. branch rows still depend on the separate branch/tree refresh path and should not be expected to
   appear as part of this phase

This sequence is expected from the transitional Phase 3 implementation, but it is not the product
sequence to preserve. Do not add screenshot or end-to-end tests that lock in the `Provision infra`
flash, the bare ready card, or the current happy-path timing. Phase 3 tests should stay focused on
the durable contract: connected source setup running/failed states render with the provisioning log,
and tree-dependent controls remain hidden until the first usable tree exists.

### Vault-First Phase 4: Compatibility Cleanup And Canonical Source Model

Goal: remove the temporary compatibility surfaces that would make later retry UI prove too little
about the actual model.

Scope:

1. update file view, staging, branch refresh, chat, dashboard, and infrastructure paths to consume
   `vaultBranchTrees` or explicit connected state instead of vault-row tree mirrors
2. stop writing default-branch tree mirrors once current runtime paths no longer read them, then
   remove `treeSHA`, `treeData`, and default-branch `commitSHA` mirrors from the vault row
3. narrow app provisioning run/event schema so new and supported records always have a vault-owned
   run and every event belongs to a run
4. replace the New App pre-insert GitHub owner discovery fallback with explicit user/org owner
   selection in the UI
5. either add the retained-created-repo failure state or keep delete UI limited to confirmed
   connected Samebase-managed repositories
6. collapse the dashboard's legacy readiness projection once `sourceSetup`, connected state, and
   tree availability cover the shipped UI directly
7. define the canonical New App dashboard sequence after source setup succeeds: the card should not
   expose manual infra provisioning as a transient happy path artifact, and it should have a clear
   provider/infra progress surface instead of a bare completed-looking card
8. after the canonical Phase 4 sequence is implemented, add screenshot coverage for the stable
   setup-running/setup-failed card states and the simplified post-source-setup state; do not spend
   Phase 3 effort splitting visual tests around compatibility behavior that Phase 4 intends to
   remove

Phase 4 starts by canonicalizing the dashboard sequence after the first usable source tree exists. A
Samebase-managed app that is still preparing or provisioning infrastructure should render a
progress/log surface on the card, not a `Provision infra` or `Retry infra` button. Manual provider
retry is intentionally kept out of this phase until the compatibility exits below are closed enough
that a retry control proves backend durability rather than papering over legacy dashboard states.

Stop before user-facing retry buttons. After this phase, runtime code should no longer depend on
vault-row tree mirrors or newly-created `vaultId: null` provisioning records.

Phase 4 removes the deprecated vault-row `treeSHA`, `treeData`, and default-branch `commitSHA`
mirrors from `VaultRow` instead of carrying another compatibility deploy. Before merging or
deploying this narrow schema, compare the branch against production data and clear the vault-owned
rows or fields that would fail Convex schema validation. The target branch should stay simple; the
production cleanup is the pre-merge operational step.

New App owner selection is part of this phase. The create action should receive the selected GitHub
user or organization from the UI and create the initializing vault/run before the Workflow makes
GitHub API calls. Listing the selectable owners can happen in the UI because it is the explicit UX
for choosing the repo target; the create button itself should not perform hidden owner discovery
before inserting the vault.

Provisioning runs and events are narrowed in this phase. Supported runs are vault-owned, and events
belong to a run with a vault id and repository full name. Before deploying this schema, clear legacy
pre-vault runs/events or any rows missing the required run linkage.

This phase can land as a short cleanup series. The gate matters more than the PR boundary: manual
retry UI should wait until these compatibility exits are closed or intentionally narrowed to
non-blocking parked work.

### Vault-First Phase 5: Backend Durability And Provider Retries

Goal: make New App finish successfully more often, and fail clearly when it cannot, without
requiring the user to understand provider steps.

Scope:

1. make app-root resource rows plus block-run state the product-facing source of truth for provider
   setup progress, success, and failure
2. update provisioning code to compose Convex and Cloudflare blocks separately while preserving
   connected GitHub state
3. replace dashboard and query reads of top-level `vaults.infra*` fields with summaries derived from
   `vaultConvexDeployments`, `vaultCloudflareWorkers`, `vaultInfrastructureOwnership`, and
   `appProvisioningRuns`
4. keep provider resource metadata and operational ownership outside the vault row instead of
   treating those details as user-visible readiness
5. remove the top-level `vaults.infraState`, `vaults.infraLastError`,
   `vaults.infraLastProvisionedAt`, and `vaults.infraProvisioningStartedAt` mirrors after production
   rows are clean
6. classify create-app steps by idempotency before enabling backend retries
7. add step-local Workflow retry only where duplicate external writes cannot create a worse state
8. keep `create_github_repo` conservative unless repository creation is protected by durable
   repository identity or an explicit retained-repo state
9. make `seed_starter` and initial `sync_tree` safe to retry from the backend when their idempotency
   checks pass
10. keep terminal failures user-visible through `sourceSetup` summaries and provisioning events

Stop before adding manual retry controls. Backend retries should improve the "click New App and get
done" path; they are not a substitute for clear terminal state. Provider retry work should not build
on the aggregate infra mirrors; it should first make the separate provider states trustworthy enough
to retry.

Cloudflare MCP calls used by Cloudflare provisioning should use a 30-second per-request timeout. The
earlier 10-second timeout was too tight for normal Cloudflare setup latency and could fail
`ensure_cloudflare` before backend retry and reconcile behavior had a chance to make the step
durable.

Future Cloudflare durability work should also cover deploy/publish failures after asset upload has
already succeeded. Production has observed Cloudflare Pages upload and asset publish succeed, then
the Function publish step fail with
`Failed to publish your Function. Got error: Unknown internal error occurred.` and succeed after a
manual Cloudflare deployment retry. Treat that as a Cloudflare-transient publish/reconcile case:
retry or reconcile the Cloudflare deployment without re-running unrelated provider setup, and
preserve the provider-specific event/error trail when the retry budget is exhausted.

The first `seed_starter` idempotency case to cover is GitHub's empty-repository consistency window
after Samebase's bootstrap commit creates the default branch. Production observed the bootstrap
commit succeed, then a follow-up manifest tree write still failed with GitHub reporting that the
repository was empty. Phase 5 should retry `seed_starter` through this exact post-bootstrap
empty-repo response and keep the existing force-update behavior so the final starter commit replaces
the bootstrap-only branch. Do not enable Workflow retry for `seed_starter` until this case is
covered by tests. Keep `create_github_repo` non-retried unless a retained-repository state or
equivalent durable identity guard exists.

### Vault-First Phase 6: Existing Repository Onboarding

Status: runtime behavior shipped in `v1257` / `#733`.

Goal: move existing-repository connection onto the same vault/run/provider-state model.

The detailed accepted implementation contract for this phase now lives in
`specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`. Use that spec for the connect-existing
trigger, step names, duplicate handling, direct-route UX, and production cleanup rules.

Scope:

1. move existing-repository connection onto Workflow using the same GitHub state model
2. write `githubMode: "connect_existing_repository"` for provisioning, failed, and connected states
3. reuse the same dashboard visibility and backend durability semantics as Samebase-managed
   repository creation

Manual provider retry is intentionally parked until there is a concrete product need and a designed
UX.

## Parked Follow-Up Work

These items are intentionally outside the current New App reliability path:

1. Revisit parked Codespaces branch defaults after Codespaces work resumes.
2. Define explicit manual provider retry UX only when a current failure case needs it. Any future
   retry action should target one failed provider state, create a new run, update only that provider
   state's `runId`, and preserve older runs and events as history.
3. Consider a generic restart-from-failed-step abstraction only after manual provider retry has
   proven the state ownership model.

## Testing Plan

Backend:

1. create-app inserts a vault before external GitHub calls
2. create-app run is created with required `vaultId`
3. create-app success writes connected Samebase-managed GitHub state
4. connected GitHub state stores the run that established the connection
5. create-app GitHub failure writes failed GitHub state on the vault
6. connected GitHub state stores current repository visibility
7. pre-GitHub vault states cannot store Convex or Cloudflare state
8. connected GitHub identity cannot change to a different `ghRepoId`
9. connected GitHub state cannot transition to top-level failed
10. post-connected provider failures preserve connected GitHub state
11. repo-backed helpers reject pre-GitHub vaults
12. connected vaults without a usable default-branch tree do not expose tree-dependent infra
    provisioning controls
13. connected Samebase-managed vaults whose create run failed in `seed_starter` or `sync_tree`
    expose a dashboard source-setup failure summary derived from the run/events
14. after compatibility cleanup, source, staging, dashboard, and infra paths read default-branch
    tree state from `vaultBranchTrees` without vault-row tree mirror fallback
15. after compatibility cleanup, supported provisioning events require `runId` and supported
    provisioning runs require `vaultId`
16. Phase 5 replaces top-level `vaults.infra*` dashboard/provisioning reads with summaries derived
    from app-root provider resource rows and block-run state
17. Phase 5 removes the top-level `vaults.infra*` mirrors after production data is clean
18. when backend retries ship, retried provider steps prove idempotency and keep terminal failures
    visible through the same run/event summaries
19. when manual retry ships, GitHub retry creates a new run and replaces the failed state's `runId`
20. when existing-repo onboarding ships, connection writes connected existing-repository GitHub
    state

Frontend:

1. dashboard shows initializing vault provider state
2. repo-backed controls are hidden or disabled before GitHub connection
3. delete dialog only offers GitHub repository deletion for confirmed connected Samebase-managed
   repositories
4. connected-without-tree failures render as setup failed with the relevant provisioning message/log
   instead of only showing `setting up...`
5. after compatibility cleanup, source readiness is driven by explicit setup and tree availability
   summaries instead of the legacy readiness bucket
6. Phase 5 dashboard summaries for Convex and Cloudflare come from explicit provider states, not a
   generic `infraState`
7. when manual retry ships, failed provider state shows the retry target on the vault
8. when existing-repo onboarding ships, connected existing-repo vaults render like other connected
   vaults after GitHub state is connected

## Acceptance Criteria

1. New Samebase-managed app creation has a visible vault before GitHub provisioning completes.
2. Existing-repository connection uses the same GitHub state model.
3. Repo-backed features cannot run against pre-GitHub vaults.
4. Convex and Cloudflare state cannot exist unless GitHub is connected.
5. Connected GitHub repository identity is immutable.
6. Connected GitHub state records the run that established the connection.
7. Connected GitHub state stores current repository visibility.
8. Connected GitHub state is not replaced by top-level failed state.
9. Post-GitHub source setup failures are visible from the vault without exposing source or infra
   controls that need a usable tree.
10. Temporary compatibility layers have named removal gates before manual retry UI is treated as
    durability proof.
11. Failure messages are read from provisioning events rather than duplicated on the vault row.
12. Convex and Cloudflare progress/failure is represented by separate provider states before
    provider retries are treated as durable.
13. Aggregate `vaults.infra*` mirrors are removed before manual provider retry is used as proof of
    the state model.
14. When retries ship, they create new runs rather than mutating previous terminal runs.
