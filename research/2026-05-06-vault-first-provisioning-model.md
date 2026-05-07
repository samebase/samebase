# Vault-First Provisioning Model Research

## Document Control

- Status: Draft research
- Owner: Noter app creation, vault model, and provider provisioning
- Created: 2026-05-06
- Related specs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
- Related research:
  - `research/2026-05-02-workpool-refresh-and-tenant-compute.md`

## Prompt

Phase 1 through Phase 3 moved create-app provisioning toward Convex Workflow so
the app can observe durable provider work instead of relying on browser-driven
refreshes and coarse dashboard state.

The current question is whether the next phase should keep patching retry
semantics onto the existing repository-first model, or step back and let a vault
exist as an initializing shell before GitHub, Convex, and Cloudflare are fully
connected.

## Current Finding

Vault-first provisioning is the better model for user-visible retry semantics
and for the later dashboard refresh work, but "vault-first" should not mean a
repo-less vault is a usable source workspace. It means a vault can exist in an
explicit initializing state so the dashboard has a stable object for provider
progress and retry before GitHub is connected.

The current schema makes `vaults` mean "a connected GitHub repository", so
create-app has an invisible gap where the Workflow is running and app-owned run
records exist, but the dashboard has no vault object to show until GitHub
repository creation, starter seeding, tree fetching, and vault insertion all
succeed.

The next implementation phase should not be a broad Workflow refactor. It should
promote this research into a focused RFC/spec for "vault as initializing
provisioning shell" and then make create-app insert the vault first, attach
provider state explicitly, and let the dashboard render provider lines from that
stable vault identity.

## Original Goal

The original goal was not to make every provisioning helper a Workflow. The goal
was to make multi-provider app creation observable and durable enough that users
and operators can understand what happened after an external provider call
succeeds, fails, or needs retry.

This also served as a smaller proving ground for the later dashboard refresh
project. The bigger refresh pain is that React/browser lifecycles currently
decide when provider state should be reconciled. The target direction is for
backend work to own refresh orchestration while React subscribes to durable
state.

A change remains in scope only when it directly improves one of these:

1. durable provider progress
2. user-visible failure state
3. safe retry or resume behavior
4. moving provider reconciliation out of browser-only control

Provider abstraction work that does not serve one of those outcomes should be a
separate initiative.

## Current Runtime Shape

After Phase 3, create-app roughly behaves like this:

1. `vaultActions.createRepository` creates an `appProvisioningRuns` row with
   `vaultId: null`.
2. `appProvisioningWorkflow.provisionApp` validates provider connections.
3. The Workflow creates a GitHub repository.
4. The Workflow seeds the starter app.
5. The Workflow fetches the GitHub tree and branch metadata.
6. The Workflow creates a `vaults` row.
7. The run and early events are linked to the new vault.
8. Convex and Cloudflare infrastructure provisioning runs against that vault.

This works, but it preserves a repository-first product model. The dashboard is
vault-centered, while the first several failure points happen before a vault
exists.

## Pain Point

The current `vaults` table requires GitHub repository identity and tree state:

```ts
vaults: {
  userId: Id<"users">;
  ghRepoId: string;
  ghRepoOwner: string;
  ghRepoName: string;
  treeSHA: string;
  commitSHA?: string;
  treeData: GithubTreeData;
  state: "copying_files" | "ready";
}
```

That makes the model easy when every vault is already connected to GitHub. It is
awkward for creation and recovery:

1. A failed GitHub create or seed can produce a real app-creation failure, but
   no dashboard vault.
2. The run table can store `vaultId: null`, but that is an operational record,
   not the durable product object the user expects to see.
3. Manual retry is hard to place in the UI because the retryable thing is not
   yet attached to the user's dashboard.
4. Existing-repository onboarding and partial provider connection flows are
   forced into a shape where "vault exists" implies "GitHub is fully connected."
5. Dashboard refresh workflows have no stable place to show per-provider
   progress while a provider is disconnected, provisioning, failed, or stale.

