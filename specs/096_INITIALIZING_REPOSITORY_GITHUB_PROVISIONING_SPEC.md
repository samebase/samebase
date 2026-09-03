# Initializing Repository GitHub Provisioning Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase app creation, existing repository onboarding, and repository model
- Created: 2026-05-07
- Last updated: 2026-09-03
- Related docs:
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
  - `research/2026-05-06-vault-first-provisioning-model.md`

## Summary

Create a repository before GitHub provisioning completes, but only as an initializing provisioning
shell. The repository is the durable dashboard object for progress, failure, and retry. It is not a
usable repository workspace until its GitHub state is explicitly connected.

This replaces the pre-repository run gap with a stable `repositoryId` while preserving the strong
invariant that repository-backed behavior requires a connected GitHub repository. GitHub connection
means durable repository identity, not a fresh branch tree. Branch tree data is cache state and
repository-backed file/tree behavior must still fail closed until the relevant branch snapshot
exists. Convex project and Cloudflare Worker attachment rows only exist for connected GitHub
repositories, so those integrations cannot exist while GitHub is still provisioning or failed.

The temporary compatibility layers have been removed. The primary product promise is still simple:
the user clicks New App and either gets a usable app or a clear setup failure.

## Current Implementation

The repository and provisioning run are created together before external provider writes. The public
action completes provider access and name preflight first. A preflight failure does not create a
dashboard repository. Runs and events always have a repository, repository full name, and run
identity. No pre-repository run shape remains.

GitHub connection, source setup, and exact tree availability are separate facts:

1. connected GitHub state proves durable repository identity and permits live pull request reads;
2. the establishing provisioning run proves whether initial source setup is running, failed, or
   complete;
3. `observations_repository_branchTrees` caches only one exact branch tree for editor and file work,
   and a missing row is hydrated on demand;
4. connected repository variants keep only the live tree-refresh claim, latest failure, and cooldown
   fields needed to coordinate those on-demand hydrations.

The dashboard does not use tree-cache presence as repository readiness. It can show live pull
requests while initial tree sync is running or failed, while editor/file controls still fail closed
until they hydrate the exact branch tree they need. `getUserRepositories` has no top-level
ready/copying/failed projection; each surface derives its gate from connection, source setup,
provider setup, and deletion state. This section and `specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md`
define the current runtime.

## Removed Model

The superseded repository-first runtime created a provisioning run before a repository, then created
the repository only after GitHub repository creation, starter seeding, and tree fetch succeeded. The
current runtime has no pre-repository run or `create_repository` step. After provider preflight
succeeds, it creates the initializing repository before any provider write, so workflow failures
have a dashboard object that users can inspect.

## Goals

1. Create a durable repository row before external provider writes start.
2. Represent GitHub connection state as a required discriminated union.
3. Use the same GitHub state machine for Samebase-managed repository creation and connection of an
   existing repository.
4. Permit Convex project and Cloudflare Worker attachments only for connected GitHub repositories.
5. Keep repository-backed features gated on connected GitHub state.
6. Keep failures structured enough that a later retry action can target one failed provider workflow
   block on one repository.
7. Keep operation-specific fields inside the matching provisioning or failed variant.
8. Keep the required target shape direct, with no compatibility readers or validators.

## Non-Goals

1. Make repositories without a GitHub connection usable as source workspaces.
2. Allow changing the connected GitHub repository identity in place.
3. Build a generic provider framework.
4. Redesign unrelated editor, file staging, branch, or PR flows beyond the required connected-GitHub
   guard.
5. Add generic user-facing retry without a concrete failed provider workflow block.
6. Add automatic restart-from-failed-step controls. Step-local backend retries for idempotent
   provider work are still in scope after visibility is clear.

## Repository Invariant

A repository may exist before GitHub is connected, but repository-backed behavior must require
connected GitHub state.

These behaviors must fail closed or stay hidden unless `repository.state === "connected"`:

1. file tree reads
2. file staging
3. collaborative edits
4. branch metadata refresh
5. pull request metadata
6. commits and media uploads
7. infrastructure steps that require GitHub repository identity

Once a repository reaches connected GitHub state, its `githubRepositoryDatabaseId` is immutable. If
the user wants to use a different repository, the product must remove the old repository from
Samebase, then create or connect another Samebase repository. It must not mutate repository identity
under existing repository-bound data.

