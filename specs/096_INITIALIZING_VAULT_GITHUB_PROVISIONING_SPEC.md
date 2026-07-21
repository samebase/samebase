# Initializing Vault GitHub Provisioning Spec

## Document Control

- Status: Accepted and implemented
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
Convex project and Cloudflare Worker attachment rows only exist for connected GitHub vaults, so those
integrations cannot exist while GitHub is still provisioning or failed.

The temporary compatibility layers have been removed. The primary product promise is still simple:
the user clicks New App and either gets a usable app or a clear setup failure.

## Current Implementation

The vault and provisioning run are created together before external GitHub work. Runs and events
always have a vault, repository full name, and run identity. No pre-vault run shape remains.

GitHub connection, source setup, and exact tree availability are separate facts:

1. connected GitHub state proves durable repository identity and permits live pull request reads;
2. the establishing provisioning run proves whether initial source setup is running, failed, or
   complete;
3. `observations_vaultRepository_branchTrees` caches only one exact branch tree for editor and file
   work, and a missing row is hydrated on demand.

The dashboard does not use tree-cache presence as repository readiness. It can show live pull
requests while initial tree sync is running or failed, while editor/file controls still fail closed
until they hydrate the exact branch tree they need. `getUserVaults` has no top-level
ready/copying/failed projection; each surface derives its gate from connection, source setup,
provider setup, and deletion state. This section and `specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md`
define the current runtime.

## Current Problem

The superseded repository-first runtime created a provisioning run before a vault, then created the
vault only after GitHub repository creation, starter seeding, and tree fetch succeeded. The current
runtime has no pre-vault run or `create_vault` step: it creates the initializing vault first so
every failure has the dashboard object users inspect and retry.

## Goals

1. Create a durable vault row before external GitHub provisioning work starts.
2. Represent GitHub connection state as a required discriminated union.
3. Use the same GitHub state machine for Samebase-managed repository creation and
   existing-repository connection.
4. Permit Convex project and Cloudflare Worker attachments only for connected GitHub vaults.
5. Keep repository-backed features gated on connected GitHub state.
6. Keep failures structured enough that a later retry action can target one failed provider workflow
   block on one vault.
7. Keep operation-specific fields inside the matching provisioning or failed variant.
8. Keep the required target shape direct, with no compatibility readers or validators.

## Non-Goals

1. Make repo-less vaults usable as source workspaces.
2. Allow changing the connected GitHub repository identity in place.
3. Build a generic provider framework.
4. Redesign unrelated editor, file staging, branch, PR, or Codespaces flows beyond the required
   connected-GitHub guard.
5. Add generic user-facing retry without a concrete failed provider workflow block.
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
transition a connected vault to top-level `failed`. Model those through stable child attachments,
live provider observations, workflow state, or derived dashboard summaries while preserving the
connected GitHub identity.

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
are dashboard summaries derived from repository connection, source setup, stable attachments, live
provider observations, and workflow state. Storing a top-level lifecycle would create another source
of truth that can drift. If the product later needs a user-controlled state such as archive/hide,
model that as a separate explicit field instead of mixing it with provisioning health.

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
      runId: Id<"workflow_vaultProvisioning_runs">;

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
      runId: Id<"workflow_vaultProvisioning_runs">;

      /** Timestamp when this GitHub connection attempt started. */
      startedAt: number;
    } & GitHubRepositoryCoordinates)
  | ({
      /** GitHub is connected; repo-backed vault behavior is now allowed. */
      state: "connected";

      /** Records whether this vault created the repo or attached an existing repo. */
      githubMode: "create_repository" | "connect_existing_repository";

      /** Durable run that established this GitHub connection. */
      runId: Id<"workflow_vaultProvisioning_runs">;

      /** Immutable GitHub repository id; prevents in-place repo replacement. */
      ghRepoId: string;

      /** Default branch for source views and initial tree sync. */
      defaultBranch: string;

      /** Timestamp when the vault first became a usable source workspace. */
      connectedAt: number;
    } & GitHubRepositoryWithVisibility)
  | ({
      /** Latest GitHub repository creation attempt failed. */
      state: "failed";

      /** Failed GitHub operation kind; selects the valid retry behavior. */
      githubMode: "create_repository";

      /** Durable run that recorded the failure. */
      runId: Id<"workflow_vaultProvisioning_runs">;

      /** Timestamp when the latest failure was recorded. */
      failedAt: number;
    } & GitHubRepositoryWithVisibility)
  | ({
      /** Latest existing GitHub repository connection attempt failed. */
      state: "failed";

      /** Failed GitHub operation kind; selects the valid retry behavior. */
      githubMode: "connect_existing_repository";

      /** Durable run that recorded the failure. */
      runId: Id<"workflow_vaultProvisioning_runs">;

      /** Timestamp when the latest failure was recorded. */
      failedAt: number;
    } & GitHubRepositoryCoordinates);
