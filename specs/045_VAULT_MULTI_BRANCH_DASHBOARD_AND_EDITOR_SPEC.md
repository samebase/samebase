# 045 Vault Multi-Branch Dashboard and Editor Spec

## Document Control

- Status: In progress
- Owner: Noter frontend/editor + Convex vault/github
- Last updated: 2026-05-17
- Related specs:
  - `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
  - `rfcs/046_VAULT_MULTI_BRANCH_ROLLOUT_PLAN.md`
  - `specs/037_EDITOR_COMMIT_DIFF_RELIABILITY_SPEC.md`
  - `specs/008_CHAT_ONLY_CODESPACE_MODE_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
  - `research/2026-05-17-dashboard-branch-pagination-filtering.md`

## Summary

Enable working with multiple remote branches per vault by introducing:

1. Remote branch catalog in dashboard cards (remote branches, not local) without loading every
   branch row for every vault in the first dashboard payload
2. Branch-select navigation from dashboard to editor
3. Branch-scoped repository tree/commit state for editor correctness
4. Branch-safe routing contract (including branch names with `/`)
5. Safe tombstone handling when upstream branches are deleted while local uncommitted work still
   exists

This spec focuses on GitHub remote branches as the source of truth.

Current rollout note:

1. `vaultBranchTrees` is now the branch-scoped source of truth for tree/commit data
2. Runtime paths no longer read or write legacy `vault.treeData/treeSHA/commitSHA` as default-branch
   mirrors after the vault-first Phase 4 cleanup
3. The vault-row mirror fields are removed from the target schema; production rows with those fields
   must be cleared before the narrow schema deploy
4. Dashboard vault cards and dashboard branch rows are separate paginated read paths;
   `getUserVaults` is a legacy compatibility query and must not remain the primary dashboard data
   source for connected vault cards

## Product Intent

Current workflow direction for Noter:

1. Work against remote branches only
2. Local branch state in connected-machine or Codex worktrees is implementation detail
3. Commit in Noter implies push to the selected remote branch

## Current Runtime State

1. Dashboard branch links are branch-aware and URL-safe for names containing `/`
2. Vault branch resolution reads active `vaultRemoteBranches` and returns
   `defaultBranch`/`resolvedBranch` from that catalog
3. Tree refresh writes branch-scoped cache for any refreshed branch (`vaultBranchTrees`)
4. Default-branch tree reads come from `vaultBranchTrees`; missing branch tree data is treated as
   unavailable tree cache, not as GitHub disconnection

## Vault Dashboard Delete Surface

Each dashboard vault card exposes a single remove-vault link that writes a key-only `?delete` search
flag plus the vault hash target, such as `/?delete#tmp-flow`. The root search contract treats
`delete` as a presence flag. The dashboard resolves the hash against visible vaults, using the repo
name when unique and `owner/repo` only when duplicate repo names make the hash ambiguous.

The `delete` search flag owns the confirmation modal, and the hash owns the target vault. Clicking
the card's remove-vault link writes `?delete#<vault>` and immediately opens the existing
confirmation dialog for that vault; there is no intermediate dropdown, popover, or sheet. Closing
the dialog or completing deletion clears the `delete` search flag through TanStack Router while
leaving normal vault hash navigation intact.

When the dashboard loads with `?delete` and a matching hash, the matching vault card scrolls into
view after vault data arrives, then the confirmation dialog opens for that vault. If `?delete` has
no valid vault hash target, the dashboard clears delete mode. Destructive cleanup options stay
centralized in the dialog.

## Pre-Implementation Baseline (Historical)

The sections below describe the state before PR #174 and are kept for context.

### What is already branch-aware

1. `fileStaging` and `collaborativeUpdates` data models are branch-scoped
2. Staging read/write/commit actions accept `branch` and rebase on branch head
3. Chat thread context stores an optional branch
4. Many editor actions already pass branch through API calls

### What is still single-branch in practice

1. Dashboard hardcodes `main` for vault links and status surfaces
2. File view route parsing defaults to `main`
3. ChatFab URL parsing defaults to `main`
4. Vault tree cache (`vaults.treeData`, `vaults.commitSHA`) is effectively one branch
5. Repository tree refresh uses `HEAD` and no branch argument
6. Commit pipeline refreshes tree without passing committed branch
7. Agent/system prompt repo tree context comes from single cached vault tree

### URL contract gap