The top-level GitHub state is also one-way after connection. Repository access problems, deleted
GitHub repositories, permission loss, branch refresh failures, Convex failures, and Cloudflare
failures must not transition a connected repository to top-level `failed`. Model those through
stable child attachments, live provider observations, workflow state, or derived dashboard summaries
while preserving the connected GitHub identity.

## State Model

Use required discriminated state objects instead of optional scattered provider fields.

Conceptual shape:

```ts
/** Persisted repository row: base fields plus exactly one source-workspace state. */
type RepositoryRow = RepositoryBase & RepositoryGitHubState;

/** Fields every repository row has regardless of GitHub connection state. */
type RepositoryBase = {
  /** Ownership and authorization boundary for the repository. */
  organizationId: Id<"organizations">;

  /** Independent Samebase removal state. */
  deletion: RepositoryDeletionState;

  /** Stable creation time, preserved across the repository-table migration. */
  createdAt: number;
};
```

The TypeScript mental model can be `RepositoryBase & RepositoryGitHubState`. The Convex schema
should still define `repositories` as a union of complete row validators that share the base fields,
because the validator API represents persisted discriminated unions as concrete object variants.

Do not store an overall `lifecycleState` for `creating`, `active`, `degraded`, or `failed`. Those
are dashboard summaries derived from repository connection, source setup, stable attachments, live
provider observations, and workflow state. Storing a top-level lifecycle would create another source
of truth that can drift. If the product later needs a user-controlled state such as archive/hide,
model that as a separate explicit field instead of mixing it with provisioning health.

GitHub state:

```ts
/**
 * GitHub is the gate for a repository becoming a usable source workspace.
 * These fields live on the repository row itself; `state` is top-level because
 * GitHub is the source-workspace state of the repository.
 */
/** GitHub visibility values currently supported by Samebase's create flow. */
type GitHubRepositoryVisibility = "private" | "public";

/**
 * GitHub repository name within the repository's organization owner.
 * The organization supplies the current owner login.
 */
type GitHubRepositoryTarget = {
  /** GitHub repository name. */
  githubRepositoryName: string;
};

/**
 * Repository coordinates plus visibility.
 * Used for requested create intent and connected GitHub metadata.
 */
type GitHubRepositoryWithVisibility = GitHubRepositoryTarget & {
  /** Repository visibility, either requested intent or current GitHub metadata. */
  visibility: GitHubRepositoryVisibility;
};

type SamebaseManagedProviderDestinations = {
  convexTeamId: string;
  cloudflareAccountId: string;
};

type ExistingRepositoryProviderDestinations = {
  convexTeamId?: string;
  cloudflareAccountId?: string;
};

type ConnectedGitHubFields = GitHubRepositoryWithVisibility & {
  runId: Id<"workflow_repositoryProvisioning_runs">;
  githubRepositoryDatabaseId: string;
  defaultBranch: string;
  connectedAt: number;
  treeRefreshStartedAt?: number;
  lastTreeRefreshFailedAt?: number;
  treeRefreshFailureKind?: "failed" | "rate_limited";
  treeRefreshFailureMessage?: string;
  treeRefreshCooldownUntil?: number;
};

type RepositoryGitHubState =
  | ({
      /** Explicit empty state for future manual connection flows. */
      state: "not_connected";
    } & ExistingRepositoryProviderDestinations)
  | ({
      /** GitHub repository creation is in progress for this repository. */
      state: "provisioning";

      /**
       * Distinguishes repository creation from connection of an existing repository.
       * This is named for GitHub because the repository row is flattened.
       */
      githubMode: "create_repository";

      /** Durable run that owns the in-flight repository creation operation. */
      runId: Id<"workflow_repositoryProvisioning_runs">;

      /** Timestamp when this GitHub provisioning attempt started. */
      startedAt: number;
    } & SamebaseManagedProviderDestinations &
      GitHubRepositoryWithVisibility)
  | ({
      /** Existing GitHub repository connection is in progress for this repository. */
      state: "provisioning";

      /**
       * Distinguishes connection of an existing repository from repository creation.
       * This is named for GitHub because the repository row is flattened.
       */
      githubMode: "connect_existing_repository";

      /** Durable run that owns the in-flight connection of an existing repository. */
      runId: Id<"workflow_repositoryProvisioning_runs">;

      /** Timestamp when this GitHub connection attempt started. */
      startedAt: number;
      githubRepositoryDatabaseId?: string;
    } & ExistingRepositoryProviderDestinations &
      GitHubRepositoryTarget)
  | ({
      /** GitHub is connected; repository-backed behavior is now allowed. */
      state: "connected";

      /** Samebase created this GitHub repository. */
      githubMode: "create_repository";
    } & SamebaseManagedProviderDestinations &
      ConnectedGitHubFields)
  | ({
      /** GitHub is connected; repository-backed behavior is now allowed. */
      state: "connected";

      /** Samebase connected an existing GitHub repository. */
      githubMode: "connect_existing_repository";
    } & ExistingRepositoryProviderDestinations &
      ConnectedGitHubFields)
  | ({
      /** Latest GitHub repository creation attempt failed. */
      state: "failed";

      /** Failed GitHub operation kind; selects the valid retry behavior. */
      githubMode: "create_repository";

      /** Durable run that recorded the failure. */
      runId: Id<"workflow_repositoryProvisioning_runs">;

      /** Timestamp when the latest failure was recorded. */
      failedAt: number;
    } & SamebaseManagedProviderDestinations &
      GitHubRepositoryWithVisibility)
  | ({
      /** Latest existing GitHub repository connection attempt failed. */
      state: "failed";

      /** Failed GitHub operation kind; selects the valid retry behavior. */
      githubMode: "connect_existing_repository";

      /** Durable run that recorded the failure. */
      runId: Id<"workflow_repositoryProvisioning_runs">;

      /** Timestamp when the latest failure was recorded. */
      failedAt: number;
      githubRepositoryDatabaseId?: string;
    } & ExistingRepositoryProviderDestinations &
      GitHubRepositoryTarget);
```

