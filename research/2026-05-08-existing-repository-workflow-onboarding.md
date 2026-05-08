# Existing Repository Workflow Onboarding Research

## Document Control

- Status: Draft research
- Owner: Noter existing repository onboarding, vault source setup, and
  provisioning runs
- Created: 2026-05-08
- Related specs:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
- Related research:
  - `research/2026-05-06-vault-first-provisioning-model.md`

## Prompt

Before starting the next vault-first phase for connecting existing GitHub
repositories, check whether it is truly one implementation step or needs a new
research/spec pass.

The user-facing intent should remain simple: choose or open an existing GitHub
repository, click connect, and get a usable Noter vault or a clear setup
failure. The question is whether that maps to one backend/UI change set.

## Current Finding

Existing repository onboarding should get a focused spec before implementation.
It can remain one user action, but it is not one implementation step.

The current existing-repository path is synchronous and only creates a vault
after GitHub repo metadata, branch metadata, and tree data have all been
fetched. Spec 096 wants the opposite durability shape: insert an initializing
vault and a run first, then let Workflow connect GitHub and sync source state
while the dashboard has a stable object to show.

That change crosses four concerns that should be settled explicitly:

1. run-backed source setup for `githubMode: "connect_existing_repository"`
2. direct prod cleanup before requiring `runId` on connected existing repos
3. dashboard and provisioning-log visibility for non-Noter-managed source setup
4. direct file-route connect UX while the repository is connected but the branch
   tree is not ready yet

Manual provider retry should stay parked. This phase is about durable source
onboarding visibility for existing repositories, not about adding retry buttons
or provisioning Convex/Cloudflare for imported repos.

## Current Runtime

### Repository Picker

`/add` uses `github.listRepositoriesPreview` for the first page and
`github.listRepositories` for the full accessible repository set. Spec 065
requires this discovery to include owner, collaborator, and organization-member
repositories and to search by repo name, owner slug, and full `owner/repo`.

The page hides repositories that already appear in `vault.getUserVaults` by
matching `repositoryFullName`. This means an initializing existing-repo vault
could also hide the row once `getUserVaults` includes it, even before GitHub
source setup is complete.

### Existing Repo Connect Action

`vaultActions.connectRepository` currently:

1. reads the current user and GitHub provider connection
2. parses `repositoryFullName`
3. calls GitHub `repos.get`
4. reads the default branch
5. calls GitHub `repos.getBranch`
6. calls GitHub `git.getTree`
7. calls `internal.vault.addVault`
8. writes `vaultBranchTrees`
9. returns the connected vault id, canonical repo full name, and default branch

This is a repository-first path. If any GitHub call fails, no vault/run/event is
created.

### Existing Repo Vault Insert

`internal.vault.addVault` inserts existing repositories directly as:

```ts
{
  state: "connected",
  githubMode: "connect_existing_repository",
  ghRepoId,
  owner,
  name,
  visibility,
  defaultBranch,
  connectedAt,
  convex: { state: "not_configured" },
  cloudflare: { state: "not_configured" },
}
```

There is no `runId` on the connected existing-repo variant today. This should
not create a compatibility path for this phase. The operator is the only
production user and can delete incompatible production rows before deploy, so
the future implementation should use the direct required target shape.

### Create App Contrast

The Noter-managed create path already does the vault-first work:

1. `vaultActions.createRepository` validates local repo intent and GitHub
   connection presence
2. `internal.vault.createInitializingNoterManagedVaultForUser` inserts the vault
   and run before external GitHub work
3. `appProvisioningWorkflow.provisionApp` validates providers, creates GitHub,
   connects the vault, seeds starter files, syncs the branch tree, then
   provisions Convex and Cloudflare
4. run events feed the dashboard log and source/provider setup summaries

Existing-repo onboarding should reuse the source side of this model, not the
Noter-managed infrastructure side.

### Dashboard Visibility

`vault.getUserVaults` already includes pre-GitHub provisioning and failed vaults
in the dashboard list. However, those cards currently return:

```ts
{
  sourceSetup: { status: "not_applicable" },
  providerSetup: { status: "not_applicable" },
}
```