```

Connected GitHub state describes repository identity. Provisioning and failed states describe the
current operation. Existing-repo provisioning and failed variants must not carry fake create-only
fields such as requested visibility.

Connected is an absorbing GitHub identity state. Once a vault reaches `state: "connected"`, it must
not move back to top-level `state: "failed"`. Top-level failed variants mean "GitHub never became
connected." Later failures must be represented by live provider observations, workflow state, or a
future connected-only GitHub health state. Stable Convex and Cloudflare attachment rows remain
representable because the vault stays connected.

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

Convex and Cloudflare do not live on the vault row. `vaultConvexProjects` and
`vaultCloudflareWorkers` store independent stable attachments only after GitHub connects. Current
provider configuration, builds, deployments, and URLs are read live; provisioning progress and
failure live in workflow runs, events, and locks. Connected-to-failed remains forbidden because
later provider or tree failures do not erase established GitHub identity.

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
created the GitHub repository" and "Samebase manages infrastructure." Repository origin is
represented by `githubMode`; provider resource origin is stored on each stable attachment row.

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
7. `connectedAt`: audit timestamp for when the vault first became a usable repository workspace.

Branch tree state lives only in `observations_vaultRepository_branchTrees`. Each row requires the
branch head `commitSHA`, stores its tree SHA as `treeData.sha`, and rejects truncated trees. The
vault row has no tree snapshot mirror or fallback.

## Removed Compatibility Surfaces

The current model has no runtime or schema variant for pre-vault runs, run-less events, vault-row
tree mirrors, aggregate `vaults.infra*` state, repository refresh queues, branch catalogs, pull
request/check mirrors, copied provider domain URLs, or a top-level dashboard readiness projection.
Existing single-user rows may be removed before a narrow schema deploy; compatibility reads and
optional validators are errors.

## Create New App Flow

For Samebase-managed repository creation:

1. validate local input shape, including the selected GitHub user/org owner
2. in one mutation, insert the vault, insert the provisioning run with required `vaultId`, then
   patch the vault to `state: "provisioning", githubMode: "create_repository", runId, owner, name`
3. start the create-app Workflow
4. create the GitHub repository
5. write `state: "connected", githubMode: "create_repository"` with the same `runId`, immutable repo
   identity, and confirmed repository visibility
6. seed the starter app
7. sync the exact default-branch tree into `observations_vaultRepository_branchTrees`
8. attach Convex and Cloudflare resources directly to the vault
9. let the dashboard derive its summaries from source setup, attachments, live observations, and
   workflow state

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
5. write `state: "connected", githubMode: "connect_existing_repository"` with fetched repository
   identity and visibility stored
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

New create and connect workflows create runs with a required `vaultId`. One internal mutation
inserts the vault and run and patches the vault into provisioning state before starting the
Workflow. No historical nullable run variant remains.

Run and event helpers should continue to record user-safe status only. Secrets, tokens, env values,
deploy keys, request headers, and raw provider payloads remain forbidden in run/event records.

## Dashboard Behavior

The dashboard should render the vault immediately after insert.

The vault label should be derived from GitHub state:

1. provisioning or failed: targeted `owner/name`
2. connected: current `owner/name`
3. not connected: generic GitHub connection prompt, unless a future feature adds a justified
   user-supplied placeholder name

Provider rows should read from explicit boundaries:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: stable project attachments, live provider observations, and relevant workflow state
3. Cloudflare: stable Worker attachments, live provider observations, and relevant workflow state

Repo-backed controls should stay hidden or disabled until GitHub is connected. If manual retry
buttons later exist, they should target the failed provider workflow block on that vault.

Dashboard summary labels such as creating, active, degraded, or failed should be derived from the
independent connection, setup, attachment, live-observation, workflow, and deletion axes. For
example:

1. `creating`: source or provider provisioning is running
2. `active`: GitHub is connected and provider attachments are configured or intentionally absent
3. `degraded`: GitHub is connected, but a non-blocking live provider read or workflow block failed
4. `failed`: GitHub failed before the vault became usable as a source workspace

These labels are presentation logic unless a future query or product workflow needs a stored
materialized summary.

A connected vault may render a failed or degraded dashboard summary, but its stored GitHub state
remains `connected`. The summary describes current health; the state describes whether the vault has
durable repository identity.

## Convex And Cloudflare State Direction

The product model should not treat Convex and Cloudflare as one generic `infraState`. They are
independent provider integrations after GitHub source setup succeeds, and they can progress, fail,
and retry independently.

The current state model is:

1. GitHub state says whether the vault has durable repository identity
2. source setup summarizes the establishing run independently of disposable exact-tree rows
3. `vaultConvexProjects` stores attached Convex project identity plus its confirmed
   `convexConfigPath`
4. `vaultCloudflareWorkers` stores attached Cloudflare Worker identity; live Workers Builds supplies
   its current root and trigger configuration
5. dashboard labels such as creating, active, degraded, failed, or partial are derived from those
   resource rows, the active provisioning write lock, and run/event state
6. provider retry actions target the failed block run, not a generic aggregate infra status

Top-level aggregate infrastructure fields have been removed. Dashboard and provisioning code read
direct resource attachments, provider observations, and run/write-lock state.

`vaultConvexProjects` and `vaultCloudflareWorkers` keep only stable provider identity, confirmed
Convex source placement, origin, and creation time. `workflow_vaultProvisioning_writeLocks` keeps
operation state. Current provider URLs, builds, deployments, routes, roots, triggers, and markers
are read from providers when needed.

## Migration

Samebase has one operator who can remove existing vault data before a narrow schema deployment.
Schema and code therefore move directly to the required target shape. Do not widen validators,
dual-read, dual-write, or preserve old table/field variants.

The operator clears rows that conflict with a required validator and removes rows from dropped
tables before deployment. Product runtime must not hide destructive migration behavior inside normal
requests.

## Parked Follow-Up Work

These items are intentionally outside the current New App reliability path:

1. Revisit parked Codespaces branch defaults after Codespaces work resumes.
2. Define explicit manual provider retry UX only when a current failure case needs it. Any future
   retry action should target one failed provider workflow block, create a new run, and preserve
   older runs and events as history.
3. Consider a generic restart-from-failed-step abstraction only after manual provider retry has
   proven the provider-state model.

## Testing Plan

Backend:

1. create-app inserts a vault before external GitHub calls
2. create-app run is created with required `vaultId`
3. create-app success writes connected Samebase-managed GitHub state
4. connected GitHub state stores the run that established the connection
5. create-app GitHub failure writes failed GitHub state on the vault
6. connected GitHub state stores current repository visibility
7. pre-GitHub vaults cannot own Convex project or Cloudflare Worker attachments
8. connected GitHub identity cannot change to a different `ghRepoId`
9. connected GitHub state cannot transition to top-level failed
10. post-connected provider failures preserve connected GitHub state
11. repo-backed helpers reject pre-GitHub vaults
12. connected vaults without an exact branch tree still expose live pull requests, while file and
    editor behavior hydrates that branch or fails closed
13. connected Samebase-managed vaults whose create run failed in `seed_starter` or `sync_tree`
    expose a dashboard source-setup failure summary derived from the run/events
14. source and staging paths read exact branch state from `observations_vaultRepository_branchTrees`
    without a vault-row fallback
15. provisioning events require `runId` and provisioning runs require `vaultId`
16. dashboard/provisioning summaries derive from direct attachments, live provider observations,
    and run/write-lock state
17. the vault row has no aggregate `vaults.infra*` mirrors
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
5. source readiness is driven by the explicit setup summary, independently of disposable tree rows
6. dashboard summaries for Convex and Cloudflare are derived separately, not from a generic
   `infraState`
7. when manual retry ships, the failed provider workflow block shows its retry target on the vault
8. when existing-repo onboarding ships, connected existing-repo vaults render like other connected
   vaults after GitHub state is connected

## Acceptance Criteria

1. New Samebase-managed app creation has a visible vault before GitHub provisioning completes.
2. Existing-repository connection uses the same GitHub state model.
3. Repo-backed features cannot run against pre-GitHub vaults.
4. Convex project and Cloudflare Worker attachments cannot exist unless GitHub is connected.
5. Connected GitHub repository identity is immutable.
6. Connected GitHub state records the run that established the connection.
7. Connected GitHub state stores current repository visibility.
8. Connected GitHub state is not replaced by top-level failed state.
9. Post-GitHub source setup failures are visible while the connected vault can still list live pull
   requests.
10. No temporary compatibility table, field, validator, reader, or writer remains.
11. Failure messages are read from provisioning events rather than duplicated on the vault row.
12. Convex and Cloudflare progress and failure are derived separately from stable attachments, live
    provider observations, and workflow state.
13. Aggregate `vaults.infra*` mirrors are absent.
14. When retries ship, they create new runs rather than mutating previous terminal runs.
