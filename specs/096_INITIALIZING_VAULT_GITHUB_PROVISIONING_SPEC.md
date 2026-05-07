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
connected GitHub repository. Convex and hosting fields only exist on connected
GitHub variants, so those integrations cannot exist while GitHub is still
provisioning or failed.

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
4. Keep Convex and hosting state present only on connected GitHub variants.
5. Keep repository-backed features gated on connected GitHub state.
6. Make manual retry target one failed provider state on one vault.
7. Keep operation-specific fields inside the matching provisioning or failed
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
`vault.state === "connected"`:

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

The top-level GitHub state is also one-way after connection. Repository access
problems, deleted repos, permission loss, branch refresh failures, Convex
failures, and hosting failures must not transition a connected vault to
top-level `failed`. Model those as connected-only provider state, child-table
operational state, or derived dashboard summaries while preserving the connected
GitHub identity.

## State Model

Use required discriminated state objects instead of optional scattered provider
fields.

Conceptual shape:

```ts
/** Persisted vault row: base fields plus exactly one source-workspace state. */
type VaultRow = VaultBase & VaultGitHubState;

/** Fields every vault row has regardless of GitHub connection state. */
type VaultBase = {
  /** Ownership and authorization boundary for the vault. */
  userId: Id<"users">;

  /** Stable creation timestamp for audit and deterministic dashboard ordering. */
  createdAt: number;

  /**
   * Explicit recency timestamp for queries that intentionally sort by update.
   * This is not lifecycle state.
   */
  updatedAt: number;
};
```

The TypeScript mental model can be `VaultBase & VaultGitHubState`. The Convex
schema should still define `vaults` as a union of complete row validators that
share the base fields, because the validator API represents persisted
discriminated unions as concrete object variants.

Do not store an overall `lifecycleState` for `creating`, `active`, `degraded`,
or `failed`. Those are dashboard summaries derived from the provider states.
Keeping both a top-level lifecycle and provider state would create two sources
of truth that can drift. If the product later needs a user-controlled state such
as archive/hide, model that as a separate explicit field instead of mixing it
with provisioning health.

GitHub state:

```ts
/**
 * GitHub is the gate for a vault becoming a usable source workspace.
 * These fields live on the vault row itself; `state` is top-level because
 * GitHub is the source-workspace state of the vault.
 */
/** GitHub visibility values currently supported by Noter's create flow. */
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

      /** Hosting infrastructure state, only valid after GitHub is connected. */
      hosting: VaultHostingState;

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

Connected GitHub state describes repository identity. Provisioning and failed
states describe the current operation. Existing-repo provisioning and failed
variants must not carry fake create-only fields such as requested visibility.

Connected is an absorbing GitHub identity state. Once a vault reaches
`state: "connected"`, it must not move back to top-level `state: "failed"`.
Top-level failed variants mean "GitHub never became connected." Later failures
must be represented inside connected-only provider state, provider-owned child
tables, or a future connected-only GitHub health state. This preserves Convex
and hosting state instead of making it unrepresentable by leaving the connected
variant.

The extracted repository field groups are deliberately small. `owner`/`name`
belong together because every repo-targeted state needs the same coordinates.
`visibility` joins that group only where the state has either requested create
visibility or confirmed GitHub visibility. State-specific fields such as `runId`
and `defaultBranch` stay inline on the variants that give them meaning.

State transitions should not discard known GitHub facts. Moving from
provisioning to connected should carry forward `owner`, `name`, and visibility,
replacing requested intent with confirmed GitHub metadata when the provider
response differs. If the workflow learns durable repository facts such as
`ghRepoId` or confirmed visibility and then a later step fails before the normal
connected write, do not fall back to the basic failed variant. Either write the
connected GitHub state before continuing to later work, or add a richer explicit
state that preserves the learned repository identity.

Convex and hosting fields live only on the connected GitHub variant. They are
infrastructure for a connected repository, not peer state that can exist while
GitHub is still provisioning or failed. This encodes the vault mental model:
GitHub is the source workspace gate, and Convex/Cloudflare depend on it. This is
why connected-to-failed is forbidden: a top-level failed GitHub state cannot
represent connected-only infrastructure state.

Convex and hosting should still follow the same discriminated-state pattern:

1. `not_configured`
2. `provisioning`
3. `connected`
4. `failed`

Provider payloads that are large, frequently refreshed, or branch-specific
should live in provider-owned child tables. The connected GitHub state should
identify the repository and default branch; it should not force every branch
tree payload to remain inline on the vault forever.

## Field Rationale

Every stored field should either enforce a durable domain invariant, preserve
user intent that cannot be derived later, or support a known query/sort path. If
a field only mirrors another field, prefer deriving it so bad states become
unrepresentable.

Base vault fields:

1. `userId`: required ownership and authorization boundary.
2. `createdAt`: stable ordering and audit timestamp.
3. `updatedAt`: useful only for explicit recency queries. It must not be treated
   as lifecycle state, and UI lists that should not reshuffle must use a stable
   sort instead.

Root `displayName` should not be part of this shape. Its only durable utility is
before GitHub connection, and those states already carry better operation
intent. Dashboard labels should derive from `owner/name` in every state that has
a GitHub target.

Reusing `owner` and `name` across provisioning, failed, and connected variants
is intentional. In provisioning and failed states, they are the requested or
targeted GitHub repository. In connected state, they are the current repository
coordinates used for API calls and display. The `state` field makes that meaning
explicit.

The `not_connected` state deliberately has no user-supplied label. If future
manual blank-vault creation needs a user-named placeholder, add a separate field
with a concrete product reason instead of carrying a root label now.

Root `isNoterManaged` should also not be part of this shape. It is ambiguous
between "Noter created the GitHub repository" and "Noter manages
infrastructure." The repo-origin question is represented by `githubMode`;
infrastructure management is represented by connected-only Convex and hosting
states.

GitHub state fields:

1. `state`: the primary source-workspace discriminant for the vault. It is
   intentionally top-level because GitHub connection is what makes a vault
   usable. It is not a lifecycle summary.
2. `githubMode`: required on every repo-targeted state because creating a new
   repository and connecting an existing repository need different fields before
   connection and remain useful provenance after connection. It is not present
   on `not_connected` because no GitHub operation has been selected yet.
3. `runId`: ties the current GitHub state to a durable run and event log. In
   provisioning state, it owns the in-flight attempt. In failed state, it is the
   run that recorded the latest failure. In connected state, it is the run that
   established the GitHub connection. It must not mean "latest run for this
   vault" because later Convex/hosting retries can have their own runs.
4. `owner`: GitHub user or organization owner. In `create_repository`
   provisioning and failed states, this is the requested owner for the new repo.
   In `connect_existing_repository` provisioning and failed states, this is the
   existing repo owner being targeted. In connected state, this is the current
   owner used for API calls and display.
5. `name`: repository name. In provisioning and failed states, this is the
   requested or targeted repository name. In connected state, this is the
   current GitHub repository name.
6. `visibility`: in `create_repository` provisioning and failed states, this is
   requested create intent. In connected state, this is current GitHub metadata
   that should be refreshed when GitHub visibility changes. Existing-repo
   provisioning and failed states must not carry visibility unless the workflow
   has already fetched repository metadata; in that case use connected state or
   a richer explicit failure state instead of dropping the learned fact.
7. Failed states preserve the same `owner` and `name` target fields used by the
   attempt, plus any operation-specific fields such as create-only `visibility`.
   Do not collapse them into a generic `repositoryLabel`.
8. `failedAt`: timestamp when the latest failure was recorded.

Do not store a `message` or `retryable` boolean on failed states. Failure
messages should be derived from provisioning events for the failed `runId` and
relevant step, which keeps user-safe text normalized with the full event
history. Retry availability should be derived from the failed state, the failed
run/event step, and the retry action's current validation of user/provider
prerequisites. Stored summaries and booleans would add state that can drift when
auth, billing, provider limits, text, or retry policy changes. If a future retry
decision needs durable classification that cannot be derived, add a structured
failure code with concrete meanings instead of a generic boolean.

Create-repository state must store `owner` now, even if the first UI only
defaults it to the authenticated GitHub account. The target owner can later be a
user account or organization, and retry must not infer that target from mutable
provider connection state.

The create-repository failed variant stores only requested create intent. If a
GitHub repository was actually created and cannot be cleaned up after a later
step fails, that is a different state and must include explicit GitHub
repository identity for cleanup/retry. Do not hide a retained external
repository behind requested `owner` and `name`.

Connected GitHub fields:

1. `githubMode`: records whether the repo came from repository creation or
   existing-repo onboarding. It is connected-state provenance after success.
2. `runId`: records the run that established the connected GitHub identity.
   Later provider retries must not overwrite it unless they are retrying the
   GitHub connection itself.
3. `ghRepoId`: immutable repository identity. This is the field that prevents
   accidental in-place repository replacement.
4. `owner` and `name`: current dashboard-safe repository label and API target.
5. `visibility`: current repository visibility from GitHub metadata.
6. `defaultBranch`: repository metadata needed for default source views.
7. `convex` and `hosting`: connected-only infrastructure state that is only
   meaningful after GitHub is connected.
8. `connectedAt`: audit timestamp for when the vault first became a usable
   repository workspace.

Branch tree state such as `treeSHA` and branch head `commitSHA` should live in
branch/tree child tables, not in connected GitHub state, unless implementation
finds a concrete atomicity requirement that cannot be represented otherwise.
Those values refresh over time and would otherwise duplicate branch-cache state.

## Create New App Flow

For Noter-managed repository creation:

1. validate local input shape
2. in one mutation, insert the vault, insert the provisioning run with required
   `vaultId`, then patch the vault to
   `state: "provisioning", githubMode: "create_repository", runId, owner, name`
3. start the create-app Workflow
4. create the GitHub repository
5. write `state: "connected", githubMode: "create_repository"` with the same
   `runId`, immutable repo identity, Convex and hosting state initialized, and
   confirmed repository visibility stored
6. seed the starter app
7. sync default branch and tree state
8. provision Convex and hosting state
9. let the dashboard derive the vault summary from provider states

External provider validation happens after the vault exists so failures have a
visible dashboard target. Local input validation can happen before insert when
it does not require provider calls.

## Existing Repository Flow

Connecting an existing repository must use the same vault/run/GitHub state
model:

1. validate local repository name shape
2. in one mutation, insert the vault, insert the provisioning run with required
   `vaultId`, then patch the vault to
   `state: "provisioning", githubMode: "connect_existing_repository", runId, owner, name`
3. start a connect-existing Workflow
4. fetch and validate the existing GitHub repository
5. write `state: "connected", githubMode: "connect_existing_repository"` with
   Convex and hosting state initialized and fetched repository visibility stored
6. sync default branch and tree state
7. leave Convex and hosting `not_configured` unless the product explicitly asks
   to provision them
8. let the dashboard derive the vault summary from provider states

This flow is currently an action. Moving it to Workflow is part of this model so
existing-repo onboarding gets the same observability and retry surface as
Noter-managed repository creation.

## Provisioning Runs

Runs are workflow attempts, not one-per-vault records. A vault can have many
historical runs over time:

1. the initial create-repository attempt
2. a retry of failed GitHub repository creation
3. a connect-existing attempt
4. retries for Convex or hosting provider state

Each retry should create a new run instead of mutating the previous terminal
run. When a failed GitHub state is retried, the vault moves back to
`state: "provisioning"` with the new `runId`. If the retry succeeds, connected
GitHub state keeps that same `runId` as the provenance for the connection. If
the retry fails, failed GitHub state keeps that new `runId` as the latest
failure. Older runs and events remain historical records queryable by vault.

Convex and hosting retries should use their own provider-state `runId`s. They
must not overwrite connected GitHub `runId` unless the retry is actually
changing GitHub state.

New create and connect workflows should create runs with a required `vaultId`.
Because provisioning state also stores `runId`, the implementation should use
one internal mutation to insert the vault, insert the run, and patch the vault
into provisioning state before starting the Workflow. The Phase 3
`vaultId: null` run state remains historical compatibility for the
repository-first runtime and should not be the target shape for this phase.

Run and event helpers should continue to record user-safe status only. Secrets,
tokens, env values, deploy keys, request headers, and raw provider payloads
remain forbidden in run/event records.

## Dashboard Behavior

The dashboard should render the vault immediately after insert.

The vault label should be derived from GitHub state:

1. provisioning or failed: targeted `owner/name`
2. connected: current `owner/name`
3. not connected: generic GitHub connection prompt, unless a future feature adds
   a justified user-supplied placeholder name

Provider rows should read from explicit state:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: unavailable until GitHub is connected, then not configured,
   provisioning, connected, or failed
3. Hosting: unavailable until GitHub is connected, then not configured,
   provisioning, connected, or failed

Repo-backed controls should stay hidden or disabled until GitHub is connected.
Manual retry buttons should target the failed provider state on that vault.

Dashboard summary labels such as creating, active, degraded, or failed should be
derived from provider states. For example:

1. `creating`: one or more required provider states are provisioning
2. `active`: GitHub is connected and required provider states are connected or
   intentionally not configured
3. `degraded`: GitHub is connected, but a non-blocking provider state failed
4. `failed`: GitHub failed before the vault became usable as a source workspace

These labels are presentation logic unless a future query or product workflow
needs a stored materialized summary.

A connected vault may render a failed or degraded dashboard summary, but its
stored GitHub state remains `connected`. The summary describes current health;
the state describes whether the vault has durable repository identity.

## Migration

The normal Convex path is widen, migrate, and narrow because existing vault rows
currently require GitHub fields. If production vaults must be preserved, use the
standard multi-deploy migration.

Because Noter currently has one real operator/user and the operator is willing
to remove existing production vaults, this phase may use a direct reset
shortcut:

**Warning:** this shortcut irreversibly deletes production data. Cleanup must
not start unless all of these prerequisites are documented:

1. verified backups exist for every affected vault-scoped table and the backup
   evidence is recorded
2. a restore or snapshot-replay test has demonstrated recoverability for the
   affected data
3. explicit operator sign-off records the deletion scope and accepts the data
   loss

After those prerequisites are recorded:

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

The cleanup must fail closed: any missing backup proof, restore validation, or
operator sign-off aborts the cleanup before deletion and reports the failure
outside the product flow. The cleanup must not be hidden inside the product
flow.

## Implementation Sequence

1. Define `VaultBase`, `VaultGitHubState`, `VaultConvexState`, and
   `VaultHostingState` validators, then define `vaults` as a union of full row
   variants that share the base fields.
2. Add a typed helper for code paths that require connected GitHub state.
3. Replace always-required repository identity fields with connected-only GitHub
   variant fields.
4. Update create-app to create the initializing vault and first run together
   before starting provider work.
5. Update app provisioning runs/events so new create/connect runs require
   `vaultId`.
6. Update create-app Workflow steps to mutate `state`, `githubMode`, `owner`,
   `name`, `visibility`, and connected-only Convex/hosting state as steps start,
   succeed, or fail.
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
4. connected GitHub state stores the run that established the connection
5. create-app GitHub failure writes failed GitHub state on the vault
6. GitHub retry creates a new run and replaces the failed state's `runId`
7. existing-repo connection writes connected existing-repository GitHub state
8. connected GitHub state stores current repository visibility
9. pre-GitHub vault states cannot store Convex or hosting state
10. connected GitHub identity cannot change to a different `ghRepoId`
11. connected GitHub state cannot transition to top-level failed
12. post-connected provider failures preserve connected GitHub state
13. repo-backed helpers reject pre-GitHub vaults

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
4. Convex and hosting state cannot exist unless GitHub is connected.
5. Connected GitHub repository identity is immutable.
6. Connected GitHub state records the run that established the connection.
7. Retries create new runs rather than mutating previous terminal runs.
8. Connected GitHub state stores current repository visibility.
9. Connected GitHub state is not replaced by top-level failed state.
10. Failed provider states are visible from the vault and expose retry actions
    derived from state plus current provider/user prerequisites.
11. Failure messages are read from provisioning events rather than duplicated on
    the vault row.