For connected vaults, source setup summaries are only derived for Noter-managed
repos. Existing-repo vaults with no default-branch tree can be
`state: "copying_files"` without any source setup log section explaining what is
happening.

Provider setup correctly stays Noter-managed-only for now. Spec 003 explicitly
says existing-repo connect does not auto-provision infrastructure.

### File Route Connect

The file route has a second existing-repo entrypoint. If a user opens a repo URL
that is not connected, `FileView` renders `RepositoryRouteConnectState` with
either "Connect GitHub" or "Connect this repo".

Today that works because `connectRepository` returns only after the tree is
ready. The route can immediately navigate to the file route using the returned
default branch.

If the backend action starts a Workflow and returns while source setup is still
running, this route cannot keep the same assumption. A connected vault without a
branch tree currently renders nothing in `FileView` because file-backed UI
requires `treeSHA` and `treeData`.

## Accepted Behavior Constraints

1. A vault may exist before GitHub is connected, but repo-backed behavior must
   require `state: "connected"`.
2. Connected GitHub identity is absorbing. Repository access problems, tree
   refresh failures, or provider failures must not move a connected vault back
   to top-level `failed`.
3. Existing-repo onboarding should use
   `githubMode: "connect_existing_repository"` for provisioning, failed, and
   connected states.
4. Existing-repo provisioning and failed states should store target `owner` and
   `name`, but not create-only `visibility`.
5. Connected existing-repo state should store fetched repository visibility and
   leave Convex and Cloudflare as `not_configured`.
6. Existing-repo connect should not auto-provision infrastructure unless the
   product explicitly asks for that later.
7. Manual provider retry UI remains out of scope.

## Gaps To Resolve In A Spec

### 1. Run Trigger Semantics

`appProvisioningRuns.trigger` is currently `"create" | "retry"`. A
connect-existing workflow should not masquerade as a create run, but `"retry"`
also does not describe the initial connection attempt.

Recommended spec decision: add a trigger such as `"connect_existing_repository"`
for the initial existing-repo attempt. Keep provider retry triggers separate.

### 2. Step Taxonomy

Current provisioning steps have `create_github_repo`, `connect_github`,
`seed_starter`, and `sync_tree`. Existing-repo onboarding needs a user-readable
step for fetching/validating an already-existing repository.

Recommended spec decision: add a step such as `fetch_github_repo` or
`validate_github_repo`, then reuse `connect_github` and `sync_tree`. Do not log
existing-repo fetch as `create_github_repo`.

### 3. Connected Existing Rows Without Run Id

Spec 096 says connected GitHub state should keep the run that established the
connection. Existing connected repository rows cannot satisfy that yet.

Recommended spec decision: require `runId` on connected
`connect_existing_repository` rows in the target schema and remove incompatible
production rows before deploying that requirement.

Do not add optional `runId`, synthetic historical runs, backfill machinery, or
dual-read compatibility for old connected existing-repo rows. If production has
old rows, delete/recreate them as part of the rollout.

### 4. Duplicate And Idempotency Rules

The current synchronous path discovers `ghRepoId` before inserting a vault, so
it can be idempotent by stable GitHub repo id.

Vault-first existing-repo onboarding inserts before `ghRepoId` is known. It can
only de-duplicate initially by target `owner/name`. After the Workflow fetches
GitHub metadata, it may discover that the repo id already belongs to another
vault, especially after a GitHub rename or transfer.

The spec needs to define this explicitly. The safest default is:

1. before external calls, reject another non-deleted vault for the same
   requested `owner/name`
2. after GitHub fetch, reject if the fetched `ghRepoId` belongs to a different
   connected vault for the same user
3. allow idempotent completion only when the fetched `ghRepoId` matches the same
   vault that owns the run
4. never mutate one connected vault to point at a different `ghRepoId`

### 5. Failure State Boundaries

Before GitHub is connected, a fetch or validation failure can move the vault to:

```ts
state: "failed",
githubMode: "connect_existing_repository",
runId,
owner,
name,
failedAt,
```

After GitHub is connected, branch-tree sync failure should not move the vault
back to top-level failed. It should stay connected with no usable default-branch
tree and show source setup failure from the run/events.

The existing completion failure handler only marks pre-GitHub failure for
`githubMode: "create_repository"`. A connect-existing workflow needs the same
pre-connected failure path for its own mode.