This is the same category of implicit-state problem as optional fields. The
absence of a vault currently means too many things: "not started", "GitHub
failed", "starter seed failed", "tree fetch failed", or "still running".

## Recommended Domain Model

Keep `vault` as the durable dashboard object, but give it an explicit pre-GitHub
state. A vault without GitHub is visible for provisioning, failure, and retry,
but it is not a usable repository workspace.

Model GitHub as the primary vault state. Convex and hosting are still explicit
integration states, but they are only present on the connected GitHub variant
because they cannot be meaningfully provisioned before the source repository
exists.

The important rule is to use discriminated unions, not scattered optional
fields. When a provider belongs to a valid state variant, its field should be
required, and its `state` should say which fields are valid.

The shape should look like this conceptually:

```ts
/**
 * GitHub is the gate for a vault becoming a usable source workspace.
 * These fields are flattened onto the vault row itself.
 */
/** GitHub visibility values currently supported by Noter's create flow. */
const GitHubRepositoryVisibility = v.union(
  v.literal("private"),
  v.literal("public"),
);

const VaultGitHubState = v.union(
  v.object({
    /** Explicit empty state for future manual connection flows. */
    state: v.literal("not_connected"),
  }),
  v.object({
    /** GitHub repository creation is in progress for this vault. */
    state: v.literal("provisioning"),

    /**
     * Distinguishes create-repo provisioning from existing-repo connection.
     * This is named for GitHub because the vault row is flattened.
     */
    githubMode: v.literal("create_repository"),

    /** Durable run that owns the in-flight create-repository operation. */
    runId: v.id("appProvisioningRuns"),

    /**
     * Requested GitHub user or organization owner for the new repository.
     * This is the target, not confirmed repository identity yet.
     */
    owner: v.string(),

    /**
     * Requested repository name from user input, preserved for display/retry.
     * This is the target, not confirmed repository identity yet.
     */
    name: v.string(),

    /** Repository visibility requested for a new Noter-managed repository. */
    visibility: GitHubRepositoryVisibility,

    /** Timestamp when this GitHub provisioning attempt started. */
    startedAt: v.number(),
  }),
  v.object({
    /** Existing GitHub repository connection is in progress for this vault. */
    state: v.literal("provisioning"),

    /**
     * Distinguishes existing-repo connection from repository creation.
     * This is named for GitHub because the vault row is flattened.
     */
    githubMode: v.literal("connect_existing_repository"),

    /** Durable run that owns the in-flight existing-repo connection. */
    runId: v.id("appProvisioningRuns"),

    /** Existing GitHub repository owner targeted by this connection attempt. */
    owner: v.string(),

    /** Existing GitHub repository name targeted by this connection attempt. */
    name: v.string(),

    /** Timestamp when this GitHub connection attempt started. */
    startedAt: v.number(),
  }),
  v.object({
    /** GitHub is connected; repo-backed vault behavior is now allowed. */
    state: v.literal("connected"),

    /** Records whether this vault created the repo or attached an existing repo. */
    githubMode: v.union(
      v.literal("create_repository"),
      v.literal("connect_existing_repository"),
    ),

    /** Immutable GitHub repository id; prevents in-place repo replacement. */
    ghRepoId: v.string(),

    /** Current GitHub repository owner used for API calls and display. */
    owner: v.string(),

    /** Current GitHub repository name used for API calls and display. */
    name: v.string(),

    /** Current GitHub repository visibility from GitHub metadata. */
    visibility: GitHubRepositoryVisibility,

    /** Default branch for source views and initial tree sync. */
    defaultBranch: v.string(),

    /** Convex infrastructure state, only valid after GitHub is connected. */
    convex: VaultConvexState,

    /** Hosting infrastructure state, only valid after GitHub is connected. */
    hosting: VaultHostingState,

    /** Timestamp when the vault first became a usable source workspace. */
    connectedAt: v.number(),
  }),
  v.object({
    /** Latest GitHub repository creation attempt failed. */
    state: v.literal("failed"),

    /** Failed GitHub operation kind; selects the valid retry behavior. */
    githubMode: v.literal("create_repository"),

    /** Durable run that recorded the failure. */
    runId: v.id("appProvisioningRuns"),

    /**
     * Requested GitHub user or organization owner for the failed create.
     * This remains operation intent, not confirmed repository identity.
     */
    owner: v.string(),

    /**
     * Requested repository name for the failed create.
     * This remains operation intent, not confirmed repository identity.
     */
    name: v.string(),

    /** Repository visibility requested for the failed create attempt. */
    visibility: GitHubRepositoryVisibility,

    /** User-safe latest failure message. Full history stays in events. */
    message: v.string(),

    /** Whether the current failed operation can be retried by the user. */
    retryable: v.boolean(),

    /** Timestamp when the latest failure was recorded. */
    failedAt: v.number(),
  }),
  v.object({
    /** Latest existing GitHub repository connection attempt failed. */
    state: v.literal("failed"),

    /** Failed GitHub operation kind; selects the valid retry behavior. */
    githubMode: v.literal("connect_existing_repository"),

    /** Durable run that recorded the failure. */
    runId: v.id("appProvisioningRuns"),

    /** Existing GitHub repository owner targeted by the failed connection. */
    owner: v.string(),

    /** Existing GitHub repository name targeted by the failed connection. */
    name: v.string(),

    /** User-safe latest failure message. Full history stays in events. */
    message: v.string(),

    /** Whether the current failed operation can be retried by the user. */
    retryable: v.boolean(),

    /** Timestamp when the latest failure was recorded. */
    failedAt: v.number(),
  }),
);

const VaultHostingState = v.union(
  v.object({
    state: v.literal("not_configured"),
  }),
  v.object({
    state: v.literal("provisioning"),
    provider: v.literal("cloudflare"),
    runId: v.id("appProvisioningRuns"),
    startedAt: v.number(),
  }),
  v.object({
    state: v.literal("connected"),
    provider: v.literal("cloudflare"),
    accountId: v.string(),
    projectName: v.string(),
    productionUrl: v.string(),
    connectedAt: v.number(),
  }),
  v.object({
    state: v.literal("failed"),
    provider: v.literal("cloudflare"),
    runId: v.id("appProvisioningRuns"),
    message: v.string(),
    retryable: v.boolean(),
    failedAt: v.number(),
  }),
);
```

