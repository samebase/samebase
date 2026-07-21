# Dashboard Vault PR Refresh Investigation

## Problem Statement

The dashboard can show stale branch and pull request data for a vault, which makes PR review
unreliable. The working hypothesis is that the vault refresh pipeline does not prioritize newly
updated remote branches and PR metadata, so recently active branches may be missing or delayed even
when the repository has changed upstream.

## Scope

- Trace how the dashboard reads vault branch and PR state.
- Find which jobs, queries, or mutations refresh `vaultRemoteBranches`.
- Check whether refresh scheduling or pruning logic ignores recency.
- If the cause is clear, ship the smallest safe fix and document it here.

## Supersession Note

This investigation and the later repository refresh queue are both superseded. Use
`specs/115_PULL_REQUEST_PROVIDER_QUERY_SPEC.md`: the dashboard reads GitHub pull request pages live
through TanStack Query and has no repository refresh queue or branch mirror. The remainder of this
file is historical investigation, not current implementation guidance.

## Initial Hypotheses

1. The dashboard reads from cached `vaultRemoteBranches` data that is only updated
   opportunistically.
2. The sync path may cap refreshed branches without sorting by GitHub `updatedAt`, so recently
   active PR branches can be dropped.
3. The UI may choose stale vault data even when fresher branch metadata exists.

## Investigation Log

- Started from a clean detached worktree, bootstrapped with `pnpm dev:worktree:once`, then created
  branch `codex/nimble-ember-orbit`.
- Rebased onto `origin/main` before starting implementation.
- Confirmed the dashboard reads branch and PR state from `apps/noter/convex/vault.ts#getUserVaults`,
  which serves cached `vaultRemoteBranches` rows sorted by default-branch pinning, then
  `lastCommitAt`, then name.
- Confirmed `vaultRemoteBranches` is written only by
  `apps/noter/convex/github.ts#syncRepositoryMetadata`, which calls `listRemoteBranches()` and then
  `internal.vault.syncVaultRemoteBranches`.
- Confirmed the dashboard auto-refresh path in
  `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx` calls
  `api.github.refreshRepositoryTree` on `page_load` and `visibility`.
- Confirmed `refreshRepositoryTree()` can refresh branch tree data without syncing repo metadata.
  That means the dashboard can show a fresh default tree while still showing stale
  `vaultRemoteBranches` rows.
- Confirmed the current repo-metadata freshness gate is `REPOSITORY_METADATA_STALE_MS = 10 minutes`
  in `apps/noter/shared/treeRefresh.ts`.
- Confirmed existing tests in `apps/noter/convex/github.test.ts` intentionally keep repo metadata on
  the cached path while it is still fresh.
- Traced the policy back to commit `2dc72492` (`Reduce GitHub sync traffic in phase 2 (#352)`),
  which introduced the repo-metadata freshness gate and the split between tree refresh and
  repo-metadata refresh.

## Findings

1. The stale dashboard branch/PR issue is primarily a refresh-policy problem, not a sorting problem.
2. The dashboard branch list and PR metadata come entirely from cached `vaultRemoteBranches` rows,
   not from the branch-tree refresh path.
3. On dashboard `page_load`, the app may still skip repo-metadata sync when the latest
   `vaultRemoteBranches.lastSyncedAt` is less than 10 minutes old.
4. When that happens, users can open the dashboard shortly after a new branch or PR appears on
   GitHub and still not see it, even though the dashboard may run a branch-tree refresh and look
   otherwise fresh.
5. This behavior matches the complaint that the dashboard becomes unreliable for reviewing the
   latest PRs.
6. The regression is tied to the Phase 2 GitHub traffic reduction work in commit `2dc72492`, so the
   dashboard staleness is an optimization tradeoff, not an accidental UI-only bug.

## Proposed Fix

Implemented:

1. `apps/noter/src/lib/treeRefreshStatus.ts`
   - Change dashboard `page_load` auto-refresh to always trigger once for ready vaults, instead of
     skipping refreshes when both tree and repo metadata look fresh locally.
2. `apps/noter/convex/github.ts`
   - Change repo-scoped `page_load` refresh planning to always sync repo metadata, even when
     `lastRepositoryMetadataRefreshAt` is still inside the 10-minute freshness window.
3. Keep `visibility` and `focus` behavior conservative:
   - `visibility` remains stale-gated.
   - `focus` still stays on the tree-only path.

Why this shape:

- It restores the expectation that opening the dashboard gives you the current branch/PR catalog.
- It avoids bringing back repeated repo-wide fan-out on every tab resume or focus event.
- It keeps the fix local to the dashboard page-load path instead of widening refresh policy
  everywhere.

Follow-up worth considering:

1. Replace the time-only freshness heuristic with a cheap GitHub repository `updated_at` probe so
   page-load metadata sync can become conditional on real upstream changes instead of always-on for
   dashboard entry.

## Validation

Automated:

1. `pnpm exec vitest run apps/noter/convex/github.test.ts apps/noter/src/lib/treeRefreshStatus.test.ts`
   - Passed: `67` tests

Coverage added/updated:

1. `apps/noter/convex/github.test.ts`
   - Added coverage that repo-scoped `page_load` refreshes sync metadata even when cached metadata
     is still fresh.
2. `apps/noter/src/lib/treeRefreshStatus.test.ts`
   - Added coverage that dashboard `page_load` auto-refresh now runs even when both tree and
     metadata timestamps look fresh locally.

Manual validation:

1. Not run in the browser during this pass.

## Remaining Tradeoff

The current fix intentionally favors freshness on dashboard entry over the strictest GitHub request
minimization. It still avoids repo-wide fan-out on plain `focus` and keeps `visibility` resumes
stale-gated, but page-load dashboard entry now always reconciles repo metadata once per vault.
