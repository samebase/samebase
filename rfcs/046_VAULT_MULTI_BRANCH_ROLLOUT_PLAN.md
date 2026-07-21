# 046 Vault Multi-Branch Rollout Plan

## Document Control

- Status: Superseded
- Owner: Noter frontend/editor + Convex vault/github
- Last updated: 2026-03-08
- Depends on:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`

This rollout describes the deleted repository-wide branch mirror. The current contract is
`specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md`: the dashboard reads live GitHub pull request pages,
while only exact editor branch trees remain cached.

## Delivery Status Snapshot (2026-03-08)

1. Phase 1: complete in PR #174
2. Phase 2: complete in PR #174
3. Phase 3: complete in PR #174
4. Phase 4: pending (next PR, required)
5. Phase 5: pending

Implemented highlights in PR #174:

1. Added `observations_vaultRepository_branches` and `observations_vaultRepository_branchTrees`
   storage
2. Added branch-aware vault read path (`getVaultByRepository(..., branch?)`)
3. Hardened `updateRepositoryTree` to keep legacy `vault.treeData/treeSHA/commitSHA`
   default-branch-only while writing branch-scoped cache for all branches
4. Propagated branch through commit/chat/staging read paths
5. Moved codespace chat route to `/vault/:owner/:repoName/codespace/:branch/chat`
6. Added shared vault route helpers + tests
7. Left legacy cache fallback in place temporarily for compatibility while branch caches backfill

## Purpose

Break multi-branch support into low-risk slices with clear acceptance gates.

## Principles

1. Ship useful user value early (branch visibility + navigation)
2. Remove temporary compatibility paths quickly once branch caches are stable
3. Fail closed for destructive branch-sync cases
4. Never discard uncommitted work implicitly

## Phase 1: Branch Catalog + Dashboard List (Read-Only)

### Scope

1. Add `observations_vaultRepository_branches` table and sync action
2. Add `vault.getVaultRemoteBranches`
3. Show remote branch list in each ready vault card
4. Clicking a branch navigates to vault URL for that branch

### Out of Scope

1. Branch-scoped tree cache migration
2. Commit-path changes
3. Deleted-upstream recovery UX

### Validation

1. Branch list matches GitHub remote refs for connected repos
2. Default branch appears first and is labeled
3. No regression for vault cards with no branch sync yet

### Exit Criteria

1. Dashboard branch list is visible and clickable for ready vaults
2. `main`-only behavior still works for users not using other branches

## Phase 2: Branch-Safe Routing and Context Plumbing

### Scope

1. Move to explicit branch param routing for vault editor routes and non-colliding codespace chat
   namespace
2. Add shared URL builder/parser for vault paths
3. Ensure branch names containing `/` are encoded/decoded safely
4. Replace hardcoded `main` fallbacks in route context extraction

### Out of Scope

1. Branch-scoped tree refresh store
2. Deleted-upstream commit recovery

### Validation

1. Branches like `feature/oauth/login` route correctly
2. ChatFab and FileView derive identical branch context from URL
3. Existing links and redirects still work

### Exit Criteria

1. Route-level branch correctness is deterministic for all supported branch names
2. No path parsing ambiguity remains between branch and file path

## Phase 3: Branch-Scoped Tree Cache + Commit/Chat Hardening

### Scope

1. Add `observations_vaultRepository_branchTrees` table
2. Make tree refresh branch-aware and store by `(vaultId, branch)`
3. Update vault read path to resolve branch-scoped tree/commit state
4. Pass explicit branch through commit refresh paths
5. Pass thread branch into commit approval path where available

### Out of Scope

1. Recovery UX for deleted-upstream branches

### Validation

1. Opening different branches shows correct tree and commit SHA
2. Commit on non-default branch updates correct branch cache
3. Chat commit approval still works and targets expected branch

### Exit Criteria

1. Editor state is branch-correct end-to-end
2. Legacy `vault.treeData/commitSHA` remains compatible as fallback during rollout

### Implementation Notes (Completed)

1. Added `observations_vaultRepository_branchTrees` table with `by_vault_and_branch` index
2. Added internal `vault.getVaultBranchTree` and `vault.upsertVaultBranchTree`
3. `github.updateRepositoryTree` now:
   - resolves requested/default branch,
   - compares against branch-scoped cache,
   - writes branch-scoped cache for selected branch,
   - updates legacy vault tree fields only for default branch
4. `chat.confirmCommit` now passes thread branch into `fileStagingActions.commitAllStaged`
5. Agent system prompt repo tree context now reads selected branch tree when available
6. Batch repo file reads for Monaco now accept a branch to avoid stale default tree reads

## Phase 4: Legacy Cache Removal (Required Next PR)

### Scope

1. Remove runtime fallback reads from legacy `vault.treeData/treeSHA/commitSHA` in branch-selection
   paths
2. Stop writing legacy tree/commit fields from branch refresh flows
3. Ensure default-branch reads refresh/backfill `observations_vaultRepository_branchTrees` instead
   of reading legacy fields
4. Migrate remaining runtime call sites that still read legacy single-branch fields (for example
   infra config/read paths) to branch-scoped sources
5. Drop legacy single-branch tree fields from `vaults` schema after runtime dependency is removed

### Validation

1. Opening default/non-default branches works with only `observations_vaultRepository_branchTrees`
2. `updateRepositoryTree` no longer patches legacy tree/commit fields
3. Search for runtime `vault.treeData`/`vault.treeSHA`/`vault.commitSHA` usage returns no legacy
   fallback dependencies
4. Existing branch navigation, staging, commit, and Monaco batch reads stay green

### Exit Criteria

1. No runtime read/write path depends on legacy single-branch vault cache
2. Branch-scoped cache is the only source of truth for editor tree/commit data
3. Tests cover missing-branch-cache behavior without legacy fallback

### Timeline and Blocking Criteria

1. Target window: execute in the next PR immediately after PR #174 lands on `main` (no parallel
   feature work that adds new `vault.treeData` reads).
2. Block merge if any runtime `vault.treeData`, `vault.treeSHA`, or `vault.commitSHA` access remains
   in branch selection/editor/staging paths.
3. Block merge if build/lint/test is not green for both Convex and frontend packages after
   legacy-field removal.
4. Block merge if branch navigation or commit flows require restoring a runtime legacy fallback
   during QA.

## Phase 5: Deleted-Upstream Branch Recovery + Safe Cleanup

### Scope

1. Add branch tombstone semantics in sync (`remoteState="deleted_upstream"`)
2. Preserve tombstoned branches when branch-scoped staged/collab state exists
3. Block default commit on deleted-upstream branch until explicit recovery choice
4. Add recovery actions:
   - recreate branch upstream
   - retarget staged changes
   - discard staged changes
5. Add tombstone garbage collection only after staged/collab state is empty

### Validation

1. Deleted-upstream branch with staged edits remains visible
2. No implicit data loss when upstream branch disappears
3. Tombstoned branch is eventually cleaned after user resolves local state

### Exit Criteria

1. Upstream branch deletion never silently destroys branch-scoped uncommitted work
2. Recovery path is explicit and test-covered

## Cross-Phase Test Matrix

1. Repo default branch is not `main`
2. Branch name contains `/`
3. Branch name contains URL-sensitive characters
4. Multiple branches with staged edits in one vault
5. Branch deleted upstream with staged edits
6. Branch deleted upstream with no local edits

## Rollout Controls

1. Keep additive schema changes first
2. Gate UI usage on available data; avoid blocking dashboard if sync is pending
3. Legacy fallback reads are allowed only until Phase 4 begins, then removed within that PR
4. If rollback is needed after Phase 4, revert to pre-Phase-4 code and rebuild branch caches from
   GitHub (do not reintroduce runtime legacy fallbacks)

## Definition of Done

1. All phase exit criteria pass
2. Multi-branch dashboard and editor behavior is stable in manual and automated validation
3. No known data-loss path for branch deletion + uncommitted work
4. Legacy single-branch vault cache is removed from runtime behavior