The same discriminated-state pattern should apply to Convex project/deployment
state.

The root `vaults` row should contain stable app identity plus the flattened
GitHub/source-workspace state:

```ts
/** Persisted vault row: base fields plus exactly one source-workspace state. */
type VaultRow = VaultBase & VaultGitHubState;

/** Fields every vault row has regardless of GitHub connection state. */
type VaultBase = {
  /** Ownership and authorization boundary for the vault. */
  userId: Id<"users">;

  /** Stable creation timestamp for audit and deterministic dashboard ordering. */
  createdAt: number;

  /** Explicit recency timestamp for queries that intentionally sort by update. */
  updatedAt: number;
};
```

The TypeScript shape can use `VaultBase & VaultGitHubState`. The Convex schema
should define this as a union of complete row validators that share the base
fields, because the persisted validator variants are concrete objects.

Do not store a top-level `lifecycleState` for values such as creating, active,
degraded, or failed. Those are derived dashboard summaries from the provider
states. If the product later needs archive/hide behavior, model that as a
separate explicit user-intent field instead of mixing it with provisioning
health.

Root `displayName` is intentionally omitted. Its only durable utility is before
GitHub connection, and those states already carry better operation intent in
`owner/name`. Reusing `owner` and `name` across provisioning, failed, and
connected variants is intentional: the `state` field says whether those
coordinates are requested/targeted or confirmed connected repository identity.
Root `isNoterManaged` is also omitted because repo origin belongs to
`githubMode`, while infrastructure management is represented by connected-only
Convex and hosting state.