Connected GitHub state describes repository identity. Provisioning and failed states describe the
current operation. Existing-repository provisioning and failed variants must not carry fake
create-only fields such as requested visibility.

Connected is an absorbing GitHub identity state. Once a repository reaches `state: "connected"`, it
must not move back to top-level `state: "failed"`. Top-level failed variants mean "GitHub never
became connected." Later failures must be represented by live provider observations, workflow state,
or a future connected-only GitHub health state. Stable Convex and Cloudflare attachment rows remain
representable because the repository stays connected.

The extracted repository field groups are deliberately small. Every GitHub-targeted state stores
`githubRepositoryName`. The repository's `organizationId` resolves the current owner login from
`organizations.githubOwnerLogin`. `visibility` joins the repository name only where the state has
either requested create visibility or confirmed GitHub visibility. State-specific fields such as
`runId` and `defaultBranch` stay inline on the variants that give them meaning.

State transitions carry `githubRepositoryName` and visibility from provisioning to connected state,
then replace requested intent with the confirmed GitHub values. One known gap remains: GitHub
creation and the connected-state write are separate Workflow steps. If GitHub creation succeeds but
the next step fails, the create-failed repository does not retain `githubRepositoryDatabaseId`.
Samebase cannot use that failed row to remove the created GitHub repository. A later model change
must preserve the confirmed identity before automatic cleanup can support this case.

Convex and Cloudflare resource identity does not live on the repository row.
`repositoryConvexProjects` and `repositoryCloudflareWorkers` store independent attachments only
after GitHub connects. The repository stores only its fixed `convexTeamId` and `cloudflareAccountId`
destinations when those providers are configured. Samebase-managed creation requires both.
Existing-repository connection can start without either one. Provisioning progress and failure live
in workflow runs, events, and locks. Connected-to-failed remains forbidden because later provider or
tree failures do not erase established GitHub identity.

Provider payloads that are large, frequently refreshed, or branch-specific should live in
provider-owned child tables. The connected GitHub state should identify the repository and default
branch; it should not force every branch tree payload to remain inline on the repository forever.

## Field Rationale

Every stored field should either enforce a durable domain invariant, preserve user intent that
cannot be derived later, or support a known query/sort path. If a field only mirrors another field,
prefer deriving it so bad states become unrepresentable.

Base repository fields:

1. `organizationId`: required durable ownership boundary. Authorization requires a current
   membership in that organization.
2. `deletion`: required removal gate that is independent from GitHub connection state.
3. `createdAt`: stable product creation ordering. The repository-table migration copied the source
   document's `_creationTime` into this field because the target document received a new Convex
   `_creationTime` during the copy.

Do not add `updatedAt` in the first repository-state pass. It should exist only when there is a
shipped query or workflow that intentionally sorts by explicit recency. It must not be treated as
lifecycle state, and UI lists that should not reshuffle must use a stable sort instead.

Root `displayName` is not part of this shape. Its only durable utility is before GitHub connection,
and those states already carry better operation intent. Dashboard labels should combine
`organizations.githubOwnerLogin` with `githubRepositoryName` in every state that has a GitHub
target.

Reusing `githubRepositoryName` across provisioning, failed, and connected variants is intentional.
In provisioning and failed states, it is the requested or targeted GitHub repository name. In
connected state, it is the current repository name used for API calls and display. The organization
supplies the owner for all variants, and the `state` field makes the field's meaning explicit.

The `not_connected` state deliberately has no user-supplied label. If future manual blank-repository
creation needs a user-named placeholder, add a separate field with a concrete product reason instead
of carrying a root label now.

Root `isSamebaseManaged` should also not be part of this shape. It is ambiguous between "Samebase
created the GitHub repository" and "Samebase manages infrastructure." Repository origin is
represented by `githubMode`; provider resource origin is stored on each stable attachment row.

GitHub state fields:

1. `state`: the primary source-workspace discriminant for the repository. It is intentionally
   top-level because GitHub connection is what makes a repository usable. It is not a lifecycle
   summary.
2. `githubMode`: required on every GitHub-targeted state because creating a new repository and
   connecting an existing repository need different fields before connection and remain useful
   provenance after connection. It is not present on `not_connected` because no GitHub operation has
   been selected yet.
3. `runId`: ties the current GitHub state to a durable run and event log. In provisioning state, it
   owns the in-flight attempt. In failed state, it is the run that recorded the latest failure. In
   connected state, it is the run that established the GitHub connection. It must not mean "latest
   run for this repository" because later Convex/Cloudflare retries can have their own runs.
4. The GitHub owner login is not stored on `repositories`. `organizationId` resolves the only
   current copy from `organizations.githubOwnerLogin`.
5. `githubRepositoryName`: repository name. In provisioning and failed states, this is the requested
   or targeted repository name. In connected state, this is the current GitHub repository name.
6. `visibility`: in `create_repository` provisioning and failed states, this is requested create
   intent. In connected state, this is the visibility confirmed when the GitHub connection was
   established. The current runtime has no later visibility refresh path. Existing-repository
   provisioning and failed states do not carry visibility.
7. Failed states preserve the same `githubRepositoryName` target used by the attempt, plus any
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

The target owner is product input represented by the selected Samebase organization. The New App UI
presents the viewer's GitHub-backed organizations and passes the selected `organizationId` into
create-app. After provider preflight succeeds, the backend can insert the initializing repository
and run before any provider write because `organizationId`, `githubRepositoryName`, and `visibility`
are local request intent.

The failed repository creation variant stores only requested create intent. As noted above, it does
not yet preserve a GitHub repository database ID when creation succeeds but the connected-state
write fails.

Connected GitHub fields:

1. `githubMode`: records whether Samebase created or connected the GitHub repository. It is
   connected-state provenance after success.
2. `runId`: records the run that established the connected GitHub identity. Later provider retries
   must not overwrite it unless they are retrying the GitHub connection itself.
3. `githubRepositoryDatabaseId`: immutable repository identity. This is the field that prevents
   accidental in-place repository replacement.
4. `githubRepositoryName`: current repository name. The organization supplies the current owner
   login for the dashboard label and API target.
5. `visibility`: repository visibility confirmed when the GitHub connection was established.
6. `defaultBranch`: repository metadata needed for default source views.
7. `connectedAt`: timestamp when Samebase recorded the durable GitHub connection.
8. `treeRefreshStartedAt`: the live repository-wide refresh claim. It prevents concurrent tree
   fetches and is ignored after the shared stale-lock threshold.
