# 065 GitHub Repository Picker Discovery Spec

## Document Control

- Status: Implemented
- Owner: Vault add flow + GitHub integration
- Last updated: 2026-08-07
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Summary

The `/org/<owner>/connect-repo` route must let a Samebase organization member discover every
repository available to that organization's GitHub App installation, including repositories renamed
or moved within that installation owner.

Two concrete requirements define that behavior:

1. `github.listRepositories` must enumerate the full accessible repository set, not just the first
   GitHub results page.
2. The repository search UI must match repository name, owner slug, and full `owner/repo`
   identifier, so an ownership transfer does not make the repo appear missing.

## Problem Statement

Before this change:

1. `github.listRepositories` fetched a single `GET /user/repos` page with `per_page=100`, so users
   with more than 100 accessible repositories could never discover repos beyond page 1.
2. The repository picker only searched `repo.name`, so a repo transfer that changed only the owner
   slug made the repo unsearchable by its new organization name.

That combination made transferred org-owned repositories look absent even when GitHub would allow
Samebase to connect them.

## Source Of Truth Files

- `apps/samebase/convex/github.ts`
- `apps/samebase/src/components/ConnectRepository.tsx`
- `apps/samebase/src/lib/repositorySearch.ts`

## Runtime Contract

### Backend repository discovery

`github.listRepositories` is the single source of truth for the raw candidate repository list shown
on `/org/<owner>/connect-repo`.

Behavior:

1. Resolve the selected Samebase organization and its GitHub App installation.
2. Call GitHub `GET /installation/repositories` with an installation token.
3. Follow pagination until GitHub no longer returns `rel="next"` in the `Link` header.
4. Normalize each repository to the existing `githubRepositoryListItem` contract.
5. Deduplicate by GitHub repository id before returning the final list.

Result:

- Members can discover every repository granted to the selected GitHub App installation, including
  repositories beyond the first 100 results.

### Frontend search behavior

`ConnectRepository` performs client-side filtering over the backend result set.

Search must fuzzy-match across:

1. `repo.name`
2. repository owner slug (derived from `repo.full_name`)
3. full `repo.full_name`

The UI continues to hide repositories already connected as vaults by exact `repositoryFullName`
match.

## Non-Goals

1. Server-side search queries to GitHub while typing
2. Bypassing GitHub App installation repository selection or organization restrictions
3. Changing the connect flow after a repository is selected

## External Constraint

Repository discovery is limited to repositories granted to the Samebase GitHub App installation. A
GitHub installation administrator controls whether the installation covers all repositories or a
selected set. Samebase organization membership does not change that GitHub repository selection.
When a repository is missing, an installation administrator must update the Samebase App's GitHub
installation access. Reconnecting a personal GitHub user authorization does not widen installation
access.

## Acceptance Checklist

- [x] A repo transferred from `user/repo` to `org/repo` can be found by typing `org`.
- [x] A user with more than 100 accessible repositories can still discover repos beyond the first
      GitHub page.
- [x] Existing connected vaults remain filtered out from `/org/<owner>/connect-repo`.