Current `/vault/:owner/:repoName/*` parsing splits wildcard into `branch/filePath`. That breaks
correctness for branch names that contain `/` (for example `feature/oauth/login`).

## Goals

1. Show remote branches per vault on dashboard without requiring the dashboard to load all branches
   for all vaults
2. Open editor on clicked branch from dashboard
3. Keep editor tree, commit SHA, and staged view consistent with selected branch
4. Support branch names with slashes and special characters safely in routes
5. Preserve existing single-user vault ownership and auth model
6. Keep solution incremental with compatibility for current data
7. Keep total branch/PR counts available without scanning unbounded branch rows from dashboard
   queries
8. Keep filter UI honest when only a branch page, not the whole repository branch set, is loaded

## Non-Goals (This Spec)

1. Local branch creation/checkout semantics in sandboxes
2. Branch create/delete/rename UI
3. Multi-branch connected-machine launch UX
4. Per-branch infra/hosting lifecycle changes
5. Git merge/rebase UX in Noter
6. GitHub-live exact totals on every dashboard render; dashboard counts reflect the latest completed
   Noter sync unless an explicit GitHub refresh/search flow says otherwise

## Scope

1. Convex schema and query/action contracts for remote branch catalogs
2. Branch-scoped repository tree cache contracts
3. Dashboard branch list UX and navigation wiring
4. File/editor route and parsing contract updates
5. Branch propagation hardening in chat/commit integration
6. Deleted-upstream branch recovery and retention safety
7. Migration and rollout plan

## Proposed Architecture

### 1) Persist remote branch catalog per vault

Add a new table `vaultRemoteBranches`:

1. `vaultId: Id<"vaults">`
2. `name: string` (exact GitHub branch name)
3. `headCommitSha: string`
4. `lastCommitAt?: number`
5. `isDefault: boolean`
6. `isProtected: boolean`
7. `remoteState: "active" | "deleted_upstream"`
8. `deletedUpstreamAt?: number`
9. `lastSyncedAt: number`

Indexes:

1. `by_vault` (`vaultId`)
2. `by_vault_and_name` (`vaultId`, `name`)
3. `by_vault_and_remote_state` (`vaultId`, `remoteState`)

Rationale:

1. Query-friendly for dashboard rendering
2. Avoids embedding large branch arrays in `vaults`
3. Allows per-branch metadata updates without rewriting full vault docs
4. Preserves user work when a remote branch is deleted upstream

### 2) Add branch-scoped tree cache

Add a new table `vaultBranchTrees`:

1. `vaultId: Id<"vaults">`
2. `branch: string`
3. `treeData: GithubTreeData`
4. `commitSHA?: string`
5. `lastTreeRefreshAt?: number`
6. `treeRefreshStartedAt?: number`

Indexes:

1. `by_vault_and_branch` (`vaultId`, `branch`)

Rationale:

1. Prevents one-branch cache from clobbering another
2. Enables branch-correct file tree, commit status, and editor behavior
3. Mirrors existing refresh lock/debounce pattern at branch scope

### 3) Default branch source of truth

Use `vaultRemoteBranches.isDefault` (where `remoteState="active"`) as the source of truth for
default branch resolution.

Behavior:

1. Keep default branch derivation in branch catalog sync/read paths
2. Return `defaultBranch` from query helpers as a computed field
3. Do not add a separate persisted `vault.defaultBranch` field

## API Contract Changes

### Branch catalog sync/read

Add action:

- `github.refreshVaultRemoteBranches({ vaultId, trigger? })`

Behavior:

1. Calls GitHub `repos.listBranches` with pagination (`per_page=100`)
2. Upserts `vaultRemoteBranches`
3. Marks one branch as `isDefault=true` (from repo metadata)
4. Computes default branch from active `isDefault` branch row
5. For previously known branches missing upstream, set `remoteState="deleted_upstream"` and
   `deletedUpstreamAt`
6. If a previously deleted-upstream branch reappears remotely, restore it to `remoteState="active"`
   and clear `deletedUpstreamAt`
7. Garbage-collect deleted-upstream branch rows only when there are no `fileStaging` or
   `collaborativeUpdates` rows for that branch

Add query:

- `vault.getVaultRemoteBranches({ vaultId })`

Returns:

1. Branch rows ordered by: `remoteState="active"` first, then `isDefault DESC`, then
   `lastCommitAt DESC` (missing timestamps last), then `name ASC`

### Dashboard pagination contract