9. `lastTreeRefreshFailedAt`: timestamp of the latest tree-refresh failure. Surfaces compare it with
   the relevant branch observation's `lastTreeRefreshAt` so a later successful refresh wins.
10. `treeRefreshFailureKind`: distinguishes an ordinary failure from provider rate limiting without
    turning either into GitHub connection state.
11. `treeRefreshFailureMessage`: user-safe detail for the current failure. It is cleared by a later
    successful claim unless a newer cooldown failure must be preserved.
12. `treeRefreshCooldownUntil`: the live provider backoff deadline. Claims fail closed while it is
    active.

Branch tree state lives only in `observations_repository_branchTrees`. Each row requires the branch
head `commitSHA`, stores its tree SHA as `treeData.sha`, and rejects truncated trees. The repository
row has no tree snapshot mirror or fallback. The five optional tree-refresh fields above are
connected-variant coordination and failure state, not cached tree data or repository identity. They
must not appear on pre-connection or top-level failed variants.

## Removed Compatibility Surfaces

The current model has no runtime or schema variant for pre-repository runs, run-less events,
repository-row tree mirrors, aggregate `repositories.infra*` state, repository refresh queues,
branch catalogs, pull request/check mirrors, copied provider domain URLs, or a top-level dashboard
readiness projection. The production data uses this required model. Compatibility reads and optional
migration validators are errors.

## Create New App Flow

For Samebase-managed repository creation:

1. The public action validates local input, resolves GitHub access, resolves the Convex and
   Cloudflare connections, checks all provider names, and validates the selected Workers Builds
   token.
2. One internal mutation inserts the repository, provisioning run, provider plan, and managed write
   lock. It patches the repository to
   `state: "provisioning", githubMode: "create_repository", runId, githubRepositoryName`, starts the
   create Workflow, and stores the Workflow ID.
3. The Workflow validates current provider connections.
4. It creates the GitHub repository.
5. It writes `state: "connected", githubMode: "create_repository"` with the same `runId`, immutable
   GitHub repository identity, and confirmed repository visibility.
6. It seeds the starter app.
7. It syncs the exact default-branch tree into `observations_repository_branchTrees`.
8. It provisions and attaches the planned Convex and Cloudflare resources.
9. The dashboard derives its summaries and controls from source setup, the managed provider plan,
   attachments, live observations, and provider-write state

New App initializes its required Convex production region from the organization default. The user
can choose US or EU for this app without changing that default. Spec 003 owns the plan and provider
create behavior.

New App checks provider names before submit. If the create action then finds a Convex project or
Cloudflare Worker name conflict, New App shows it under the affected name field and gives a numbered
name suggestion.

Name inputs show the final name that Samebase will use when repository or provider rules change the
entered text. This information does not block creation. Samebase checks and submits the displayed
final name. The displayed final name is an action. Selecting it replaces the entered text with the
final name and removes the information. A name blocks creation only when Samebase cannot produce a
valid name or the final name is not available.

Provider preflight happens before the repository exists. Provider writes happen only after the
repository, run, plan, and managed write lock exist. The selected organization provides the GitHub
owner.

## Existing Repository Flow

Connecting an existing repository must use the same repository/run/GitHub state model:

1. The public action fetches the selected GitHub repository by `githubRepositoryDatabaseId` and
   verifies its organization owner.
2. One mutation inserts the repository and run, then patches the repository to
   `state: "provisioning", githubMode: "connect_existing_repository", runId, githubRepositoryDatabaseId, githubRepositoryName`.
3. A separate mutation starts the connect-existing Workflow. A start failure marks the repository
   and run as failed.
4. The Workflow fetches the GitHub repository again and verifies its default branch.
5. It writes `state: "connected", githubMode: "connect_existing_repository"` with the fetched
   identity and visibility.
6. It syncs the default-branch tree.
7. It creates no Convex project or Cloudflare Worker attachments.
8. The dashboard derives the repository summary from connection, setup, attachments, observations,
   and deletion state.

## Provisioning Runs

Runs are workflow attempts, not one-per-repository records. A repository can have many historical
runs over time:

1. the initial repository creation attempt
2. a connect-existing attempt
3. a managed infrastructure retry for an already connected Samebase-managed repository