### 6. Dashboard Source Setup For Existing Repos

The dashboard should not restrict source setup visibility to Noter-managed
repos. Source setup is GitHub/source readiness, so it applies to both:

1. Noter-managed creation
2. existing-repo connection

Provider setup should stay Noter-managed-only because existing repos do not
auto-provision Convex or Cloudflare.

### 7. File Route UX During Setup

The file route needs a product decision. There are two reasonable choices:

1. after clicking "Connect this repo", navigate to the dashboard so the user
   sees the initializing vault card and source setup log
2. teach `getVaultByRepository` and `RepositoryRouteConnectState` about an
   onboarding state so the direct repo route can show "setting up" with the
   provisioning log until the branch tree exists

The second option is smoother for direct repo links, but it expands the file
route query contract beyond repo-backed workspace data. The first option is
smaller and keeps the route contract cleaner, but it sends users away from the
repo URL they were trying to open.

The spec should choose one before implementation.

### 8. Empty Or Unreadable Existing Repositories

The current synchronous path requires a default branch, branch metadata, and a
tree. Empty repositories, inaccessible default branches, OAuth org restrictions,
and GitHub rate limits can fail before any vault exists.

The workflow path should define whether an empty existing repository is:

1. a failed source setup on an initializing/failed vault
2. a connected vault with no usable tree
3. unsupported with a clear failure message

The conservative match for current behavior is a clear failed setup before
connected state unless GitHub has provided durable repo identity and visibility.

## Recommended Implementation Slices

### Slice 1: Spec And Direct Schema Shape

Create `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`.

The spec should define:

1. run trigger names
2. step names and log copy
3. duplicate handling by `owner/name` and `ghRepoId`
4. file-route behavior during setup
5. direct prod cleanup before requiring connected existing-repo `runId`
6. acceptance tests for source setup visibility

The first implementation PR should use the required target shape directly. Old
production rows can be deleted before deploy instead of carried through a
compatibility window.

### Slice 2: Backend Workflow

Add a connect-existing Workflow that:

1. validates local `owner/name`
2. inserts an initializing vault and run in one mutation
3. starts the Workflow
4. validates GitHub connection
5. fetches the existing repo and default branch metadata
6. writes connected GitHub state with `runId`, `ghRepoId`, visibility, and
   default branch
7. syncs the default branch tree
8. completes the run

This slice should not provision Convex or Cloudflare.

### Slice 3: Dashboard And Entrypoints

Update:

1. `/add` connect behavior
2. direct file-route connect behavior
3. `getUserVaults` source setup summaries
4. provisioning log rendering for existing-repo source setup
5. visual/unit tests around setting-up and failed source setup cards

This can be the same PR as Slice 2 only if the diff stays small. Otherwise it
should follow as the second implementation PR.

## Test Plan For The Future Spec

Backend:

1. connecting an existing repo inserts a vault before external GitHub fetches
2. the run uses a connect-existing trigger and required `vaultId`
3. pre-connected GitHub fetch failure moves the vault to failed
4. successful fetch writes connected state with `githubMode`, `ghRepoId`,
   visibility, default branch, and `runId`
5. tree sync failure after connected state preserves connected GitHub identity
6. connected existing-repo rows require `runId` in the target schema
7. duplicate `owner/name` and duplicate `ghRepoId` cases fail closed
8. provider setup stays `not_applicable` for existing repos

Frontend:

1. `/add` hides a repository once its initializing vault exists
2. `/add` does not leave the button in a false idle state after the Workflow is
   queued
3. dashboard shows source setup running and failed states for existing repos
4. direct file-route connect follows the chosen setup UX without blank content
5. provisioning log labels distinguish fetch existing repo from create repo

## Recommendation

Do not implement this as a single broad Phase 6 PR.

First promote this research into a focused spec. Then implement backend
Workflow/state and UI continuity as one or two reviewable PRs depending on diff
size. Treat old connected existing-repo rows as disposable production data, not
as a compatibility requirement.

The result should still feel like one step to the user: connect an existing
repository. Internally, it is a staged source-onboarding workflow with durable
visibility and no new manual retry UX.