Branch cardinality is unbounded in a way vault cardinality is not. The product may cap connected
vaults/repositories for a user, but it must not rely on a branch cap for GitHub repositories.
Dashboard reads therefore use two independent levels of pagination:

1. `vault.dashboard.listDashboardVaults({ paginationOpts })` returns a page of vault cards. It
   includes vault summary, default-branch tree summary, provider/setup/deletion summaries, and
   branch count/stats fields once those are available. It does not include branch rows.
2. `vault.dashboard.listDashboardBranches({ vaultId, paginationOpts })` returns one branch page for
   one vault. Each ready vault card owns this paginated read independently.
3. `vault.dashboard.getUserVaults()` may exist during rollout for older tests or compatibility, but
   new dashboard runtime code must not use it for connected vault cards because it returns all
   branch rows for every connected vault.

The double paginator is intentionally not one nested backend query. The parent query pages vault
cards; each visible/expanded ready card starts its own branch pagination subscription. This keeps a
large repository from making every vault page heavy and lets a future virtualized UI decide which
vault cards should keep branch subscriptions alive.

Convex pagination result objects are cursor/page state only. They do not include total row counts.
UI totals therefore cannot be derived from `listDashboardBranches().page.length` or
`usePaginatedQuery().results.length` except as loaded-row counts.

### Dashboard branch count contract

Add a per-vault branch stats source before showing exact repository-wide branch totals in the
dashboard:

1. `vaultRemoteBranchStats`
   - `vaultId: Id<"vaults">`
   - `activeBranchCount: number`
   - `deletedUpstreamBranchCount: number`
   - `totalBranchCount: number`
   - `openPullRequestBranchCount: number`
   - `draftPullRequestBranchCount: number`
   - `unlabeledPullRequestBranchCount: number`
   - `lastBranchStatsSyncedAt: number`
   - `lastPullRequestStatsSyncedAt?: number`
2. optional `vaultRemoteBranchLabelStats`
   - `vaultId: Id<"vaults">`
   - `labelKey: string` (normalized GitHub label name)
   - `labelName: string`
   - `labelColor?: string`
   - `activeBranchCount: number`
   - `openPullRequestBranchCount: number`
   - `draftPullRequestBranchCount: number`
   - `lastSyncedAt: number`

The stats row is exact for the latest completed Noter sync, not necessarily for GitHub at this
instant. This is the intended consistency model: the dashboard shows Noter's synchronized view and
separately exposes refresh/progress/failure state when GitHub sync is in flight or failed.

Stats are maintained on the write/sync path, not by dashboard reads:

1. Branch sync already processes the GitHub branch snapshot and known existing branch rows; update
   branch stats in the same internal mutation after the branch row changes are known.
2. PR metadata sync updates PR/draft/label stats when persisted PR metadata changes.
3. Writers must skip no-op patches when computed stats did not change so count maintenance does not
   add unnecessary reactive invalidations.
4. Backfills and reconciliation jobs use cursor-based internal mutations or a migration workflow.
   They must not use dashboard queries to rebuild counts.
5. While stats are missing during rollout, the UI should show loaded counts or an unknown total
   state rather than scanning branch rows to recover an exact count.

The aggregate component is an acceptable future option if the branch stats need range counts,
rankings, or many independently maintained aggregate keys. For the first dashboard count need, a
single stats row plus optional label facet rows is simpler because branch and PR sync already own
the relevant snapshots.

### Cursor and live update behavior

Convex cursors describe positions in an ordered query, not immutable offsets. Reactive paginated
pages can grow or shrink when rows are inserted, deleted, or changed inside a loaded range. This is
expected and should not be treated as a cursor corruption case.

Dashboard implications:

1. A new branch inserted before the currently loaded range may appear in earlier loaded results as
   the reactive pages update.
2. A deleted or tombstoned branch can shrink a loaded page.
3. If query arguments, order, or filters change in a way that invalidates a cursor, the client
   pagination state should reset to the first page.
4. UI copy must distinguish loaded rows from total rows, for example "Loaded 20 of 214 branches"
   only when the `214` comes from stats.

### Dashboard branch sort contract

The historical branch order is:

1. active branches before deleted-upstream tombstones
2. default branch first
3. newest `lastCommitAt` first, missing timestamps last
4. branch name ascending

Convex pagination can only be stable and efficient when the database query order matches an index
order. If this exact dashboard order remains required, branch rows need materialized sort fields and
a matching index, for example:

1. `dashboardStateSort: 0 | 1`
2. `dashboardDefaultSort: 0 | 1`
3. `dashboardLastCommitSort: number`
4. `nameSortKey: string`
5. index `by_vault_and_dashboard_order`

The current `by_vault` pagination is safe for payload size, but its natural order is creation-order
based and does not encode the historical comparator. Do not promise the historical sort in a
paginated UI until the sort key/index exists.

### Branch-scoped vault read

Update query:

- `vault.getVaultByRepository({ repositoryFullName, branch?: string })`

Returns additive fields:

1. `resolvedBranch: string`
2. `defaultBranch?: string`

Behavior:

1. Resolve target branch from active branch catalog:
   `args.branch ?? activeDefaultBranch ?? firstActiveBranch ?? "main"`
2. Read tree/commit from `vaultBranchTrees` for `resolvedBranch`
3. Legacy fallback: if branch row missing, use existing `vault.treeData/commitSHA` only when
   `resolvedBranch` matches current default branch

### Branch-aware refresh

Update actions:

1. public file-view refresh: `github.refreshRepositoryTree({ vaultId, branch, trigger })`
2. backend-owned follow-up after repository writes:
   `internal.github.updateRepositoryTree({ userId, owner, repo, target, ...policy })`

Behavior:

1. Refresh only the requested branch tree
2. Use GitHub refs for branch-specific tree/commit reads
3. Write to `vaultBranchTrees`
4. Keep legacy `vault.treeData/commitSHA` in sync for default branch only

### Commit pipeline propagation

Update commit path to pass explicit branch to tree refresh:

1. `fileStagingActions.commitAllStaged` calls
   `internal.github.updateRepositoryTree(..., branch: commitBranch)`
2. Blob cache save reads branch tree from `vaultBranchTrees(commitBranch)`
3. Commit to `remoteState="deleted_upstream"` branch is blocked unless user explicitly chooses a
   recovery action that recreates or retargets the branch

## Routing and URL Contract

### Canonical routes

Use explicit branch param routes:

1. `/vault/:owner/:repoName/:branch`
2. `/vault/:owner/:repoName/:branch/*`
3. `/vault/:owner/:repoName/codespace/:branch/chat`
4. `/vault/:owner/:repoName` redirects to default branch route

### Encoding contract

1. Branch must be encoded as one URL segment with `encodeURIComponent`
2. Branch param must be decoded exactly once
3. Do not derive branch by splitting wildcard path

Implementation note:

1. Add a single route helper module to build/parse vault URLs
2. Replace ad-hoc string interpolation and regex parsing in dashboard/file/chat

## Dashboard UX Changes

For each ready vault card:

1. Render a branch list section populated from `vault.dashboard.listDashboardBranches`
2. Show the first branch page in a scrollable list region
3. Mark default branch with badge/label
4. Clicking a branch opens `/vault/:owner/:repoName/:encodedBranch`
5. Show a load-more affordance while the branch paginator can load more rows
6. Show exact total branch counts only from branch stats; otherwise show loaded counts without
   implying they are repository-wide totals

Constraints:

1. Keep existing no-placeholder UX style
2. Avoid noisy loading states; show branch list when available
3. Keep infra summary aligned to default branch until branch-scoped preview surfaces ship
4. Do not make filter result counts look global when filters only apply to the currently loaded
   branch pages
5. Keep branch subscriptions bounded by user action: loading more branch pages is explicit until a
   virtualized viewport can unload or avoid unseen branch pages

## Dashboard Branch Filtering Under Pagination

The implemented filter model in `specs/067_VAULT_BRANCH_FILTERS_SPEC.md` filters the branch rows
currently present on the client. Once branch rows are paginated, that model is loaded-page filtering
unless the backend accepts filter arguments and pages the filtered result itself.

Required UI truthfulness:

1. Client-side filters may hide loaded rows.
2. Client-side filters must not present `visible of total` as an exact repository-wide filtered
   count unless all branches are loaded or an exact backend filtered count exists.
3. Label option counts derived from loaded branch rows are loaded-label counts, not full-repository
   label facets.
4. Full-repository label facet counts must come from `vaultRemoteBranchLabelStats` or another
   maintained stats source.

Server-side exact branch filtering is a separate follow-up because the current inclusive
hidden-label checkbox model is not index-friendly. A branch can have many PR labels, and the filter
means "hide rows containing any hidden label", which is an anti-join across a dynamic label set. The
standard Convex-safe solutions are:

1. Keep filters loaded-only and label them as such.
2. Restrict exact server filters to index-friendly predicates such as `remoteState`,
   `pullRequestIsDraft`, `hasOpenPullRequest`, and one positive label at a time.
3. Add an inverted index table such as `vaultRemoteBranchLabels` for exact positive label
   membership, then design a bounded merge/dedupe strategy before promising multi-label OR/AND
   pagination.
4. Use an explicit GitHub search mode for ad-hoc PR search, with its own freshness/rate-limit/error
   state, rather than making dashboard rendering depend on GitHub search.

## Editor Behavior Changes

1. File view reads `branch` from explicit route param
2. Query vault via `getVaultByRepository({ repositoryFullName, branch })`
3. Use returned branch-scoped tree for file existence/navigation
4. Refresh tree with selected branch
5. Keep staging/commit preview/commit calls on selected branch (already mostly present)

Expected outcome:

1. Opening `feature/*` branch shows that branch’s tree and commit SHA
2. Committing in that view updates that branch’s head and cache

## Deleted-Upstream Branch Policy

When branch sync detects a branch no longer present on GitHub:

1. Do not hard-delete branch metadata immediately
2. Mark branch `remoteState="deleted_upstream"` and keep last known head SHA
3. If branch has staged/collaborative edits, keep branch visible in dashboard and editor as “deleted
   upstream”
4. Block normal commit to that branch by default
5. Offer explicit recovery actions:
   - recreate remote branch from last known head (or selected base), then commit
   - move staged changes to another active branch
   - discard staged changes for that branch
6. After branch has no staged/collaborative state, tombstone row may be garbage-collected

## Chat/Agent Integration Adjustments

1. `ChatFab` route context should use shared route parser (no hardcoded `main`)
2. `chat.confirmCommit` should pass thread branch when available to avoid ambiguous multi-branch
   staging commits
3. Agent system prompt repo tree context should come from selected branch cache (or branch fetch),
   not default-only vault tree
4. Tool catalog copy for `commit_and_push` should remove hardcoded “main branch”
5. Commit approval UI must surface branch deleted-upstream status and require a recovery action
   before commit can proceed

## Migration and Delivery Strategy

Delivery is intentionally phased; this work should not ship as one large change.

Companion plan with concrete tasks and gates:

1. `rfcs/046_VAULT_MULTI_BRANCH_ROLLOUT_PLAN.md`

### Delivery Phases

1. Phase 1: remote branch catalog + dashboard list + read-only navigation
2. Phase 2: branch-safe routing contract and branch context plumbing
3. Phase 3: branch-scoped tree cache + branch-aware refresh/commit/chat paths
4. Phase 4: remove runtime dependency on legacy `vault.treeData/commitSHA` (completed by vault-first
   Phase 4)
5. Phase 5: deleted-upstream recovery UX + tombstone cleanup
6. Phase 6: dashboard branch pagination safety: remove all-branches dashboard payloads, add
   stats-backed counts, and make filters pagination-honest

### Implementation Snapshot (PR #174)

Completed:

1. Phase 1 shipped (branch catalog + dashboard list/navigation)
2. Phase 2 shipped (shared route parser/builder + encoded branch handling + no hardcoded `main`
   route defaults + codespace chat moved under `/codespace/:branch/chat`)
3. Phase 3 shipped (branch-scoped tree cache, branch-aware refresh comparisons, branch-aware
   chat/commit propagation, tests)
4. Phase 4 runtime and schema cleanup shipped through the vault-first compatibility cleanup;
   production data cleanup is the pre-merge deploy gate

Pending:

1. Phase 5: deleted-upstream recovery UX and commit guardrails
2. Optional follow-up: decouple branch catalog sync cadence from every tree refresh call
3. Phase 6 follow-up: stats-backed dashboard branch totals and pagination-safe filter facets

### Step 1: additive schema

1. Add `vaultRemoteBranches`
2. Add `vaultBranchTrees`

### Step 2: bootstrap existing vaults lazily

1. On first dashboard load/sync, fetch remote branches and derive default from active `isDefault`
   row
2. Seed `vaultBranchTrees(defaultBranch)` from legacy `vault.treeData/commitSHA` when available
3. Backfill non-default branches on demand when opened

### Step 3: switch reads