State transitions should not discard known GitHub facts. Moving from
provisioning to connected should carry forward `owner`, `name`, and visibility,
replacing requested intent with confirmed GitHub metadata when the provider
response differs. If the workflow learns durable repository facts such as
`ghRepoId` or confirmed visibility and then a later step fails before the normal
connected write, use connected state or a richer explicit failure state instead
of dropping those facts.

Large or frequently refreshed provider payloads should stay in dedicated tables.
For example, branch trees and remote branch metadata already have natural
tables. A connected GitHub state should identify the default repository and
branch; it does not need to keep every tree payload inline in `vaults` forever.
Branch tree state such as `treeSHA` and branch head `commitSHA` should live in
branch/tree child tables unless implementation finds a concrete atomicity
requirement that cannot be represented otherwise.

## Vault Invariant

Repository-backed behavior must require `state === "connected"`.

That includes:

1. file tree reads
2. file staging
3. collaborative edits
4. branch metadata refresh
5. pull request metadata
6. GitHub Codespaces
7. commits and media uploads
8. infrastructure steps that need a GitHub repository identity

The pre-GitHub vault exists only to make provisioning visible and retryable.
Routes and actions that operate on source files should fail closed or stay
hidden until GitHub is connected.

GitHub repository identity should also be one-way. A vault can move from
`not_connected` or `failed` into `provisioning`, then into `connected`. Once
connected, changing to a different `ghRepoId` should be forbidden. If the user
wants a different repository, the product should create a new vault or archive
the old one instead of mutating repository identity underneath existing
repo-bound data.

## Why This Helps Retry

With vault-first creation, the create-app flow becomes:

1. create the vault row with required provider state
2. create the run linked to `vaultId`
3. set `state: "provisioning", githubMode: "create_repository", owner, name`
4. create the GitHub repository
5. seed and sync tree state
6. set `state: "connected"` with confirmed repository visibility, or `"failed"`
7. set `convex.state: "provisioning"` and provision Convex resources
8. set `hosting.state: "provisioning"` and provision Cloudflare resources
9. derive the dashboard summary from provider states

That gives the dashboard one stable card immediately. Each provider line can
show an explicit state and retry action:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: unavailable until GitHub is connected, then not configured,
   provisioning, connected, failed
3. Cloudflare: unavailable until GitHub is connected, then not configured,
   provisioning, connected, failed

Manual retry becomes a domain action against one provider state on one vault,
instead of a hidden operation against a pre-vault run.

## Existing Repository Connection

The same vault/GitHub state machine must cover connecting an existing
repository. Today `vaultActions.connectRepository` is an action, not a Workflow:
it validates GitHub, fetches repo/tree metadata, then creates a vault row that
is already connected to GitHub.

Future connect-existing work should not introduce a separate schema path. It
should use the same required GitHub discriminated union:

1. create the vault row with required provider state
2. create a run linked to `vaultId`
3. set
   `state: "provisioning", githubMode: "connect_existing_repository", owner, name`
4. fetch and validate the existing GitHub repository
5. write `state: "connected", githubMode: "connect_existing_repository"` with
   fetched repository visibility
6. sync default branch/tree state into the same provider-owned tables used by
   Noter-managed repos
7. leave Convex and hosting in `not_configured` or move them into provisioning
   when the product explicitly asks to provision them

Noter-managed create-app uses the same shape but starts GitHub provisioning with
`githubMode: "create_repository"` and keeps that `githubMode` after the
repository is created and seeded.

This matters for schema design because the connected GitHub variant should
describe the repository identity, while the provisioning/failed variants should
describe the current operation. Operation-specific requested fields such as
create visibility only belong to the `create_repository` provisioning and failed
variants. Existing-repo connection should not need fake create settings or
nullable repo fields just to fit the Noter-managed create flow.

## Best Representation

The best representation is:

1. required flattened GitHub discriminated state on the vault
2. Convex and hosting state only on the connected GitHub variant
3. provider-specific fields only inside the matching provider state variant
4. large provider snapshots in provider-owned child tables
5. repo-backed actions gated on the connected GitHub variant
6. immutable GitHub repository identity after first successful connection
7. known repository facts such as visibility carried forward instead of dropped
8. one GitHub state machine for both Noter-managed creation and existing-repo
   connection
