# 046 Vault Multi-Branch Rollout Plan

## Document Control

- Status: Proposed
- Owner: Noter frontend/editor + Convex vault/github
- Last updated: 2026-03-08
- Depends on:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`

## Purpose

Break multi-branch support into low-risk slices with clear acceptance gates.

## Principles

1. Ship useful user value early (branch visibility + navigation)
2. Preserve backward compatibility for existing default-branch flows
3. Fail closed for destructive branch-sync cases
4. Never discard uncommitted work implicitly

## Phase 1: Branch Catalog + Dashboard List (Read-Only)

### Scope

1. Add `vaultRemoteBranches` table and sync action
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

1. Move to explicit branch param routing for vault editor/chat routes
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

1. Route-level branch correctness is deterministic for all supported branch
   names
2. No path parsing ambiguity remains between branch and file path

## Phase 3: Branch-Scoped Tree Cache + Commit/Chat Hardening

### Scope

1. Add `vaultBranchTrees` table
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
2. Legacy `vault.treeData/commitSHA` remains compatible as fallback during
   rollout

## Phase 4: Deleted-Upstream Branch Recovery + Safe Cleanup

### Scope

1. Add branch tombstone semantics in sync (`remoteState="deleted_upstream"`)
2. Preserve tombstoned branches when branch-scoped staged/collab state exists
3. Block default commit on deleted-upstream branch until explicit recovery
   choice
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

1. Upstream branch deletion never silently destroys branch-scoped uncommitted
   work
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
3. Preserve legacy fallback reads until Phase 4 exit
4. Roll back by disabling new reads and falling back to legacy single-branch
   vault fields if needed

## Definition of Done

1. All phase exit criteria pass
2. Multi-branch dashboard and editor behavior is stable in manual and automated
   validation
3. No known data-loss path for branch deletion + uncommitted work