The current product has no failed GitHub creation retry and no failed existing repository connection
retry. Managed infrastructure retry creates a new run and replaces the failed managed write lock. It
does not change the connected repository's establishing `runId`. Standalone manual provider actions
do not create provisioning runs.

New create and connect workflows create runs with a required `repositoryId`. One internal mutation
inserts the repository and run and patches the repository into provisioning state before starting
the Workflow. No historical nullable run variant remains.

Run and event helpers should continue to record user-safe status only. Secrets, tokens, env values,
deploy keys, request headers, and raw provider payloads remain forbidden in run/event records.

## Dashboard Behavior

The dashboard should render the repository immediately after insert.

The repository label should be derived from GitHub state:

1. provisioning or failed: organization owner login plus targeted `githubRepositoryName`
2. connected: organization owner login plus current `githubRepositoryName`

`not_connected` remains a schema state, but `getUserRepositories` does not return it to the current
dashboard.

Provider rows should read from explicit boundaries:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: stable project attachments, live provider observations, and relevant workflow state
3. Cloudflare: stable Worker attachments, live provider observations, and relevant workflow state

For a new Samebase-managed app, Settings shows applicable planned Convex and Cloudflare rows
immediately, before their attachment rows exist. It uses the planned project and Worker names as the
primary labels. While the managed provider run is active, each target shows `Setting up` and does
not show an empty, attention, or manual repair state. Spec 115 defines the exact plan, attachment,
and observation row precedence.

The transaction that creates a new-app or managed retry run also creates its active managed provider
lock. The lock covers source setup and provider setup. A source setup failure marks the matching
lock failed without changing provider freshness. A `connect_existing_repository` run is source-only
and never creates or owns the provider lock.

Overview and Settings remain available during setup. Before GitHub connects, Overview shows source
setup. After GitHub connects, Overview shows the normal repository content, including the default
branch and pull requests, with a small `Setting up` status for provider work. Provider setup must
not replace the normal repository content.

After a provider write, an affected target shows `Checking` until one observation made with the new
provider write time returns. The dashboard must not use an older observation for attention or
repair.

Repository-backed controls should stay hidden or disabled until GitHub is connected. Managed Retry
targets the failed managed run. Manual provider repair targets the selected attachment and current
provider observation. While a managed provider operation or a manual provider write is active, the
dashboard disables conflicting provider changes, managed Retry, and repository removal. The frontend
derives this state from the dashboard subscription. Overview, Settings, safe reads, provider links,
and observation reloads remain available.

If a manual action is silent at expiry, the backend marks it failed and advances the affected
provider write times. Settings shows `Checking` while it gets fresh provider observations. It then
shows the same normal create, attach, configure, or repair actions that apply to the observed state.
There is no manual replay state, special Retry action, or automatic provider call.

Dashboard summary labels such as creating, active, degraded, or failed should be derived from the
independent connection, setup, attachment, live-observation, workflow, and deletion axes. For
example:

1. `creating`: source or provider provisioning is running
2. `active`: GitHub is connected and provider attachments are configured or intentionally absent
3. `degraded`: GitHub is connected, but a non-blocking live provider read or workflow block failed
4. `failed`: GitHub failed before the repository became usable as a source workspace

These labels are presentation logic unless a future query or product workflow needs a stored
materialized summary.

A connected repository may render a failed or degraded dashboard summary, but its stored GitHub
state remains `connected`. The summary describes current health; the state describes whether the
repository has durable repository identity.

## Convex And Cloudflare State Direction

The product model should not treat Convex and Cloudflare as one generic `infraState`. They are
independent provider integrations after GitHub source setup succeeds, and they can progress, fail,
and retry independently.

The current state model is:

1. GitHub state says whether the repository has durable repository identity
2. source setup summarizes the establishing run independently of disposable exact-tree rows
3. `repositoryConvexProjects` stores attached Convex project identity plus its confirmed config-file
   or directory code location
4. `repositoryCloudflareWorkers` stores the Worker identity and approved coordinates from spec 115
5. dashboard labels such as creating, active, degraded, failed, or partial are derived from those
   resource rows, the active provisioning write lock, and run/event state
6. managed Retry targets the failed managed run, while manual repair targets an exact attachment and
   live provider state

Top-level aggregate infrastructure fields have been removed. Dashboard and provisioning code read
direct resource attachments, provider observations, and run/write-lock state.