9. no optional compatibility fields unless there is a real migration window,
   with TODO comments at every temporary boundary

This preserves the user's preferred default: each stored row should have fewer
implicit states, not more. A vault without GitHub is not represented by missing
`ghRepoOwner` or `ghRepoName`; it is represented by `state: "not_connected"` or
`state: "provisioning"`, and those states explicitly mean the vault is not yet
usable as a source workspace.

## Migration Shortcut

The normal Convex migration path would be widen, migrate, and narrow because the
current `vaults` table has required GitHub fields. That would temporarily
introduce compatibility states and dual readers.

Because the production app currently has one real operator/user and the user is
comfortable removing existing production vaults, there is a simpler option:

1. delete existing vault-scoped production data in an operator-approved cleanup
   pass
2. deploy the new schema directly with required explicit provider states
3. update current call sites directly instead of supporting old and new vault
   shapes in parallel

This shortcut is only safe if the cleanup includes dependent vault-scoped
tables, not just `vaults`. The likely affected tables include:

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

The cleanup should be explicit and fail closed. It should not be hidden inside
the product flow.

## Implementation Direction

The next implementation should be its own phase, not a tail on Phase 3.

Suggested phase title:

`Phase 4: Create initializing vaults before GitHub provisioning`

Suggested sequence:

1. Promote this research into an accepted spec once the model is agreed.
2. Define the exact `VaultBase`, `VaultGitHubState`, `VaultConvexState`, and
   `VaultHostingState` validators, with `vaults` represented as full row union
   variants that share the base fields.
3. Replace always-required repository identity fields with connected-only GitHub
   variant fields.
4. Make create-app insert the vault first and create the provisioning run with a
   required `vaultId`.
5. Update the Workflow to mutate provider states, including connected repository
   visibility, as each step starts, succeeds, or fails.
6. Add an invariant helper or typed accessor for code paths that require a
   connected GitHub repository.
7. Update dashboard data to render provider lines from explicit provider states.
8. Add provider-specific retry actions that operate on one vault and one failed
   provider state.
9. Move existing-repository connection onto the same vault/run/provider-state
   model before adding a separate onboarding surface.
10. Defer automatic Workflow restart-from-failed-step until the provider states
    make manual retry semantics clear.

## Stop Line

This should stop once vault-first creation exists, the dashboard can show
per-provider state, repository-backed code is gated on connected GitHub, and
retry actions have an obvious domain target.

Do not use this phase to build a generic provider framework, redesign all
integration tables, or refactor unrelated GitHub/editor/file flows. Those flows
should only change where they currently assume every vault always has a
connected GitHub repository.

## Open Questions

1. Should connected GitHub identity live directly on the connected `vaults`
   variant, or in a one-row `vaultGithubRepositories` table?
2. Should `treeData` be removed from `vaults` during this phase and read only
   from `vaultBranchTrees`?
3. Should a vault with failed GitHub provisioning remain visible by default, or
   appear in a separate creating/failed section?
4. Should failed provider state keep only the latest error, while
   `appProvisioningEvents` keeps the full event history?
5. Should existing-repository connection immediately create an initializing
   vault and run, or can the first Workflow version keep a short synchronous
   validation step before inserting the vault?
6. Should `state: "not_connected"` exist only for future manual connection
   flows, while Noter-managed create-app starts directly at
   `state: "provisioning"`?

## Recommendation

Adopt initializing vault creation before investing more in retry/resume
behavior. The current Workflow work is still useful, but the durable dashboard
object should be the vault, not a pre-vault run. Once the vault exists first,
Workflow runs, provider status lines, manual retries, and future dashboard
refresh workflows all have the same stable place to write and read state.

Keep the repository invariant strict: a vault can exist before GitHub, but it
cannot behave like a repository workspace until GitHub is connected, and the
connected repository must not be replaced in place.
