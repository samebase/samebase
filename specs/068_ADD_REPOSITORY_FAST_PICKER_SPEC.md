# 068 Add Repository Fast Repository Picker Spec

## Document Control

- Status: Accepted
- Owner: Repository add flow + GitHub integration
- Last updated: 2026-08-15
- Related specs:
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Summary

The `/org/<owner>/connect-repo` route should feel immediate for GitHub App installations with many
repositories without regressing the full-discovery guarantee from Spec 065.

The repository picker therefore adopts a two-phase load:

1. fetch a small preview page and order it by GitHub `updated_at`
2. render that preview immediately
3. continue loading the full accessible repository set in the background
4. make partial-search state explicit until the background load completes

This keeps the initial screen fast while preserving eventual access to every repository that
Samebase can connect.

## Problem Statement

The repository picker previously waited for `github.listRepositories` to enumerate the full
installation repository set before the user can interact with the list.

That is correct for completeness, but it delays first paint for users with many accessible
repositories even though the most recently updated repositories are usually the ones they are trying
to connect.

At the same time, simply shrinking the existing full discovery page size would make total load time
worse because the backend would still block on every page before returning.

## Product Decisions (Locked)

1. Every returned candidate set is ordered by GitHub `updated_at` descending, then by full name and
   repository id for stable ties.
2. The initial preview fetch requests `per_page=10`.
3. The authoritative full discovery pass remains `per_page=100`.
4. `github.listRepositories` remains the source of truth for the complete candidate set required by
   Spec 065.
5. Partial results may be rendered immediately, but partial search must never be presented as final.
6. Alphabetical ordering is not used for the default empty-state list.

## Current State

Today:

1. `github.listRepositories` calls GitHub `GET /installation/repositories` with `per_page=100`
   through the selected organization's installation token.
2. `ConnectRepository` renders the first ten repositories immediately.
3. The complete `per_page=100` scan continues in the background when more repositories exist.
4. Each returned candidate set is ordered by `updated_at` descending.
5. Search is client-side and reports when its current results are still partial.

## Source of Truth Files

- `apps/samebase/convex/github.ts`
- `apps/samebase/src/repository/setup/ConnectRepository.tsx`
- `apps/samebase/src/repository/setup/repositorySearch.ts`

## Runtime Contract

### Phase 1: Preview fetch

Add a lightweight preview discovery path for `/org/<owner>/connect-repo`.

Behavior:

1. Resolve the selected Samebase organization and its GitHub App installation.
2. Call GitHub `GET /installation/repositories` with:
   - `per_page=10`
3. Normalize repositories to the existing `githubRepositoryListItem` contract.
4. Order the loaded preview page by `updated_at` descending, then by full name and repository id.
5. Return:
   - the preview repositories
   - whether more repositories remain to be loaded

The installation endpoint does not support `sort`. The preview contains its first page, ordered by
update time within that loaded page. The complete scan establishes the global order.

### Phase 2: Background full discovery

If the preview response indicates that more repositories exist, `/org/<owner>/connect-repo`
immediately starts the existing full discovery action in the background.

Behavior:

1. Reuse `github.listRepositories` as the authoritative full-set fetch.
2. Keep its current `per_page=100` GitHub requests.
3. Follow pagination until a short page arrives or the number of unique repositories reaches
   GitHub's `total_count`.
4. Deduplicate by GitHub repository id.
5. Order the complete candidate set by `updated_at` descending, then by full name and repository id.
6. Replace the preview list with the completed full list once ready.

Important rule:

- The background load is authoritative. The preview is only a latency optimization, not a second
  source of truth.

### Search semantics while background loading

Client-side search continues to operate over the currently loaded repositories, but the UI must
distinguish between:

1. partial search results while the background full load is still running
2. final search results after the full load completes

Rules:

1. If background loading is still in progress, do not present an empty search result as final.
2. When the current loaded subset has no matches and the full load is still in progress, show a
   transient loading message instead of `No repositories match your search`.
3. Once the full load completes, the existing final empty state behavior may apply.

### Interaction rules

1. A repository shown in the preview list may be connected immediately.
2. Background loading must not block repository selection.
3. Existing connected repositories remain filtered out by exact `repositoryFullName` match during
   both preview and final states.

### Failure handling

1. If the preview request fails, keep the current blocking error behavior.
2. If the preview succeeds but the background full load fails:
   - keep the preview repositories visible
   - show a non-blocking retry affordance for loading the rest
   - do not discard the preview results

## Non-Goals

- true per-user `last used by me` ranking
- server-side search queries to GitHub while typing
- alphabetical default ordering
- changing the connect flow after a repository is selected
- speculative heuristics beyond GitHub `updated` ordering

## Acceptance

- [ ] A GitHub-connected user with more than 10 accessible repositories sees an update-ordered
      preview before the full scan completes.
- [ ] A GitHub-connected user with 10 or fewer accessible repositories sees the complete list
      without requiring a second discovery pass.
- [ ] The final completed list is globally ordered by `updated_at` descending and still satisfies
      Spec 065 full-discovery behavior.
- [ ] Search UI clearly indicates when background loading means results are still partial.
- [ ] Existing connected repositories remain filtered out in both preview and final states.