`repositoryConvexProjects` and `repositoryCloudflareWorkers` keep the identity, approved placement,
origin, and creation facts that spec 115 defines. `workflow_repositoryProvisioning_writeLocks` keeps
operation state. Current provider state cannot rewrite approved attachment coordinates.

## Migration State

The repository-table migration is complete. Provisioning runs store required `organizationId` and
`repositoryId` references. Product runtime has no missing-organization or old-table fallback.

## Testing Plan

Backend:

1. create-app inserts a repository before external provider writes
2. create-app run is created with required `repositoryId`
3. create-app success writes connected Samebase-managed GitHub state
4. connected GitHub state stores the run that established the connection
5. create-app GitHub failure writes failed GitHub state on the repository
6. connected GitHub state stores the visibility confirmed when the connection was established
7. pre-GitHub repositories cannot own Convex project or Cloudflare Worker attachments
8. connected GitHub identity cannot change to a different `githubRepositoryDatabaseId`
9. connected GitHub state cannot transition to top-level failed
10. post-connected provider failures preserve connected GitHub state
11. repository-backed helpers reject pre-GitHub repositories
12. connected repositories without an exact branch tree still expose live pull requests, while file
    and editor behavior hydrates that branch or fails closed
13. connected Samebase-managed repositories whose create run failed in `seed_starter` or `sync_tree`
    expose a dashboard source-setup failure summary derived from the run/events
14. source and staging paths read exact branch state from `observations_repository_branchTrees`
    without a repository-row fallback
15. provisioning events require `runId`, and provisioning runs require `organizationId` and
    `repositoryId`
16. dashboard/provisioning summaries derive from direct attachments, live provider observations, and
    run/write-lock state
17. the repository row has no aggregate `repositories.infra*` mirrors
18. managed retries prove idempotency and keep terminal failures visible through the same run/event
    summaries
19. onboarding an existing repository writes connected GitHub state for that repository
20. create and managed retry runs own the provider lock from their creation transaction
21. `connect_existing_repository` runs never own the provider lock
22. source setup failure ends the matching managed lock without changing provider freshness

Frontend:

1. dashboard shows initializing repository provider state
2. repository-backed controls are hidden or disabled before GitHub connection
3. delete dialog only offers GitHub repository deletion for confirmed connected Samebase-managed
   repositories
4. connected-without-tree failures render as setup failed with the relevant provisioning message/log
   instead of only showing `setting up...`
5. source readiness is driven by the explicit setup summary, independently of disposable tree rows
6. dashboard summaries for Convex and Cloudflare are derived separately, not from a generic
   `infraState`
7. a failed managed provider run shows Retry, and a manual repair names its exact target
8. connected existing repositories render like other connected repositories after GitHub state is
   connected
9. immediate New App Settings shows readable planned Convex and Cloudflare targets without empty,
   attention, repair, or duplicate rows
10. Overview keeps normal repository content after GitHub connects while provider setup continues
11. stale affected observations show `Checking` before they can show attention or repair
12. conflicting provider controls and direct-dialog confirm actions stay disabled from subscription
    state while navigation remains available

## Acceptance Criteria

1. New Samebase-managed app creation has a visible repository before GitHub provisioning completes.
2. Existing-repository connection uses the same GitHub state model.
3. Repository-backed features cannot run against pre-GitHub repositories.
4. Convex project and Cloudflare Worker attachments cannot exist unless GitHub is connected.
5. Connected GitHub repository identity is immutable.
6. Connected GitHub state records the run that established the connection.
7. Connected GitHub state stores the visibility confirmed when the connection was established.
8. Connected GitHub state is not replaced by top-level failed state.
9. Post-GitHub source setup failures are visible while the connected repository can still list live
   pull requests.
10. No temporary compatibility table, field, validator, reader, or writer remains.
11. Failure messages are read from provisioning events rather than duplicated on the repository row.
12. Convex and Cloudflare progress and failure are derived separately from stable attachments, live
    provider observations, and workflow state.
13. Aggregate `repositories.infra*` mirrors are absent.
14. Managed retries create new runs rather than mutating previous terminal runs.
15. New App Settings shows planned provider targets before attachments exist.
16. Overview and Settings remain available during provider setup.