1. Move FileView and dashboard branch list to new contracts
2. Keep legacy fields as fallback only during transition

### Step 4: cleanup

1. Remove fallback reads from `vault.treeData/commitSHA`
2. Remove legacy writes in branch refresh paths
3. Remove remaining runtime call sites that depend on legacy single-branch fields
4. Clear production rows that still contain old vault-row mirrors before deploy
5. Drop legacy single-branch fields from schema

### Step 5: dashboard cardinality cleanup

1. Move the shipped dashboard to `listDashboardVaults` for vault cards and `listDashboardBranches`
   for branch rows
2. Stop returning populated `remoteBranches` from new dashboard vault-card reads
3. Add branch stats tables and keep them current from branch/PR sync writers
4. Backfill stats in batches before displaying exact total counts
5. Replace loaded-page count copy with stats-backed total copy where available
6. Revisit branch filters with an explicit loaded-only or server-filtered contract

## Failure Handling

1. If branch catalog sync fails, keep last synced list and log error
2. If selected branch is deleted upstream:
   - if no staged/collaborative state, redirect to default branch
   - if staged/collaborative state exists, open in deleted-upstream recovery state (no silent
     redirect)
3. If branch tree refresh fails, preserve last known tree for that branch
4. Respect existing debounce/lock/stale-lock behavior to avoid refresh storms

## Testing Plan

### Backend

1. `refreshVaultRemoteBranches` paginates and upserts correctly
2. Default branch changes are reflected through active `isDefault` branch row
3. Branch tree refresh writes/reads by `(vaultId, branch)`
4. Commit on non-default branch updates that branch tree cache
5. Legacy fallback is not required for default-branch editor/read paths after branch cache backfill
6. Missing upstream branches are tombstoned, not hard-deleted, when branch-local staged state exists
7. Tombstoned branch rows are garbage-collected only after staged/collab state is empty
8. `listDashboardVaults` returns paginated vault cards without branch rows
9. `listDashboardBranches` returns a paginated branch page for one authorized vault
10. Branch stats backfill and sync updates produce exact counts for the latest completed sync
    without reading all branches from dashboard queries
11. Branch stats writers skip no-op patches when counts do not change

### Frontend

1. Dashboard renders the first branch page for each ready vault
2. Clicking branch navigates to encoded branch route
3. Route parser handles `feature/x`, `bugfix/foo-bar`, and encoded characters
4. FileView on non-default branch uses branch-specific tree and commit SHA
5. Deleted-upstream branch with staged edits is visibly flagged and does not disappear from branch
   list
6. Load-more fetches additional branch pages for the selected vault without reloading other vault
   cards
7. Branch count copy distinguishes loaded-row counts from stats-backed total counts
8. Filters over loaded rows do not display exact repository-wide filtered counts unless all branches
   are loaded or backend filtered totals exist

### Regression

1. Existing `main` flow remains unchanged
2. Staging isolation across branches remains enforced
3. Chat commit approval still works when one branch is active
4. Branch sync does not accidentally discard uncommitted branch-scoped work

## Acceptance Criteria

1. Dashboard card shows remote branches for each ready vault without loading all branch rows for all
   vaults in the initial dashboard query
2. Clicking a branch opens editor for that exact branch
3. Editor tree and commit SHA are branch-correct
4. Branch names containing `/` work end-to-end in routing and API calls
5. Commit from non-default branch refreshes and displays that branch state
6. Deleted-upstream branches with uncommitted work are preserved as tombstones until user resolves
   that work
7. No regression for existing default-branch users
8. Exact branch totals, when shown, come from maintained stats rather than `collect().length` or
   loaded page length
9. Dashboard filter counts are either explicitly loaded-only or backed by exact
   stats/server-filtered results

## Deferred Follow-Ups

1. Branch create/delete/switch shortcuts from UI
2. Branch-specific connected-machine launch UX
3. Branch-scoped infra preview domain surfacing in dashboard
4. Branch-scoped thread model (optional UX improvement)
5. Agent-owned sandbox model for branch presence: prefer one sandbox per agent, not one sandbox per
   branch. Agents may create worktrees inside their sandbox when needed, and dashboard
   facepiles/avatar circles should reflect that sandbox/worktree activity per branch.
6. Exact server-side branch filtering for multi-label include/exclude semantics
7. Optional GitHub search mode for ad-hoc PR queries that are not worth caching into the dashboard
   hot path
