# Vault-First Provisioning Model Research

## Document Control

- Status: Draft research
- Owner: Noter app creation, vault model, and provider provisioning
- Created: 2026-05-06
- Related specs:
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
semantics onto the existing repository-first model, or step back and model a
vault as the durable app container before GitHub, Convex, and Cloudflare are
fully connected.

## Current Finding

Vault-first provisioning is the better model for user-visible retry semantics
and for the later dashboard refresh work. The current schema makes `vaults` mean
"a connected GitHub repository", so create-app has an invisible gap where the
Workflow is running and app-owned run records exist, but the dashboard has no
vault object to show until GitHub repository creation, starter seeding, tree
fetching, and vault insertion all succeed.

The next implementation phase should not be a broad Workflow refactor. It should
promote this research into a focused RFC/spec for "vault as app container" and
then make create-app insert the vault first, attach provider state explicitly,
and let the dashboard render provider lines from that stable vault identity.

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

Model the vault as the app container, and model GitHub, Convex, and hosting as
explicit integration states owned by that vault.

The important rule is to use discriminated unions, not scattered optional
fields. A provider field should be required, and its `state` should say which
fields are valid.

The shape should look like this conceptually:

```ts
const VaultLifecycleState = v.union(
  v.literal("creating"),
  v.literal("active"),
  v.literal("degraded"),
  v.literal("failed"),
  v.literal("archived"),
);

const VaultGitHubState = v.union(
  v.object({
    state: v.literal("not_connected"),
  }),
  v.object({
    state: v.literal("provisioning"),
    runId: v.id("appProvisioningRuns"),
    requestedRepoName: v.string(),
    visibility: v.union(v.literal("private"), v.literal("public")),
    startedAt: v.number(),
  }),
  v.object({
    state: v.literal("connected"),
    ghRepoId: v.string(),
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    treeSHA: v.string(),
    commitSHA: v.string(),
    connectedAt: v.number(),
  }),
  v.object({
    state: v.literal("failed"),
    runId: v.id("appProvisioningRuns"),
    requestedRepoName: v.string(),
    visibility: v.union(v.literal("private"), v.literal("public")),
    message: v.string(),
    retryable: v.boolean(),
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

The same pattern should apply to Convex project/deployment state.

The root `vaults` row should contain stable app identity and summary state:

```ts
vaults: {
  userId: Id<"users">;
  name: string;
  lifecycleState: VaultLifecycleState;
  isNoterManaged: boolean;
  github: VaultGitHubState;
  convex: VaultConvexState;
  hosting: VaultHostingState;
  createdAt: number;
  updatedAt: number;
}
```

Large or frequently refreshed provider payloads should stay in dedicated tables.
For example, branch trees and remote branch metadata already have natural
tables. A connected GitHub state should identify the default repository and
branch; it does not need to keep every tree payload inline in `vaults` forever.

## Why This Helps Retry

With vault-first creation, the create-app flow becomes:

1. create the vault row with `lifecycleState: "creating"`
2. create the run linked to `vaultId`
3. set `github.state: "provisioning"`
4. create or connect the GitHub repository
5. set `github.state: "connected"` or `"failed"`
6. seed and sync tree state
7. set `convex.state: "provisioning"` and provision Convex resources
8. set `hosting.state: "provisioning"` and provision Cloudflare resources
9. mark the vault `active`, `degraded`, or `failed`

That gives the dashboard one stable card immediately. Each provider line can
show an explicit state and retry action:

1. GitHub: not connected, provisioning, connected, failed
2. Convex: not configured, provisioning, connected, failed
3. Cloudflare: not configured, provisioning, connected, failed

Manual retry becomes a domain action against one provider state on one vault,
instead of a hidden operation against a pre-vault run.

## Best Representation

The best representation is:

1. required top-level vault lifecycle state
2. required per-provider discriminated state
3. provider-specific fields only inside the matching provider state variant
4. large provider snapshots in provider-owned child tables
5. no optional compatibility fields unless there is a real migration window,
   with TODO comments at every temporary boundary

This preserves the user's preferred default: each stored row should have fewer
implicit states, not more. A vault without GitHub is not represented by missing
`ghRepoOwner` or `ghRepoName`; it is represented by
`github.state: "not_connected"` or `github.state: "provisioning"`.

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

`Phase 4: Create vaults before provider provisioning`

Suggested sequence:

1. Promote this research into an accepted spec once the model is agreed.
2. Define the exact `VaultGitHubState`, `VaultConvexState`, and
   `VaultHostingState` validators.
3. Move root vault identity away from required GitHub fields.
4. Make create-app insert the vault first and create the provisioning run with a
   required `vaultId`.
5. Update the Workflow to mutate provider states as each step starts, succeeds,
   or fails.
6. Update dashboard data to render provider lines from explicit provider states.
7. Add provider-specific retry actions that operate on one vault and one failed
   provider state.
8. Defer automatic Workflow restart-from-failed-step until the provider states
   make manual retry semantics clear.

## Stop Line

This should stop once vault-first creation exists, the dashboard can show
per-provider state, and retry actions have an obvious domain target.

Do not use this phase to build a generic provider framework, redesign all
integration tables, or refactor unrelated GitHub/editor/file flows. Those flows
should only change where they currently assume every vault always has a
connected GitHub repository.

## Open Questions

1. Should connected GitHub identity live directly in `vaults.github`, or in a
   one-row `vaultGithubRepositories` table?
2. Should `treeData` be removed from `vaults` during this phase and read only
   from `vaultBranchTrees`?
3. Should a vault with failed GitHub provisioning remain visible by default, or
   appear in a separate creating/failed section?
4. Should failed provider state keep only the latest error, while
   `appProvisioningEvents` keeps the full event history?
5. Should existing-repository onboarding use the same `github.state` path with
   `connected` first, then provision Convex and Cloudflare after that?

## Recommendation

Adopt vault-first provisioning before investing more in retry/resume behavior.
The current Workflow work is still useful, but the durable domain object should
be the vault, not a pre-vault run. Once the vault exists first, Workflow runs,
provider status lines, manual retries, and future dashboard refresh workflows
all have the same stable place to write and read state.
